import type { Command } from './Command';
import type { ElementId, MapElement } from '@/src/domain/types';
import type { Rect, Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';

export class ResizeElementCommand implements Command {
  readonly name = 'Resize Element';
  private engine: EditorEngine;
  private id: ElementId;
  private oldBounds: Rect;
  private newBounds: Rect;
  private oldPosition: Point;
  private newPosition: Point;

  constructor(engine: EditorEngine, id: ElementId, oldBounds: Rect, newBounds: Rect, oldPosition: Point, newPosition: Point) {
    this.engine = engine;
    this.id = id;
    this.oldBounds = oldBounds;
    this.newBounds = newBounds;
    this.oldPosition = oldPosition;
    this.newPosition = newPosition;
  }

  execute(): void {
    this.applyBounds(this.newBounds, this.newPosition);
  }

  undo(): void {
    this.applyBounds(this.oldBounds, this.oldPosition);
  }

  private applyBounds(bounds: Rect, position: Point): void {
    const el = this.engine.state.get(this.id);
    if (!el) return;
    const merged = {
      ...el,
      bounds,
      transform: { ...el.transform, position },
    } as MapElement;
    this.engine.state.set(this.id, merged);
    this.engine.spatialIndex.update(merged);
    this.engine.events.emit('elements:updated', { elements: [merged] });
    this.engine.events.emit('render:request', {});
  }
}
