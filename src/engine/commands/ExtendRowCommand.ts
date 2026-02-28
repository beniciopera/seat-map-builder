import type { Command } from './Command';
import type { Seat, Row, ElementId } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { propagateRowLabel } from '@/src/domain/labels';
import { distance, parabolaPositions } from '@/src/utils/math';
import { CURVATURE_EPSILON } from '@/src/domain/constraints';
import type { Point } from '@/src/domain/geometry';

export class ExtendRowCommand implements Command {
  readonly name = 'Extend Row';

  // Saved original positions of pre-existing seats for undo
  private originalSeatPositions = new Map<ElementId, Point>();

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

    let midX = (minX + maxX) / 2;
    let midY = (minY + maxY) / 2;

    // 4. Recalculate curveRadius (sagitta) for the new chord using quadratic scaling
    //    and reposition ALL seats onto the new parabola for consistency
    let newCurveRadius = row.curveRadius;
    if (row.curveRadius && Math.abs(row.curveRadius) > CURVATURE_EPSILON && updatedSeatIds.length >= 2) {
      const oldFirstSeat = this.engine.state.get(this.originalRow.seatIds[0]) as Seat | undefined;
      const oldLastSeat = this.engine.state.get(this.originalRow.seatIds[this.originalRow.seatIds.length - 1]) as Seat | undefined;
      if (oldFirstSeat && oldLastSeat) {
        const oldChord = distance(oldFirstSeat.transform.position, oldLastSeat.transform.position);
        const newFirst = this.engine.state.get(updatedSeatIds[0]) as Seat | undefined;
        const newLast = this.engine.state.get(updatedSeatIds[updatedSeatIds.length - 1]) as Seat | undefined;
        if (newFirst && newLast && oldChord > 0) {
          const newChord = distance(newFirst.transform.position, newLast.transform.position);
          const ratio = newChord / oldChord;
          newCurveRadius = row.curveRadius * ratio * ratio;

          // Reposition all seats onto the new parabola so shadow and seats are consistent
          const newPositions = parabolaPositions(
            newFirst.transform.position,
            newLast.transform.position,
            newCurveRadius,
            updatedSeatIds.length,
          );
          for (let i = 0; i < updatedSeatIds.length; i++) {
            const seat = this.engine.state.get(updatedSeatIds[i]) as Seat | undefined;
            if (!seat) continue;
            // Save original position for undo (only pre-existing seats)
            if (!this.newSeats.some(ns => ns.id === seat.id)) {
              this.originalSeatPositions.set(seat.id, { ...seat.transform.position });
            }
            const pos = newPositions[i];
            const r = seat.radius;
            const repositioned: Seat = {
              ...seat,
              transform: { ...seat.transform, position: pos },
              bounds: { x: pos.x - r, y: pos.y - r, width: r * 2, height: r * 2 },
            };
            this.engine.state.set(seat.id, repositioned);
            this.engine.spatialIndex.update(repositioned);
          }

          // Recompute bounds after repositioning
          minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
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
          midX = (minX + maxX) / 2;
          midY = (minY + maxY) / 2;
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

    // Restore original seat positions and labels
    const labels = propagateRowLabel(this.originalRow.label, this.originalRow.seatIds.length);
    for (let i = 0; i < this.originalRow.seatIds.length; i++) {
      const seatId = this.originalRow.seatIds[i];
      const seat = this.engine.state.get(seatId) as Seat | undefined;
      if (!seat) continue;
      const origPos = this.originalSeatPositions.get(seatId);
      const pos = origPos || seat.transform.position;
      const r = seat.radius;
      const restored: Seat = {
        ...seat,
        label: labels[i],
        transform: { ...seat.transform, position: pos },
        bounds: { x: pos.x - r, y: pos.y - r, width: r * 2, height: r * 2 },
      };
      this.engine.state.set(seatId, restored);
      this.engine.spatialIndex.update(restored);
    }

    this.engine.events.emit('elements:updated', {
      elements: [this.originalRow, ...this.originalRow.seatIds.map(id => this.engine.state.get(id)!).filter(Boolean)],
    });
    this.engine.events.emit('render:request', {});
  }
}
