import type { Command } from './Command';
import type { Seat, Row, ElementId, MapElement } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { angleBetween } from '@/src/utils/math';
import type { Point } from '@/src/domain/geometry';

export class ExtendRowCommand implements Command {
  readonly name = 'Extend Row';

  constructor(
    private engine: EditorEngine,
    private rowId: ElementId,
    private newSeats: Seat[],
    private side: 'left' | 'right',
    private originalRow: Row,
  ) {}

  execute(): void {
    // 1. Add new seats to engine
    this.engine.addElements(this.newSeats);

    // 2. Update row: append/prepend seatIds
    const row = this.engine.state.get(this.rowId) as Row;
    if (!row) return;

    const newSeatIds = this.newSeats.map(s => s.id);
    const updatedSeatIds = this.side === 'right'
      ? [...row.seatIds, ...newSeatIds]
      : [...newSeatIds.reverse(), ...row.seatIds];

    // 3. Recompute bounds from all seat positions (new seats are already positioned on the parabola)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const seatId of updatedSeatIds) {
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

    // 4. Preserve curveRadius and curveDefinition — the curve shape stays the same
    //    New seats are already positioned on the parabola continuation by SelectionTool

    // Sync orientationAngle to actual first-to-last seat direction
    let orientationAngle = row.orientationAngle;
    if (updatedSeatIds.length >= 2) {
      const firstSeat = this.engine.state.get(updatedSeatIds[0]) as Seat | undefined;
      const lastSeat = this.engine.state.get(updatedSeatIds[updatedSeatIds.length - 1]) as Seat | undefined;
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
      seatIds: updatedSeatIds,
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

    // 5. Relabel all seats in the label group (continuous numbering across rows)
    const groupUpdatedSeats = this.engine.rowGrouping.renumberLabelGroup(updatedRow.label);

    const allUpdated: MapElement[] = [updatedRow, ...groupUpdatedSeats];
    // Also include this row's seats that weren't caught by group renumber (shouldn't happen, but safe)
    for (const seatId of updatedSeatIds) {
      if (!groupUpdatedSeats.some(s => s.id === seatId)) {
        const seat = this.engine.state.get(seatId);
        if (seat) allUpdated.push(seat);
      }
    }

    this.engine.events.emit('elements:updated', { elements: allUpdated });
    this.engine.events.emit('render:request', {});
  }

  undo(): void {
    // Remove added seats
    const newSeatIds = this.newSeats.map(s => s.id);
    this.engine.removeElements(newSeatIds);

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
