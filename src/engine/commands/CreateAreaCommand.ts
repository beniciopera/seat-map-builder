import type { Command } from './Command';
import type { Area } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export class CreateAreaCommand implements Command {
  readonly name = 'Create Area';
  private engine: EditorEngine;
  private area: Area;

  constructor(engine: EditorEngine, area: Area) {
    this.engine = engine;
    this.area = area;
  }

  execute(): void {
    this.engine.addElements([this.area]);
  }

  undo(): void {
    this.engine.removeElements([this.area.id]);
  }
}
