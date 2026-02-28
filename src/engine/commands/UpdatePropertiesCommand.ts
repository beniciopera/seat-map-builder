import type { Command } from './Command';
import type { ElementId, MapElement, Row } from '@/src/domain/types';
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
    this.applyProps(this.newProps, this.oldProps);
  }

  undo(): void {
    this.applyProps(this.oldProps, this.newProps);
  }

  private applyProps(props: Partial<MapElement>, prevProps: Partial<MapElement>): void {
    const el = this.engine.state.get(this.id);
    if (!el) return;
    const merged = { ...el, ...props } as MapElement;
    this.engine.state.set(this.id, merged);
    this.engine.spatialIndex.update(merged);

    const updatedElements: MapElement[] = [merged];

    if (el.type === 'row' && 'label' in props && props.label !== (el as Row).label) {
      const newLabel = (props as Partial<Row>).label!;
      const oldLabel = (prevProps as Partial<Row>).label ?? (el as Row).label;

      const newGroupSeats = this.engine.rowGrouping.renumberLabelGroup(newLabel, this.id);
      updatedElements.push(...newGroupSeats);

      if (oldLabel && oldLabel !== newLabel) {
        const oldGroupSeats = this.engine.rowGrouping.renumberLabelGroup(oldLabel);
        updatedElements.push(...oldGroupSeats);
      }
    }

    this.engine.events.emit('elements:updated', { elements: updatedElements });
    this.engine.events.emit('render:request', {});
  }
}
