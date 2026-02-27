import type { Point, Rect } from '@/src/domain/geometry';
import { clamp } from '@/src/utils/math';

export class ViewportState {
  panX = 0;
  panY = 0;
  zoom = 1;
  canvasWidth = 800;
  canvasHeight = 600;

  readonly minZoom = 0.1;
  readonly maxZoom = 5.0;

  screenToWorld(screenPoint: Point): Point {
    return {
      x: (screenPoint.x - this.panX) / this.zoom,
      y: (screenPoint.y - this.panY) / this.zoom,
    };
  }

  worldToScreen(worldPoint: Point): Point {
    return {
      x: worldPoint.x * this.zoom + this.panX,
      y: worldPoint.y * this.zoom + this.panY,
    };
  }

  getVisibleRect(): Rect {
    const topLeft = this.screenToWorld({ x: 0, y: 0 });
    const bottomRight = this.screenToWorld({
      x: this.canvasWidth,
      y: this.canvasHeight,
    });
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  setZoomAtPoint(newZoom: number, screenPoint: Point): void {
    const clamped = clamp(newZoom, this.minZoom, this.maxZoom);
    const worldBefore = this.screenToWorld(screenPoint);
    this.zoom = clamped;
    const worldAfter = this.screenToWorld(screenPoint);
    this.panX += (worldAfter.x - worldBefore.x) * this.zoom;
    this.panY += (worldAfter.y - worldBefore.y) * this.zoom;
  }

  panBy(dx: number, dy: number): void {
    this.panX += dx;
    this.panY += dy;
  }

  fitToContent(contentBounds: Rect): void {
    if (contentBounds.width === 0 || contentBounds.height === 0) return;

    const padding = 50;
    const scaleX = (this.canvasWidth - padding * 2) / contentBounds.width;
    const scaleY = (this.canvasHeight - padding * 2) / contentBounds.height;
    this.zoom = clamp(Math.min(scaleX, scaleY), this.minZoom, this.maxZoom);

    const centerX = contentBounds.x + contentBounds.width / 2;
    const centerY = contentBounds.y + contentBounds.height / 2;
    this.panX = this.canvasWidth / 2 - centerX * this.zoom;
    this.panY = this.canvasHeight / 2 - centerY * this.zoom;
  }
}
