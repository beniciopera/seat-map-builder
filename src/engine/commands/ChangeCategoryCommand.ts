import type { Command } from './Command';
import type { ElementId, MapElement, Seat, Row, Table } from '@/src/domain/types';
import type { CategoryId } from '@/src/domain/categories';
import type { EditorEngine } from '../EditorEngine';
import { DEFAULT_CATEGORY_ID } from '@/src/domain/categories';

interface ElementSnapshot {
  id: ElementId;
  category: CategoryId;
}

export class ChangeCategoryCommand implements Command {
  readonly name = 'Change Category';
  private engine: EditorEngine;
  private oldSnapshots: ElementSnapshot[] = [];
  private newSnapshots: ElementSnapshot[] = [];

  constructor(
    engine: EditorEngine,
    targetIds: ElementId[],
    newCategory: CategoryId,
  ) {
    this.engine = engine;

    // Collect all affected element IDs (parents + propagated children)
    const affectedIds = new Set<ElementId>();

    for (const id of targetIds) {
      const el = engine.state.get(id);
      if (!el) continue;

      affectedIds.add(id);

      if (el.type === 'table') {
        for (const seatId of (el as Table).seatIds) {
          affectedIds.add(seatId);
        }
      } else if (el.type === 'row') {
        for (const seatId of (el as Row).seatIds) {
          affectedIds.add(seatId);
        }
      }
    }

    // Snapshot old and new states
    for (const id of affectedIds) {
      const el = engine.state.get(id);
      if (!el) continue;

      const oldCategory = (el as Seat | Row | Table).category || DEFAULT_CATEGORY_ID;
      this.oldSnapshots.push({ id, category: oldCategory });
      this.newSnapshots.push({ id, category: newCategory });
    }
  }

  execute(): void {
    this.applySnapshots(this.newSnapshots);
  }

  undo(): void {
    this.applySnapshots(this.oldSnapshots);
  }

  private applySnapshots(snapshots: ElementSnapshot[]): void {
    const updated: MapElement[] = [];

    for (const snap of snapshots) {
      const el = this.engine.state.get(snap.id);
      if (!el) continue;

      const merged = { ...el, category: snap.category } as MapElement;
      this.engine.state.set(snap.id, merged);
      this.engine.spatialIndex.update(merged);
      updated.push(merged);
    }

    if (updated.length > 0) {
      this.engine.events.emit('elements:updated', { elements: updated });
      this.engine.events.emit('render:request', {});
    }
  }
}
