import type { EditorEngine } from '@/src/engine/EditorEngine';

export class ViewportController {
  private engine: EditorEngine;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  fitToContent(): void {
    const elements = this.engine.getAllElements();
    if (elements.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.bounds.x);
      minY = Math.min(minY, el.bounds.y);
      maxX = Math.max(maxX, el.bounds.x + el.bounds.width);
      maxY = Math.max(maxY, el.bounds.y + el.bounds.height);
    }

    this.engine.viewport.fitToContent({
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    });

    this.emitViewportChange();
  }

  setZoom(zoom: number): void {
    const center = {
      x: this.engine.viewport.canvasWidth / 2,
      y: this.engine.viewport.canvasHeight / 2,
    };
    this.engine.viewport.setZoomAtPoint(zoom, center);
    this.emitViewportChange();
  }

  zoomIn(): void {
    this.setZoom(this.engine.viewport.zoom * 1.2);
  }

  zoomOut(): void {
    this.setZoom(this.engine.viewport.zoom / 1.2);
  }

  resetView(): void {
    this.engine.viewport.zoom = 1;
    this.engine.viewport.panX = 0;
    this.engine.viewport.panY = 0;
    this.emitViewportChange();
  }

  private emitViewportChange(): void {
    this.engine.events.emit('viewport:changed', {
      zoom: this.engine.viewport.zoom,
      panX: this.engine.viewport.panX,
      panY: this.engine.viewport.panY,
    });
    this.engine.events.emit('render:request', {});
  }
}
