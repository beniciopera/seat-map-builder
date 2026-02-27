import Konva from 'konva';
import type { Point, Rect } from '@/src/domain/geometry';
import type { ViewportState } from '@/src/engine/state/ViewportState';

export class Camera {
  private viewport: ViewportState;
  private stage: Konva.Stage | null = null;

  constructor(viewport: ViewportState) {
    this.viewport = viewport;
  }

  setStage(stage: Konva.Stage): void {
    this.stage = stage;
  }

  applyTransform(): void {
    if (!this.stage) return;
    this.stage.scale({ x: this.viewport.zoom, y: this.viewport.zoom });
    this.stage.position({ x: this.viewport.panX, y: this.viewport.panY });
    this.stage.batchDraw();
  }

  screenToWorld(screen: Point): Point {
    return this.viewport.screenToWorld(screen);
  }

  worldToScreen(world: Point): Point {
    return this.viewport.worldToScreen(world);
  }

  getVisibleBounds(): Rect {
    return this.viewport.getVisibleRect();
  }

  getScale(): number {
    return this.viewport.zoom;
  }
}
