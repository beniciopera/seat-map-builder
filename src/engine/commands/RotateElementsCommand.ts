import type { Command } from './Command';
import type { ElementId, MapElement } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';

export class RotateElementsCommand implements Command {
  readonly name = 'Rotate Elements';
  private engine: EditorEngine;
  private ids: ElementId[];
  private angle: number;
  private center: Point;
  private oldTransforms: Map<ElementId, { position: Point; rotation: number }> = new Map();

  constructor(engine: EditorEngine, ids: ElementId[], angle: number, center: Point) {
    this.engine = engine;
    this.ids = ids;
    this.angle = angle;
    this.center = center;

    for (const id of ids) {
      const el = engine.state.get(id);
      if (el) {
        this.oldTransforms.set(id, {
          position: el.transform.position,
          rotation: el.transform.rotation,
        });
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
      const merged = {
        ...el,
        transform: { ...el.transform, position: old.position, rotation: old.rotation },
      } as MapElement;
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

      const merged = {
        ...el,
        transform: {
          ...el.transform,
          position: newPos,
          rotation: el.transform.rotation + angle,
        },
        bounds: {
          ...el.bounds,
          x: newPos.x - el.bounds.width / 2,
          y: newPos.y - el.bounds.height / 2,
        },
      } as MapElement;

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
