import type { Command } from './Command';
import type { ElementId, MapElement, CurveDefinition } from '@/src/domain/types';
import { isRow } from '@/src/domain/types';
import type { Point, Rect } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';
import { snapAngleDeg, radToDeg, degToRad } from '@/src/utils/math';

interface SavedTransform {
  position: Point;
  rotation: number;
  bounds: Rect;
  orientationAngle?: number;
  curveDefinition?: CurveDefinition | null;
}

export class RotateElementsCommand implements Command {
  readonly name = 'Rotate Elements';
  private engine: EditorEngine;
  private ids: ElementId[];
  private angle: number;
  private center: Point;
  private oldTransforms: Map<ElementId, SavedTransform> = new Map();

  constructor(engine: EditorEngine, ids: ElementId[], angle: number, center: Point) {
    this.engine = engine;
    this.ids = ids;
    this.angle = angle;
    this.center = center;

    for (const id of ids) {
      const el = engine.state.get(id);
      if (el) {
        const saved: SavedTransform = {
          position: el.transform.position,
          rotation: el.transform.rotation,
          bounds: el.bounds,
        };
        if (isRow(el)) {
          saved.orientationAngle = el.orientationAngle;
          saved.curveDefinition = el.curveDefinition;
        }
        this.oldTransforms.set(id, saved);
      }
    }
  }

  execute(): void {
    this.applyRotation(this.angle);
  }

  undo(): void {
    for (const [id, old] of this.oldTransforms) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      let merged = {
        ...el,
        transform: { ...el.transform, position: old.position, rotation: old.rotation },
        bounds: old.bounds,
      } as MapElement;
      if (isRow(merged) && old.orientationAngle !== undefined) {
        merged = { ...merged, orientationAngle: old.orientationAngle, curveDefinition: old.curveDefinition ?? null } as MapElement;
      }
      this.engine.state.set(id, merged);
      this.engine.spatialIndex.update(merged);
    }
    this.engine.events.emit('elements:updated', {
      elements: this.ids.map(id => this.engine.state.get(id)!).filter(Boolean),
    });
    this.engine.events.emit('render:request', {});
  }

  private applyRotation(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const updated: MapElement[] = [];

    for (const id of this.ids) {
      const el = this.engine.state.get(id);
      if (!el || el.locked) continue;

      const pos = el.transform.position;
      const dx = pos.x - this.center.x;
      const dy = pos.y - this.center.y;
      const newPos = {
        x: this.center.x + dx * cos - dy * sin,
        y: this.center.y + dx * sin + dy * cos,
      };

      const normalizedRotation = degToRad(snapAngleDeg(radToDeg(el.transform.rotation + angle)));

      let merged = {
        ...el,
        transform: {
          ...el.transform,
          position: newPos,
          rotation: normalizedRotation,
        },
        bounds: {
          ...el.bounds,
          x: newPos.x - el.bounds.width / 2,
          y: newPos.y - el.bounds.height / 2,
        },
      } as MapElement;

      if (isRow(merged)) {
        const normalizedOrientation = degToRad(snapAngleDeg(radToDeg(merged.orientationAngle + angle)));
        let curveDefinition = merged.curveDefinition;
        if (curveDefinition) {
          const cdx = curveDefinition.center.x - this.center.x;
          const cdy = curveDefinition.center.y - this.center.y;
          curveDefinition = {
            ...curveDefinition,
            center: {
              x: this.center.x + cdx * cos - cdy * sin,
              y: this.center.y + cdx * sin + cdy * cos,
            },
            angle: curveDefinition.angle + angle,
          };
        }
        merged = { ...merged, orientationAngle: normalizedOrientation, curveDefinition } as MapElement;
      }

      this.engine.state.set(id, merged);
      this.engine.spatialIndex.update(merged);
      updated.push(merged);
    }

    if (updated.length > 0) {
      this.engine.events.emit('elements:updated', { elements: updated });
      this.engine.events.emit('render:request', {});
    }
  }
}
