import type { Command } from './Command';
import type { Seat, Row, ElementId } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { propagateRowLabel } from '@/src/domain/labels';
import { arcFromSagitta, distance } from '@/src/utils/math';

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

    // 3. Recompute bounds from all seat positions
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

    // 4. Recalculate curveRadius for the new chord
    let newCurveRadius = row.curveRadius;
    if (row.curveRadius && Math.abs(row.curveRadius) > 2 && updatedSeatIds.length >= 2) {
      const oldFirstSeat = this.engine.state.get(this.originalRow.seatIds[0]) as Seat | undefined;
      const oldLastSeat = this.engine.state.get(this.originalRow.seatIds[this.originalRow.seatIds.length - 1]) as Seat | undefined;
      if (oldFirstSeat && oldLastSeat) {
        const arc = arcFromSagitta(oldFirstSeat.transform.position, oldLastSeat.transform.position, row.curveRadius);
        const newFirst = this.engine.state.get(updatedSeatIds[0]) as Seat | undefined;
        const newLast = this.engine.state.get(updatedSeatIds[updatedSeatIds.length - 1]) as Seat | undefined;
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

    const updatedRow: Row = {
      ...row,
      seatIds: updatedSeatIds,
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

    // 5. Relabel all seats
    const labels = propagateRowLabel(updatedRow.label, updatedSeatIds.length);
    for (let i = 0; i < updatedSeatIds.length; i++) {
      const seat = this.engine.state.get(updatedSeatIds[i]) as Seat | undefined;
      if (!seat) continue;
      const relabeled: Seat = { ...seat, label: labels[i] };
      this.engine.state.set(seat.id, relabeled);
      this.engine.spatialIndex.update(relabeled);
    }

    this.engine.events.emit('elements:updated', {
      elements: [updatedRow, ...updatedSeatIds.map(id => this.engine.state.get(id)!).filter(Boolean)],
    });
    this.engine.events.emit('render:request', {});
  }

  undo(): void {
    // Remove added seats
    const newSeatIds = this.newSeats.map(s => s.id);
    this.engine.removeElements(newSeatIds);

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
