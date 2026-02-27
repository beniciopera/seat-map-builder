import type { ElementId, MapElement } from '@/src/domain/types';
import type { Rect } from '@/src/domain/geometry';

export class SelectionState {
  private selectedIds = new Set<ElementId>();

  getSelectedIds(): ElementId[] {
    return Array.from(this.selectedIds);
  }

  isSelected(id: ElementId): boolean {
    return this.selectedIds.has(id);
  }

  select(id: ElementId): void {
    this.selectedIds.clear();
    this.selectedIds.add(id);
  }

  addToSelection(id: ElementId): void {
    this.selectedIds.add(id);
  }

  removeFromSelection(id: ElementId): void {
    this.selectedIds.delete(id);
  }

  toggleSelection(id: ElementId): void {
    if (this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  selectMultiple(ids: ElementId[]): void {
    this.selectedIds.clear();
    for (const id of ids) {
      this.selectedIds.add(id);
    }
  }

  clearSelection(): void {
    this.selectedIds.clear();
  }

  get count(): number {
    return this.selectedIds.size;
  }

  get hasSelection(): boolean {
    return this.selectedIds.size > 0;
  }

  getSelectionBounds(elements: Map<ElementId, MapElement>): Rect | null {
    if (this.selectedIds.size === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const id of this.selectedIds) {
      const el = elements.get(id);
      if (!el) continue;
      const b = el.bounds;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }

    if (minX === Infinity) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}
