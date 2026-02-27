import type { Command } from './Command';
import type { ElementId, MapElement } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export class UpdatePropertiesCommand implements Command {
  readonly name = 'Update Properties';
  private engine: EditorEngine;
  private id: ElementId;
  private oldProps: Partial<MapElement>;
  private newProps: Partial<MapElement>;

  constructor(engine: EditorEngine, id: ElementId, oldProps: Partial<MapElement>, newProps: Partial<MapElement>) {
    this.engine = engine;
    this.id = id;
    this.oldProps = oldProps;
    this.newProps = newProps;
  }

  execute(): void {
    this.applyProps(this.newProps);
  }

  undo(): void {
    this.applyProps(this.oldProps);
  }

  private applyProps(props: Partial<MapElement>): void {
    const el = this.engine.state.get(this.id);
    if (!el) return;
    const merged = { ...el, ...props } as MapElement;
    this.engine.state.set(this.id, merged);
    this.engine.spatialIndex.update(merged);
    this.engine.events.emit('elements:updated', { elements: [merged] });
    this.engine.events.emit('render:request', {});
  }
}
