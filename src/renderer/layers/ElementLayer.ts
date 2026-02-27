import Konva from 'konva';
import type { EditorEngine } from '@/src/engine/EditorEngine';
import type { MapElement, ElementId } from '@/src/domain/types';
import { createSeatShape, updateSeatShape } from '../shapes/SeatShape';
import { createRowShape, updateRowShape } from '../shapes/RowShape';
import { createAreaShape, updateAreaShape } from '../shapes/AreaShape';
import { createTableShape, updateTableShape } from '../shapes/TableShape';

export class ElementLayer {
  readonly layer: Konva.Layer;
  private nodeMap = new Map<ElementId, Konva.Group>();

  constructor() {
    this.layer = new Konva.Layer({ name: 'elements' });
  }

  addElements(elements: MapElement[]): void {
    for (const el of elements) {
      if (this.nodeMap.has(el.id)) continue;

      let group: Konva.Group;
      switch (el.type) {
        case 'seat':
          group = createSeatShape(el);
          break;
        case 'row':
          group = createRowShape(el);
          break;
        case 'area':
          group = createAreaShape(el);
          break;
        case 'table':
          group = createTableShape(el);
          break;
      }

      this.nodeMap.set(el.id, group);

      // Areas go behind everything
      if (el.type === 'area') {
        this.layer.add(group);
        group.moveToBottom();
      } else {
        this.layer.add(group);
      }
    }
    this.layer.batchDraw();
  }

  removeElements(ids: ElementId[]): void {
    for (const id of ids) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.destroy();
        this.nodeMap.delete(id);
      }
    }
    this.layer.batchDraw();
  }

  updateElements(elements: MapElement[]): void {
    for (const el of elements) {
      const group = this.nodeMap.get(el.id);
      if (!group) continue;

      switch (el.type) {
        case 'seat':
          updateSeatShape(group, el);
          break;
        case 'row':
          updateRowShape(group, el);
          break;
        case 'area':
          updateAreaShape(group, el);
          break;
        case 'table':
          updateTableShape(group, el);
          break;
      }
    }
    this.layer.batchDraw();
  }

  getNode(id: ElementId): Konva.Group | undefined {
    return this.nodeMap.get(id);
  }

  private dimmedIds = new Set<ElementId>();

  dimElements(ids: ElementId[]): void {
    // Restore previously dimmed first
    this.restoreDimmed();
    for (const id of ids) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.opacity(0.3);
        this.dimmedIds.add(id);
      }
    }
    this.layer.batchDraw();
  }

  restoreDimmed(): void {
    for (const id of this.dimmedIds) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.opacity(1);
      }
    }
    this.dimmedIds.clear();
    this.layer.batchDraw();
  }

  syncWithEngine(engine: EditorEngine): void {
    // Full rebuild
    for (const node of this.nodeMap.values()) {
      node.destroy();
    }
    this.nodeMap.clear();
    this.addElements(engine.getAllElements());
  }
}
