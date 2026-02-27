import type { Point, Rect } from '@/src/domain/geometry';
import type { ElementId } from '@/src/domain/types';
import { isRow, isSeat } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export interface SnapTarget {
  readonly axis: 'x' | 'y';
  readonly value: number;
  readonly sourceElementId: ElementId;
  readonly type: 'center' | 'edge-left' | 'edge-right' | 'edge-top' | 'edge-bottom';
}

export interface AngleSnapTarget {
  readonly throughPoint: Point;
  readonly angle: number; // radians
  readonly sourceElementId: ElementId;
  readonly alignmentType: 'center' | 'edge-start' | 'edge-end';
}

export interface SnapResult {
  readonly snappedPoint: Point;
  readonly snappedX: boolean;
  readonly snappedY: boolean;
  readonly matchedTargets: SnapTarget[];
  readonly angleTargets: AngleSnapTarget[];
}

export class SnapEngine {
  private threshold = 8;
  private excludedIds = new Set<ElementId>();
  private engine: EditorEngine;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  snapPoint(point: Point): SnapResult {
    const worldThreshold = this.threshold / this.engine.viewport.zoom;
    const searchRadius = worldThreshold * 3;
    const nearbyIds = this.engine.spatialIndex.queryRadius(point, searchRadius);

    let bestDx = worldThreshold;
    let bestDy = worldThreshold;
    let didSnapX = false;
    let didSnapY = false;
    const matchedTargets: SnapTarget[] = [];
    const angleTargets: AngleSnapTarget[] = [];

    for (const id of nearbyIds) {
      if (this.excludedIds.has(id)) continue;
      const el = this.engine.state.get(id);
      if (!el || !el.visible) continue;

      const b = el.bounds;
      const centerX = b.x + b.width / 2;
      const centerY = b.y + b.height / 2;

      // Axis-aligned checks: left edge, center, right edge
      const xTargets: Array<{ value: number; type: SnapTarget['type'] }> = [
        { value: b.x, type: 'edge-left' },
        { value: centerX, type: 'center' },
        { value: b.x + b.width, type: 'edge-right' },
      ];

      for (const target of xTargets) {
        const dx = Math.abs(point.x - target.value);
        if (dx < bestDx) {
          bestDx = dx;
          didSnapX = true;
          matchedTargets.push({ axis: 'x', value: target.value, sourceElementId: id, type: target.type });
        }
      }

      // Y alignment: top edge, center, bottom edge
      const yTargets: Array<{ value: number; type: SnapTarget['type'] }> = [
        { value: b.y, type: 'edge-top' },
        { value: centerY, type: 'center' },
        { value: b.y + b.height, type: 'edge-bottom' },
      ];

      for (const target of yTargets) {
        const dy = Math.abs(point.y - target.value);
        if (dy < bestDy) {
          bestDy = dy;
          didSnapY = true;
          matchedTargets.push({ axis: 'y', value: target.value, sourceElementId: id, type: target.type });
        }
      }

      // Angle-aware checks for elements belonging to rows
      if (isSeat(el) && el.rowId) {
        const row = this.engine.state.get(el.rowId);
        if (row && isRow(row)) {
          const rowAngle = row.orientationAngle;
          const elPos = el.transform.position;

          // Vector from element to drag point
          const dx = point.x - elPos.x;
          const dy = point.y - elPos.y;

          const cosA = Math.cos(rowAngle);
          const sinA = Math.sin(rowAngle);

          // Project onto row direction (along-row) and perpendicular (cross-row)
          const alongRow = dx * cosA + dy * sinA;
          const crossRow = dx * (-sinA) + dy * cosA;

          // If cross-row distance is small → aligned along the row direction
          if (Math.abs(crossRow) < worldThreshold) {
            angleTargets.push({
              throughPoint: elPos,
              angle: rowAngle,
              sourceElementId: id,
              alignmentType: 'center',
            });
          }

          // If along-row distance is small → aligned perpendicular to row
          if (Math.abs(alongRow) < worldThreshold) {
            angleTargets.push({
              throughPoint: elPos,
              angle: rowAngle + Math.PI / 2,
              sourceElementId: id,
              alignmentType: 'center',
            });
          }

          // Check edge alignment along row axis for each seat in the row
          // (edges = first and last seat positions projected onto row direction)
          const firstSeatId = row.seatIds[0];
          const lastSeatId = row.seatIds[row.seatIds.length - 1];
          const firstSeat = this.engine.state.get(firstSeatId);
          const lastSeat = this.engine.state.get(lastSeatId);

          if (firstSeat && firstSeat.id !== el.id) {
            const fPos = firstSeat.transform.position;
            const fdx = point.x - fPos.x;
            const fdy = point.y - fPos.y;
            const fCross = fdx * (-sinA) + fdy * cosA;
            if (Math.abs(fCross) < worldThreshold) {
              angleTargets.push({
                throughPoint: fPos,
                angle: rowAngle + Math.PI / 2,
                sourceElementId: firstSeatId,
                alignmentType: 'edge-start',
              });
            }
          }
          if (lastSeat && lastSeat.id !== el.id) {
            const lPos = lastSeat.transform.position;
            const ldx = point.x - lPos.x;
            const ldy = point.y - lPos.y;
            const lCross = ldx * (-sinA) + ldy * cosA;
            if (Math.abs(lCross) < worldThreshold) {
              angleTargets.push({
                throughPoint: lPos,
                angle: rowAngle + Math.PI / 2,
                sourceElementId: lastSeatId,
                alignmentType: 'edge-end',
              });
            }
          }
        }
      }
    }

    // Return original point always — no snapping
    return {
      snappedPoint: point,
      snappedX: didSnapX,
      snappedY: didSnapY,
      matchedTargets,
      angleTargets,
    };
  }

  snapRect(rect: Rect): SnapResult {
    const center: Point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    return this.snapPoint(center);
  }

  setExcluded(ids: ElementId[]): void {
    this.excludedIds.clear();
    for (const id of ids) {
      this.excludedIds.add(id);
    }
  }

  clearExcluded(): void {
    this.excludedIds.clear();
  }

  setThreshold(pixels: number): void {
    this.threshold = pixels;
  }
}
