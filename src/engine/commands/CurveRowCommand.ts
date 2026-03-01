import type { Command } from './Command';
import type { ElementId, Row, Seat, MapElement, CurveDefinition } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';
import { angleBetween, distance } from '@/src/utils/math';

export class CurveRowCommand implements Command {
  readonly name = 'Curve Row';

  private oldCurveRadius: number;
  private oldCurveDefinition: CurveDefinition | null;
  private oldSeatPositions: Map<ElementId, Point>;
  private oldRowBounds: { x: number; y: number; width: number; height: number };
  private oldRowPosition: Point;

  constructor(
    private engine: EditorEngine,
    private rowId: ElementId,
    private newCurveRadius: number,
    private newSeatPositions: Map<ElementId, Point>,
  ) {
    const row = engine.state.get(rowId) as Row;
    this.oldCurveRadius = row.curveRadius;
    this.oldCurveDefinition = row.curveDefinition;
    this.oldRowBounds = { ...row.bounds };
    this.oldRowPosition = { ...row.transform.position };
    this.oldSeatPositions = new Map();
    for (const seatId of row.seatIds) {
      const seat = engine.state.get(seatId) as Seat | undefined;
      if (seat) {
        this.oldSeatPositions.set(seatId, { ...seat.transform.position });
      }
    }
  }

  execute(): void {
    this.applyCurve(this.newCurveRadius, this.newSeatPositions, true);
  }

  undo(): void {
    this.applyCurve(this.oldCurveRadius, this.oldSeatPositions, false);
  }

  private applyCurve(curveRadius: number, seatPositions: Map<ElementId, Point>, isExecute: boolean): void {
    const row = this.engine.state.get(this.rowId) as Row | undefined;
    if (!row) return;

    const updated: MapElement[] = [];

    // Update seat positions
    for (const [seatId, pos] of seatPositions) {
      const seat = this.engine.state.get(seatId) as Seat | undefined;
      if (!seat) continue;
      const updatedSeat: Seat = {
        ...seat,
        transform: { ...seat.transform, position: pos },
        bounds: {
          x: pos.x - seat.radius,
          y: pos.y - seat.radius,
          width: seat.radius * 2,
          height: seat.radius * 2,
        },
      };
      this.engine.state.set(seatId, updatedSeat);
      this.engine.spatialIndex.update(updatedSeat);
      updated.push(updatedSeat);
    }

    // Recompute row bounds from updated seats
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const seatId of row.seatIds) {
      const seat = this.engine.state.get(seatId) as Seat | undefined;
      if (!seat) continue;
      const p = seat.transform.position;
      const r = seat.radius;
      minX = Math.min(minX, p.x - r);
      minY = Math.min(minY, p.y - r);
      maxX = Math.max(maxX, p.x + r);
      maxY = Math.max(maxY, p.y + r);
    }

    // Sync orientationAngle to actual first-to-last seat direction
    let orientationAngle = row.orientationAngle;
    if (row.seatIds.length >= 2) {
      const firstSeat = this.engine.state.get(row.seatIds[0]) as Seat | undefined;
      const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]) as Seat | undefined;
      if (firstSeat && lastSeat) {
        orientationAngle = angleBetween(
          firstSeat.transform.position,
          lastSeat.transform.position,
        );
      }
    }

    // Compute curveDefinition: on execute, derive from current endpoints; on undo, restore old
    let curveDefinition: CurveDefinition | null;
    if (isExecute) {
      if (curveRadius && row.seatIds.length >= 2) {
        const firstSeat = this.engine.state.get(row.seatIds[0]) as Seat | undefined;
        const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]) as Seat | undefined;
        if (firstSeat && lastSeat) {
          const firstPos = firstSeat.transform.position;
          const lastPos = lastSeat.transform.position;
          curveDefinition = {
            chord: distance(firstPos, lastPos),
            center: { x: (firstPos.x + lastPos.x) / 2, y: (firstPos.y + lastPos.y) / 2 },
            angle: angleBetween(firstPos, lastPos),
          };
        } else {
          curveDefinition = null;
        }
      } else {
        curveDefinition = null;
      }
    } else {
      curveDefinition = this.oldCurveDefinition;
    }

    const updatedRow: Row = {
      ...row,
      orientationAngle,
      curveRadius,
      curveDefinition,
      transform: {
        ...row.transform,
        position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        rotation: orientationAngle,
      },
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX || 1,
        height: maxY - minY || 1,
      },
    };

    this.engine.state.set(this.rowId, updatedRow);
    this.engine.spatialIndex.update(updatedRow);
    updated.push(updatedRow);

    this.engine.events.emit('elements:updated', { elements: updated });
    this.engine.events.emit('render:request', {});
  }
}
