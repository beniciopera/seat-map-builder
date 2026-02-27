import type { ElementId, MapElement } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';
import { MoveElementsCommand } from '../commands/MoveElementsCommand';
import { ResizeElementCommand } from '../commands/ResizeElementCommand';
import { RotateElementsCommand } from '../commands/RotateElementsCommand';

export class TransformSystem {
  private engine: EditorEngine;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  move(ids: ElementId[], delta: Point): void {
    const before = new Map<ElementId, Point>();
    const after = new Map<ElementId, Point>();

    for (const id of ids) {
      const el = this.engine.state.get(id);
      if (!el || el.locked) continue;
      const oldPos = el.transform.position;
      before.set(id, oldPos);
      after.set(id, { x: oldPos.x + delta.x, y: oldPos.y + delta.y });
    }

    const cmd = new MoveElementsCommand(this.engine, before, after);
    this.engine.history.execute(cmd);
  }

  movePreview(ids: ElementId[], delta: Point): void {
    // Live preview without recording to history
    const updated: MapElement[] = [];
    for (const id of ids) {
      const el = this.engine.state.get(id);
      if (!el || el.locked) continue;
      const newPos = { x: el.transform.position.x + delta.x, y: el.transform.position.y + delta.y };
      const merged = {
        ...el,
        transform: { ...el.transform, position: newPos },
        bounds: { ...el.bounds, x: newPos.x - el.bounds.width / 2, y: newPos.y - el.bounds.height / 2 },
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

  resize(id: ElementId, newWidth: number, newHeight: number): void {
    const el = this.engine.state.get(id);
    if (!el || el.locked) return;
    const newBounds = {
      ...el.bounds,
      width: newWidth,
      height: newHeight,
    };
    const newPosition = {
      x: newBounds.x + newBounds.width / 2,
      y: newBounds.y + newBounds.height / 2,
    };
    const cmd = new ResizeElementCommand(this.engine, id, el.bounds, newBounds, el.transform.position, newPosition);
    this.engine.history.execute(cmd);
  }

  rotate(ids: ElementId[], angle: number, center: Point): void {
    const cmd = new RotateElementsCommand(this.engine, ids, angle, center);
    this.engine.history.execute(cmd);
  }
}
