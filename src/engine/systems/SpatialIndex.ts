import type { ElementId, MapElement } from '@/src/domain/types';
import type { Point, Rect } from '@/src/domain/geometry';

export class SpatialIndex {
  private cellSize: number;
  private cells = new Map<string, Set<ElementId>>();
  private elementCells = new Map<ElementId, string[]>();

  constructor(cellSize = 50) {
    this.cellSize = cellSize;
  }

  insert(element: MapElement): void {
    const cellKeys = this.getCellsForRect(element.bounds);
    this.elementCells.set(element.id, cellKeys);
    for (const key of cellKeys) {
      if (!this.cells.has(key)) {
        this.cells.set(key, new Set());
      }
      this.cells.get(key)!.add(element.id);
    }
  }

  remove(id: ElementId): void {
    const cellKeys = this.elementCells.get(id);
    if (!cellKeys) return;
    for (const key of cellKeys) {
      this.cells.get(key)?.delete(id);
    }
    this.elementCells.delete(id);
  }

  update(element: MapElement): void {
    this.remove(element.id);
    this.insert(element);
  }

  rebuild(elements: MapElement[]): void {
    this.clear();
    for (const el of elements) {
      this.insert(el);
    }
  }

  queryRect(rect: Rect): ElementId[] {
    const result = new Set<ElementId>();
    const cellKeys = this.getCellsForRect(rect);
    for (const key of cellKeys) {
      const ids = this.cells.get(key);
      if (ids) {
        for (const id of ids) {
          result.add(id);
        }
      }
    }
    return Array.from(result);
  }

  queryRadius(center: Point, radius: number): ElementId[] {
    const rect: Rect = {
      x: center.x - radius,
      y: center.y - radius,
      width: radius * 2,
      height: radius * 2,
    };
    return this.queryRect(rect);
  }

  queryNearest(point: Point, maxResults: number, maxDistance: number): ElementId[] {
    return this.queryRadius(point, maxDistance).slice(0, maxResults);
  }

  clear(): void {
    this.cells.clear();
    this.elementCells.clear();
  }

  private cellKey(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  private worldToCell(x: number, y: number): { cellX: number; cellY: number } {
    return {
      cellX: Math.floor(x / this.cellSize),
      cellY: Math.floor(y / this.cellSize),
    };
  }

  private getCellsForRect(rect: Rect): string[] {
    const min = this.worldToCell(rect.x, rect.y);
    const max = this.worldToCell(rect.x + rect.width, rect.y + rect.height);
    const keys: string[] = [];
    for (let cx = min.cellX; cx <= max.cellX; cx++) {
      for (let cy = min.cellY; cy <= max.cellY; cy++) {
        keys.push(this.cellKey(cx, cy));
      }
    }
    return keys;
  }
}
