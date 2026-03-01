import type { Command } from './Command';
import type { Seat, Row, ElementId, MapElement } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { angleBetween } from '@/src/utils/math';
import type { Point } from '@/src/domain/geometry';

export class ContractRowCommand implements Command {
  readonly name = 'Contract Row';

  constructor(
    private engine: EditorEngine,
    private rowId: ElementId,
    private removedSeats: Seat[],
    private side: 'left' | 'right',
    private originalRow: Row,
  ) {}

  execute(): void {
    const removedIds = new Set(this.removedSeats.map(s => s.id));
    const row = this.engine.state.get(this.rowId) as Row;
    if (!row) return;

    const remainingSeatIds = this.originalRow.seatIds.filter(id => !removedIds.has(id));

    // 1. Remove seats from engine
    this.engine.removeElements(this.removedSeats.map(s => s.id));

    // 2. Preserve curveRadius and curveDefinition — remaining seats stay in place on the same parabola

    // 3. Recompute bounds from remaining seat positions
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const seatId of remainingSeatIds) {
      const seat = this.engine.state.get(seatId) as Seat | undefined;
      if (!seat) continue;
      const pos = seat.transform.position;
      const r = seat.radius;
      minX = Math.min(minX, pos.x - r);
      minY = Math.min(minY, pos.y - r);
      maxX = Math.max(maxX, pos.x + r);
      maxY = Math.max(maxY, pos.y + r);
    }

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    // Sync orientationAngle to actual first-to-last seat direction
    let orientationAngle = row.orientationAngle;
    if (remainingSeatIds.length >= 2) {
      const firstSeat = this.engine.state.get(remainingSeatIds[0]) as Seat | undefined;
      const lastSeat = this.engine.state.get(remainingSeatIds[remainingSeatIds.length - 1]) as Seat | undefined;
      if (firstSeat && lastSeat) {
        orientationAngle = angleBetween(
          firstSeat.transform.position,
          lastSeat.transform.position,
        );
      }
    }

    const updatedRow: Row = {
      ...row,
      orientationAngle,
      seatIds: remainingSeatIds,
      transform: {
        ...row.transform,
        position: { x: midX, y: midY },
        rotation: orientationAngle,
      },
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
    this.engine.state.set(this.rowId, updatedRow);
    this.engine.spatialIndex.update(updatedRow);

    // 4. Relabel all seats in the label group (continuous numbering across rows)
    const groupUpdatedSeats = this.engine.rowGrouping.renumberLabelGroup(updatedRow.label);

    const allUpdated: MapElement[] = [updatedRow, ...groupUpdatedSeats];
    for (const seatId of remainingSeatIds) {
      if (!groupUpdatedSeats.some(s => s.id === seatId)) {
        const seat = this.engine.state.get(seatId);
        if (seat) allUpdated.push(seat);
      }
    }

    this.engine.events.emit('elements:updated', { elements: allUpdated });
    this.engine.events.emit('render:request', {});
  }

  undo(): void {
    // Re-add removed seats
    this.engine.addElements(this.removedSeats);

    // Restore original row
    this.engine.state.set(this.rowId, this.originalRow);
    this.engine.spatialIndex.update(this.originalRow);

    // Renumber the label group to restore continuous numbering
    const groupUpdatedSeats = this.engine.rowGrouping.renumberLabelGroup(this.originalRow.label);

    const allUpdated: MapElement[] = [this.originalRow, ...groupUpdatedSeats];
    for (const seatId of this.originalRow.seatIds) {
      if (!groupUpdatedSeats.some(s => s.id === seatId)) {
        const seat = this.engine.state.get(seatId);
        if (seat) allUpdated.push(seat);
      }
    }

    this.engine.events.emit('elements:updated', { elements: allUpdated });
    this.engine.events.emit('render:request', {});
  }
}
