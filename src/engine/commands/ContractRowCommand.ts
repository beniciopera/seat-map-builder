import type { Command } from './Command';
import type { Seat, Row, ElementId } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { propagateRowLabel } from '@/src/domain/labels';
import { arcFromSagitta, distance } from '@/src/utils/math';

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

    // 1. Compute arc geometry BEFORE removing seats (so all seats are still accessible)
    let newCurveRadius = row.curveRadius;
    if (row.curveRadius && Math.abs(row.curveRadius) > 2 && remainingSeatIds.length >= 2) {
      const oldFirstSeat = this.engine.state.get(this.originalRow.seatIds[0]) as Seat | undefined;
      const oldLastSeat = this.engine.state.get(this.originalRow.seatIds[this.originalRow.seatIds.length - 1]) as Seat | undefined;
      if (oldFirstSeat && oldLastSeat) {
        const arc = arcFromSagitta(oldFirstSeat.transform.position, oldLastSeat.transform.position, row.curveRadius);
        const newFirst = this.engine.state.get(remainingSeatIds[0]) as Seat | undefined;
        const newLast = this.engine.state.get(remainingSeatIds[remainingSeatIds.length - 1]) as Seat | undefined;
        if (newFirst && newLast) {
          const newChord = distance(newFirst.transform.position, newLast.transform.position);
          const halfChord = newChord / 2;
          if (halfChord < arc.radius) {
            const sign = row.curveRadius > 0 ? 1 : -1;
            newCurveRadius = sign * (arc.radius - Math.sqrt(arc.radius * arc.radius - halfChord * halfChord));
          }
        }
      }
    }

    // 2. Remove seats from engine
    this.engine.removeElements(this.removedSeats.map(s => s.id));

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

    const updatedRow: Row = {
      ...row,
      seatIds: remainingSeatIds,
      curveRadius: newCurveRadius,
      transform: {
        ...row.transform,
        position: { x: midX, y: midY },
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

    // 5. Relabel remaining seats
    const labels = propagateRowLabel(updatedRow.label, remainingSeatIds.length);
    for (let i = 0; i < remainingSeatIds.length; i++) {
      const seat = this.engine.state.get(remainingSeatIds[i]) as Seat | undefined;
      if (!seat) continue;
      const relabeled: Seat = { ...seat, label: labels[i] };
      this.engine.state.set(seat.id, relabeled);
      this.engine.spatialIndex.update(relabeled);
    }

    this.engine.events.emit('elements:updated', {
      elements: [updatedRow, ...remainingSeatIds.map(id => this.engine.state.get(id)!).filter(Boolean)],
    });
    this.engine.events.emit('render:request', {});
  }

  undo(): void {
    // Re-add removed seats
    this.engine.addElements(this.removedSeats);

    // Restore original row
    this.engine.state.set(this.rowId, this.originalRow);
    this.engine.spatialIndex.update(this.originalRow);

    // Restore original seat labels
    const labels = propagateRowLabel(this.originalRow.label, this.originalRow.seatIds.length);
    for (let i = 0; i < this.originalRow.seatIds.length; i++) {
      const seat = this.engine.state.get(this.originalRow.seatIds[i]) as Seat | undefined;
      if (!seat) continue;
      const relabeled: Seat = { ...seat, label: labels[i] };
      this.engine.state.set(seat.id, relabeled);
      this.engine.spatialIndex.update(relabeled);
    }

    this.engine.events.emit('elements:updated', {
      elements: [this.originalRow, ...this.originalRow.seatIds.map(id => this.engine.state.get(id)!).filter(Boolean)],
    });
    this.engine.events.emit('render:request', {});
  }
}
