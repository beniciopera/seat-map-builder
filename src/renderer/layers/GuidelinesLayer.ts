import Konva from 'konva';
import type { Guideline } from '@/src/domain/geometry';

export class GuidelinesLayer {
  readonly layer: Konva.Layer;
  private lines: Konva.Line[] = [];

  constructor() {
    this.layer = new Konva.Layer({ name: 'guidelines', listening: false });
  }

  updateGuidelines(guidelines: Guideline[], visibleBounds: { x: number; y: number; width: number; height: number }, zoom: number = 1): void {
    // Clear old lines
    for (const line of this.lines) {
      line.destroy();
    }
    this.lines = [];

    // Extend lines well beyond visible bounds
    const extent = Math.max(visibleBounds.width, visibleBounds.height) * 2;

    for (const gl of guidelines) {
      const cosA = Math.cos(gl.angle);
      const sinA = Math.sin(gl.angle);

      const px = gl.throughPoint.x;
      const py = gl.throughPoint.y;

      const points = [
        px - cosA * extent, py - sinA * extent,
        px + cosA * extent, py + sinA * extent,
      ];

      const line = new Konva.Line({
        points,
        stroke: 'rgba(233, 30, 99, 0.35)',
        strokeWidth: 0.5 / zoom,
        listening: false,
      });

      this.layer.add(line);
      this.lines.push(line);
    }

    this.layer.batchDraw();
  }

  clear(): void {
    for (const line of this.lines) {
      line.destroy();
    }
    this.lines = [];
    this.layer.batchDraw();
  }
}
