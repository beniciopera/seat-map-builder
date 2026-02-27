import Konva from 'konva';
import type { Guideline } from '@/src/domain/geometry';

export class GuidelinesLayer {
  readonly layer: Konva.Layer;
  private lines: Konva.Line[] = [];

  constructor() {
    this.layer = new Konva.Layer({ name: 'guidelines', listening: false });
  }

  updateGuidelines(guidelines: Guideline[], visibleBounds: { x: number; y: number; width: number; height: number }): void {
    // Clear old lines
    for (const line of this.lines) {
      line.destroy();
    }
    this.lines = [];

    for (const gl of guidelines) {
      const color = gl.alignmentType === 'center' ? '#E91E63' : '#00BCD4';
      let points: number[];

      if (gl.axis === 'vertical') {
        points = [gl.position, visibleBounds.y - 1000, gl.position, visibleBounds.y + visibleBounds.height + 1000];
      } else {
        points = [visibleBounds.x - 1000, gl.position, visibleBounds.x + visibleBounds.width + 1000, gl.position];
      }

      const line = new Konva.Line({
        points,
        stroke: color,
        strokeWidth: 1 / 1, // Will be adjusted by zoom
        dash: [4, 4],
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
