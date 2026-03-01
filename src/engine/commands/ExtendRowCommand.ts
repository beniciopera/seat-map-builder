import type { Command } from './Command';
import type { Seat, Row, ElementId, MapElement } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { propagateRowLabel } from '@/src/domain/labels';
import { distance, parabolaPositions, angleBetween } from '@/src/utils/math';
import { isRowCurvatureEffectivelyStraight } from '@/src/domain/constraints';
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
    if (row.curveRadius && updatedSeatIds.length >= 2) {
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
          if (isRowCurvatureEffectivelyStraight(newCurveRadius, newChord)) newCurveRadius = 0;

          // Reposition all seats onto the new parabola so shadow and seats are consistent (only when curved)
          if (!isRowCurvatureEffectivelyStraight(newCurveRadius, newChord)) {
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
    }

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
      curveRadius: newCurveRadius,
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

    // Restore original seat positions
    for (let i = 0; i < this.originalRow.seatIds.length; i++) {
      const seatId = this.originalRow.seatIds[i];
      const seat = this.engine.state.get(seatId) as Seat | undefined;
      if (!seat) continue;
      const origPos = this.originalSeatPositions.get(seatId);
      if (origPos) {
        const r = seat.radius;
        const restored: Seat = {
          ...seat,
          transform: { ...seat.transform, position: origPos },
          bounds: { x: origPos.x - r, y: origPos.y - r, width: r * 2, height: r * 2 },
        };
        this.engine.state.set(seatId, restored);
        this.engine.spatialIndex.update(restored);
      }
    }

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
