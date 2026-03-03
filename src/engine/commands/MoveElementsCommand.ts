import type { Command } from './Command';
import type { ElementId, MapElement, Row, Area } from '@/src/domain/types';
import { isRow, isArea } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';
import { boundsFromVertices, centerOfVertices } from '@/src/domain/polygon';

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
      const oldPos = el.transform.position;
      const dx = pos.x - oldPos.x;
      const dy = pos.y - oldPos.y;

      let merged: MapElement;
      if (isArea(el) && (el as Area).vertices && (el as Area).vertices!.length >= 3) {
        const area = el as Area;
        const newVertices = area.vertices!.map((v) => ({ x: v.x + dx, y: v.y + dy }));
        const bounds = boundsFromVertices(newVertices);
        merged = {
          ...area,
          transform: { ...area.transform, position: pos },
          bounds,
          vertices: newVertices,
        } as MapElement;
      } else {
        merged = {
          ...el,
          transform: { ...el.transform, position: pos },
          bounds: { ...el.bounds, x: pos.x - el.bounds.width / 2, y: pos.y - el.bounds.height / 2 },
        } as MapElement;
      }
      // Translate curveDefinition.center when moving a row
      if (isRow(merged) && merged.curveDefinition) {
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
