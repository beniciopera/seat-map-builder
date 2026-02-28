import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point, Rect } from '@/src/domain/geometry';
import type { ElementId, MapElement, Seat } from '@/src/domain/types';
import { isSeat } from '@/src/domain/types';

export class SeatPickerTool extends BaseTool {
  readonly id = 'seat-picker';
  readonly label = 'Seat Picker';
  readonly icon = 'Colorize';
  readonly cursor = 'crosshair';

  private boxSelectStart: Point | null = null;
  private boxSelectCurrent: Point | null = null;

  /**
   * Hit-test only seats (ignores rows, tables, areas).
   * Uses the engine's spatial index for efficiency.
   */
  private hitTestSeatOnly(point: Point): Seat | null {
    if (!this.engine) return null;

    const nearbyIds = this.engine.spatialIndex.queryRadius(point, 20);
    let closest: Seat | null = null;
    let closestDist = Infinity;

    for (const id of nearbyIds) {
      const el = this.engine.state.get(id);
      if (!el || !el.visible || el.type !== 'seat') continue;

      const seat = el as Seat;
      const dx = point.x - seat.transform.position.x;
      const dy = point.y - seat.transform.position.y;
      if (dx * dx + dy * dy > seat.radius * seat.radius) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = seat;
      }
    }

    return closest;
  }

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine) return;

    const point = event.worldPoint;
    if (!point) return;
    const seat = this.hitTestSeatOnly(point);

    if (seat) {
      // Shift/Ctrl+click toggles individual seats
      if (event.shiftKey || event.ctrlKey) {
        const currentIds = this.engine.selection.getSelectedIds();
        if (currentIds.includes(seat.id)) {
          // Deselect this seat
          const newIds = currentIds.filter((id) => id !== seat.id);
          this.engine.selection.selectMultiple(newIds);
        } else {
          // Add this seat to selection
          this.engine.selection.selectMultiple([...currentIds, seat.id]);
        }
      } else {
        // Single click selects only this seat
        this.engine.selection.select(seat.id);
      }
      this.engine.events.emit('selection:changed', {
        selectedIds: this.engine.selection.getSelectedIds(),
      });
    } else {
      // Clicked empty space: start box-select
      this.boxSelectStart = point;
      this.boxSelectCurrent = point;
      this.transition('box-selecting');

      // Clear selection unless holding shift/ctrl
      if (!event.shiftKey && !event.ctrlKey) {
        this.engine.selection.clearSelection();
        this.engine.events.emit('selection:changed', { selectedIds: [] });
      }
    }
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine) return;

    if (this._currentState === 'box-selecting' && this.boxSelectStart) {
      this.boxSelectCurrent = event.worldPoint;
      const rect = this.makeRect(this.boxSelectStart, this.boxSelectCurrent);
      this.engine.events.emit('boxselect:update', { rect });

      // Query spatial index and filter to seats with precise circle-rect check
      const allInRect = this.engine.queryRect(rect);
      const seatIds = allInRect
        .filter((el) => {
          if (el.type !== 'seat') return false;
          const seat = el as Seat;
          return this.circleIntersectsRect(seat.transform.position, seat.radius, rect);
        })
        .map((el) => el.id);

      // If shift/ctrl held, merge with existing selection
      if (event.shiftKey || event.ctrlKey) {
        const currentIds = this.engine.selection.getSelectedIds();
        const merged = [...new Set([...currentIds, ...seatIds])];
        this.engine.selection.selectMultiple(merged);
      } else {
        this.engine.selection.selectMultiple(seatIds);
      }
      this.engine.events.emit('selection:changed', {
        selectedIds: this.engine.selection.getSelectedIds(),
      });
    }
  }

  onPointerUp(_event: EditorInputEvent): void {
    if (!this.engine) return;

    if (this._currentState === 'box-selecting') {
      this.engine.events.emit('boxselect:end', {});
      this.boxSelectStart = null;
      this.boxSelectCurrent = null;
      this.transition('idle');
    }
  }

  onDeactivate(): void {
    if (this.engine) {
      this.engine.selection.clearSelection();
      this.engine.events.emit('selection:changed', { selectedIds: [] });
    }
    super.onDeactivate();
  }

  reset(): void {
    this.boxSelectStart = null;
    this.boxSelectCurrent = null;
    super.reset();
  }

  /** Check if a circle (seat) truly intersects an axis-aligned rect. */
  private circleIntersectsRect(center: Point, radius: number, rect: Rect): boolean {
    const closestX = Math.max(rect.x, Math.min(center.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(center.y, rect.y + rect.height));
    const dx = center.x - closestX;
    const dy = center.y - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  private makeRect(a: Point, b: Point): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }
}
