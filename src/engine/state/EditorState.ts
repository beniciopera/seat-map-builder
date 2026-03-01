import type { MapElement, ElementId, MapLayout } from '@/src/domain/types';
import type { Category, CategoryId } from '@/src/domain/categories';
import { generateMapId } from '@/src/domain/ids';
import { DEFAULT_CATEGORIES } from '@/src/domain/categories';

export class EditorState {
  private elements = new Map<ElementId, MapElement>();
  private layout: MapLayout;
  private categories = new Map<CategoryId, Category>();

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
    for (const cat of DEFAULT_CATEGORIES) {
      this.categories.set(cat.id, cat);
    }
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

  getCategory(id: CategoryId): Category | undefined {
    return this.categories.get(id);
  }

  getAllCategories(): Category[] {
    return Array.from(this.categories.values());
  }

  setCategory(category: Category): void {
    this.categories.set(category.id, category);
  }

  deleteCategory(id: CategoryId): boolean {
    return this.categories.delete(id);
  }

  hasCategory(id: CategoryId): boolean {
    return this.categories.has(id);
  }

  getCategoriesMap(): Map<CategoryId, Category> {
    return new Map(this.categories);
  }

  setCategoriesFromArray(categories: Category[]): void {
    this.categories.clear();
    for (const cat of categories) {
      this.categories.set(cat.id, cat);
    }
  }
}
