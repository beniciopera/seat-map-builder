import type { MapElement, ElementId, MapLayout } from '@/src/domain/types';
import { generateMapId } from '@/src/domain/ids';

export class EditorState {
  private elements = new Map<ElementId, MapElement>();
  private layout: MapLayout;

  constructor() {
    this.layout = {
      id: generateMapId(),
      name: 'Seat Map',
      width: 5000,
      height: 3000,
      elements: this.elements,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  get(id: ElementId): MapElement | undefined {
    return this.elements.get(id);
  }

  getAll(): MapElement[] {
    return Array.from(this.elements.values());
  }

  set(id: ElementId, element: MapElement): void {
    this.elements.set(id, element);
  }

  delete(id: ElementId): boolean {
    return this.elements.delete(id);
  }

  has(id: ElementId): boolean {
    return this.elements.has(id);
  }

  clear(): void {
    this.elements.clear();
  }

  get size(): number {
    return this.elements.size;
  }

  getLayout(): MapLayout {
    return {
      ...this.layout,
      elements: new Map(this.elements),
      updatedAt: Date.now(),
    };
  }

  setLayout(layout: MapLayout): void {
    this.layout = layout;
    this.elements.clear();
    for (const [id, el] of layout.elements) {
      this.elements.set(id, el);
    }
  }

  updateLayoutMeta(updates: Partial<Pick<MapLayout, 'name' | 'width' | 'height'>>): void {
    this.layout = { ...this.layout, ...updates, updatedAt: Date.now() };
  }
}
