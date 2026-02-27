import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point } from '@/src/domain/geometry';

export class PanTool extends BaseTool {
  readonly id = 'pan';
  readonly label = 'Pan';
  readonly icon = 'PanTool';
  readonly cursor = 'grab';

  private lastPanPoint: Point | null = null;

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine) return;
    if (event.button !== 0) return;

    this.lastPanPoint = { x: event.screenPoint.x, y: event.screenPoint.y };
    this.transition('panning');
    this.engine.events.emit('cursor:changed', { cursor: 'grabbing' });
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine || this._currentState !== 'panning' || !this.lastPanPoint) return;

    const dx = event.screenPoint.x - this.lastPanPoint.x;
    const dy = event.screenPoint.y - this.lastPanPoint.y;
    this.engine.viewport.panBy(dx, dy);
    this.lastPanPoint = { x: event.screenPoint.x, y: event.screenPoint.y };
    this.engine.events.emit('viewport:changed', {
      zoom: this.engine.viewport.zoom,
      panX: this.engine.viewport.panX,
      panY: this.engine.viewport.panY,
    });
    this.engine.events.emit('render:request', {});
  }

  onPointerUp(event: EditorInputEvent): void {
    if (!this.engine) return;
    if (event.button !== 0) return;

    this.lastPanPoint = null;
    this.transition('idle');
    this.engine.events.emit('cursor:changed', { cursor: 'grab' });
  }

  cancel(): void {
    this.lastPanPoint = null;
    if (this.engine) {
      this.engine.events.emit('cursor:changed', { cursor: 'grab' });
    }
    this.transition('idle');
  }
}
