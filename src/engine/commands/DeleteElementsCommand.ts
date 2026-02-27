import type { Command } from './Command';
import type { ElementId, MapElement } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export class DeleteElementsCommand implements Command {
  readonly name = 'Delete Elements';
  private engine: EditorEngine;
  private ids: ElementId[];
  private savedElements: MapElement[] = [];

  constructor(engine: EditorEngine, ids: ElementId[]) {
    this.engine = engine;
    this.ids = ids;
  }

  execute(): void {
    this.savedElements = [];
    for (const id of this.ids) {
      const el = this.engine.state.get(id);
      if (el) this.savedElements.push(el);
    }
    this.engine.removeElements(this.ids);
  }

  undo(): void {
    this.engine.addElements(this.savedElements);
  }
}
