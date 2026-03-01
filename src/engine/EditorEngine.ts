import type { MapLayout, MapElement, ElementId, Seat, Table, Row } from '@/src/domain/types';
import type { Point, Rect } from '@/src/domain/geometry';
import { rowLabelFromIndex } from '@/src/domain/labels';
import { EditorEventEmitter } from './events';
import { EditorState } from './state/EditorState';
import { SelectionState } from './state/SelectionState';
import { ViewportState } from './state/ViewportState';
import { ToolManager } from './tools/ToolManager';
import { CommandHistory } from './commands/CommandHistory';
import { InputManager } from './input/InputManager';
import { SpatialIndex } from './systems/SpatialIndex';
import { SnapEngine } from './systems/SnapEngine';
import { GuidelinesEngine } from './systems/GuidelinesEngine';
import { TransformSystem } from './systems/TransformSystem';
import { SeatGenerationSystem } from './systems/SeatGenerationSystem';
import { RowGroupingSystem } from './systems/RowGroupingSystem';
import { PlacementSystem } from './systems/PlacementSystem';

export class EditorEngine {
  readonly events: EditorEventEmitter;
  readonly state: EditorState;
  readonly selection: SelectionState;
  readonly viewport: ViewportState;
  readonly tools: ToolManager;
  readonly history: CommandHistory;
  readonly input: InputManager;
  readonly spatialIndex: SpatialIndex;
  readonly snap: SnapEngine;
  readonly guidelines: GuidelinesEngine;
  readonly transforms: TransformSystem;
  readonly seatGeneration: SeatGenerationSystem;
  readonly rowGrouping: RowGroupingSystem;
  readonly placement: PlacementSystem;

  constructor() {
    this.events = new EditorEventEmitter();
    this.state = new EditorState();
    this.selection = new SelectionState();
    this.viewport = new ViewportState();
    this.history = new CommandHistory(this.events);
    this.tools = new ToolManager(this);
    this.input = new InputManager(this);
    this.spatialIndex = new SpatialIndex();
    this.snap = new SnapEngine(this);
    this.guidelines = new GuidelinesEngine(this);
    this.transforms = new TransformSystem(this);
    this.seatGeneration = new SeatGenerationSystem();
    this.rowGrouping = new RowGroupingSystem(this);
    this.placement = new PlacementSystem(this);
  }

  initialize(layout?: MapLayout): void {
    if (layout) {
      this.state.setLayout(layout);
      this.spatialIndex.rebuild(this.state.getAll());
    }
  }

  getLayout(): MapLayout {
    return this.state.getLayout();
  }

  addElements(elements: MapElement[]): void {
    for (const el of elements) {
      this.state.set(el.id, el);
      this.spatialIndex.insert(el);
    }
    this.events.emit('elements:added', { elements });
    this.events.emit('render:request', {});
  }

  removeElements(ids: ElementId[]): void {
    for (const id of ids) {
      this.spatialIndex.remove(id);
      this.state.delete(id);
    }
    // Remove from selection
    for (const id of ids) {
      this.selection.removeFromSelection(id);
    }
    this.events.emit('elements:removed', { elementIds: ids });
    if (ids.length > 0) {
      this.events.emit('selection:changed', {
        selectedIds: this.selection.getSelectedIds(),
      });
    }
    this.events.emit('render:request', {});
  }

  updateElements(updates: Array<{ id: ElementId; changes: Partial<MapElement> }>): void {
    const updated: MapElement[] = [];
    for (const { id, changes } of updates) {
      const existing = this.state.get(id);
      if (!existing) continue;
      const merged = { ...existing, ...changes } as MapElement;
      this.state.set(id, merged);
      this.spatialIndex.update(merged);
      updated.push(merged);
    }
    if (updated.length > 0) {
      this.events.emit('elements:updated', { elements: updated });
      this.events.emit('render:request', {});
    }
  }

  getElement(id: ElementId): MapElement | undefined {
    return this.state.get(id);
  }

  getAllElements(): MapElement[] {
    return this.state.getAll();
  }

  private pointInElement(point: Point, el: MapElement): boolean {
    switch (el.type) {
      case 'seat': {
        const seat = el as Seat;
        const dx = point.x - seat.transform.position.x;
        const dy = point.y - seat.transform.position.y;
        return dx * dx + dy * dy <= seat.radius * seat.radius;
      }
      case 'row': {
        const row = el as Row;
        for (const seatId of row.seatIds) {
          const seat = this.state.get(seatId);
          if (seat && seat.type === 'seat') {
            const s = seat as Seat;
            const dx = point.x - s.transform.position.x;
            const dy = point.y - s.transform.position.y;
            if (dx * dx + dy * dy <= s.radius * s.radius) {
              return true;
            }
          }
        }
        return false;
      }
      case 'area': {
        const b = el.bounds;
        return point.x >= b.x && point.x <= b.x + b.width &&
               point.y >= b.y && point.y <= b.y + b.height;
      }
      case 'table': {
        const table = el as Table;
        if (table.shape === 'round') {
          const dx = point.x - table.transform.position.x;
          const dy = point.y - table.transform.position.y;
          return dx * dx + dy * dy <= table.tableRadius * table.tableRadius;
        }
        // rectangular table: rect centered on position
        const halfW = table.tableWidth / 2;
        const halfH = table.tableHeight / 2;
        const px = point.x - table.transform.position.x;
        const py = point.y - table.transform.position.y;
        return px >= -halfW && px <= halfW && py >= -halfH && py <= halfH;
      }
      default:
        return false;
    }
  }

  hitTest(point: Point): MapElement | null {
    const nearbyIds = this.spatialIndex.queryRadius(point, 20);
    let closest: MapElement | null = null;
    let closestDist = Infinity;

    for (const id of nearbyIds) {
      const el = this.state.get(id);
      if (!el || !el.visible) continue;
      if (!this.pointInElement(point, el)) continue;
      const dx = el.transform.position.x - point.x;
      const dy = el.transform.position.y - point.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = el;
      }
    }

    return closest;
  }

  queryRect(rect: Rect): MapElement[] {
    const ids = this.spatialIndex.queryRect(rect);
    const results: MapElement[] = [];
    for (const id of ids) {
      const el = this.state.get(id);
      if (el && el.visible) results.push(el);
    }
    return results;
  }

  isTableLabelTaken(label: string, excludeId?: ElementId): boolean {
    for (const el of this.state.getAll()) {
      if (el.type === 'table' && (el as Table).label === label && el.id !== excludeId) {
        return true;
      }
    }
    return false;
  }

  nextAvailableRowLabel(startIndex: number): { label: string; index: number } {
    let index = startIndex;
    while (true) {
      const candidate = rowLabelFromIndex(index);
      let taken = false;
      for (const el of this.state.getAll()) {
        if (el.type === 'row' && (el as Row).label === candidate) {
          taken = true;
          break;
        }
      }
      if (!taken) return { label: candidate, index };
      index++;
    }
  }

  nextAvailableTableLabel(startCounter: number): { label: string; counter: number } {
    let counter = startCounter;
    while (true) {
      const candidate = `T${counter}`;
      if (!this.isTableLabelTaken(candidate)) return { label: candidate, counter };
      counter++;
    }
  }

  nextAvailableStandaloneSeatLabel(startCounter: number): { label: string; counter: number } {
    let counter = startCounter;
    while (true) {
      const candidate = `S-${counter}`;
      let taken = false;
      for (const el of this.state.getAll()) {
        if (el.type === 'seat' && (el as Seat).label === candidate) {
          taken = true;
          break;
        }
      }
      if (!taken) return { label: candidate, counter };
      counter++;
    }
  }

  resetState(): void {
    const allIds = this.getAllElements().map((el) => el.id);
    this.selection.clearSelection();
    this.spatialIndex.clear();
    this.state.clear();
    this.history.clear();
    if (allIds.length > 0) {
      this.events.emit('elements:removed', { elementIds: allIds });
    }
    this.events.emit('selection:changed', { selectedIds: [] });
    this.events.emit('layout:loaded', {});
  }

  loadLayout(layout: MapLayout): void {
    this.selection.clearSelection();
    this.spatialIndex.clear();
    this.state.setLayout(layout);
    this.spatialIndex.rebuild(this.state.getAll());
    this.history.clear();
    this.events.emit('selection:changed', { selectedIds: [] });
    this.events.emit('layout:loaded', {});
  }

  dispose(): void {
    this.input.unbind();
    this.events.removeAllListeners();
    this.spatialIndex.clear();
    this.state.clear();
    this.selection.clearSelection();
    this.history.clear();
  }
}
