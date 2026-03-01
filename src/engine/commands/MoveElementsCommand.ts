import type { Command } from './Command';
import type { ElementId, MapElement, Row } from '@/src/domain/types';
import { isRow } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';

export class MoveElementsCommand implements Command {
  readonly name = 'Move Elements';
  private engine: EditorEngine;
  private before: Map<ElementId, Point>;
  private after: Map<ElementId, Point>;

  constructor(engine: EditorEngine, before: Map<ElementId, Point>, after: Map<ElementId, Point>) {
    this.engine = engine;
    this.before = new Map(Array.from(before, ([id, p]) => [id, { x: p.x, y: p.y }]));
    this.after = new Map(Array.from(after, ([id, p]) => [id, { x: p.x, y: p.y }]));
  }

  execute(): void {
    this.applyPositions(this.after);
  }

  undo(): void {
    this.applyPositions(this.before);
  }

  private applyPositions(positions: Map<ElementId, Point>): void {
    const updated: MapElement[] = [];
    for (const [id, pos] of positions) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      let merged = {
        ...el,
        transform: { ...el.transform, position: pos },
        bounds: { ...el.bounds, x: pos.x - el.bounds.width / 2, y: pos.y - el.bounds.height / 2 },
      } as MapElement;
      // Translate curveDefinition.center when moving a row
      if (isRow(merged) && merged.curveDefinition) {
        const dx = pos.x - el.transform.position.x;
        const dy = pos.y - el.transform.position.y;
        merged = {
          ...merged,
          curveDefinition: {
            ...merged.curveDefinition,
            center: {
              x: merged.curveDefinition.center.x + dx,
              y: merged.curveDefinition.center.y + dy,
            },
          },
        } as MapElement;
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
