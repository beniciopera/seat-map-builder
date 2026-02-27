import type { Point, Rect } from '@/src/domain/geometry';
import type { ElementId } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export interface SnapTarget {
  readonly axis: 'x' | 'y';
  readonly value: number;
  readonly sourceElementId: ElementId;
  readonly type: 'center' | 'edge-left' | 'edge-right' | 'edge-top' | 'edge-bottom';
}

export interface SnapResult {
  readonly snappedPoint: Point;
  readonly snappedX: boolean;
  readonly snappedY: boolean;
  readonly matchedTargets: SnapTarget[];
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

    let snappedX = point.x;
    let snappedY = point.y;
    let didSnapX = false;
    let didSnapY = false;
    let bestDx = worldThreshold;
    let bestDy = worldThreshold;
    const matchedTargets: SnapTarget[] = [];

    for (const id of nearbyIds) {
      if (this.excludedIds.has(id)) continue;
      const el = this.engine.state.get(id);
      if (!el || !el.visible) continue;

      const b = el.bounds;
      const centerX = b.x + b.width / 2;
      const centerY = b.y + b.height / 2;

      // Check X alignment: left edge, center, right edge
      const xTargets: Array<{ value: number; type: SnapTarget['type'] }> = [
        { value: b.x, type: 'edge-left' },
        { value: centerX, type: 'center' },
        { value: b.x + b.width, type: 'edge-right' },
      ];

      for (const target of xTargets) {
        const dx = Math.abs(point.x - target.value);
        if (dx < bestDx) {
          bestDx = dx;
          snappedX = target.value;
          didSnapX = true;
          matchedTargets.push({ axis: 'x', value: target.value, sourceElementId: id, type: target.type });
        }
      }

      // Check Y alignment: top edge, center, bottom edge
      const yTargets: Array<{ value: number; type: SnapTarget['type'] }> = [
        { value: b.y, type: 'edge-top' },
        { value: centerY, type: 'center' },
        { value: b.y + b.height, type: 'edge-bottom' },
      ];

      for (const target of yTargets) {
        const dy = Math.abs(point.y - target.value);
        if (dy < bestDy) {
          bestDy = dy;
          snappedY = target.value;
          didSnapY = true;
          matchedTargets.push({ axis: 'y', value: target.value, sourceElementId: id, type: target.type });
        }
      }
    }

    return {
      snappedPoint: { x: didSnapX ? snappedX : point.x, y: didSnapY ? snappedY : point.y },
      snappedX: didSnapX,
      snappedY: didSnapY,
      matchedTargets,
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
