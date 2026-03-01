import type { Command } from './Command';
import type { Category } from '@/src/domain/categories';
import type { EditorEngine } from '../EditorEngine';

export class DeleteCategoryCommand implements Command {
  readonly name = 'Delete Category';
  private engine: EditorEngine;
  private category: Category;

  constructor(engine: EditorEngine, category: Category) {
    this.engine = engine;
    this.category = category;
  }

  execute(): void {
    this.engine.state.deleteCategory(this.category.id);
    this.engine.events.emit('categories:changed', {});
  }

  undo(): void {
    this.engine.state.setCategory(this.category);
    this.engine.events.emit('categories:changed', {});
  }
}
