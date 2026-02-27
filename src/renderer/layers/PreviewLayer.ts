import Konva from 'konva';
import type { Point, Rect } from '@/src/domain/geometry';
import { DEFAULT_SEAT_RADIUS } from '@/src/domain/constraints';
import { hexToRgba } from '@/src/utils/color';

export class PreviewLayer {
  readonly layer: Konva.Layer;
  private ghostNodes: Konva.Shape[] = [];
  private anchorMarker: Konva.Circle | null = null;
  private directionLine: Konva.Line | null = null;

  // Pooled nodes for grid preview to avoid destroy/recreate each frame
  private gridSeatPool: Konva.Circle[] = [];
  private gridLinePool: Konva.Line[] = [];
  private gridTooltip: Konva.Text | null = null;
  private gridPoolActive = 0;
  private gridLinePoolActive = 0;

  // Pooled nodes for area preview
  private areaRect: Konva.Rect | null = null;
  private areaLabel: Konva.Text | null = null;
  private areaTooltip: Konva.Text | null = null;

  constructor() {
    this.layer = new Konva.Layer({ name: 'preview', listening: false });
  }

  showSeatPreviews(seats: Point[], anchorPoint: Point): void {
    this.clearGhosts();

    // Draw anchor marker
    if (!this.anchorMarker) {
      this.anchorMarker = new Konva.Circle({
        radius: 4,
        fill: '#E91E63',
        listening: false,
      });
      this.layer.add(this.anchorMarker);
    }
    this.anchorMarker.x(anchorPoint.x);
    this.anchorMarker.y(anchorPoint.y);
    this.anchorMarker.visible(true);

    // Draw direction line if multiple seats
    if (seats.length > 1) {
      const first = seats[0];
      const last = seats[seats.length - 1];
      if (!this.directionLine) {
        this.directionLine = new Konva.Line({
          stroke: '#E91E63',
          strokeWidth: 1,
          dash: [6, 4],
          listening: false,
        });
        this.layer.add(this.directionLine);
      }
      this.directionLine.points([first.x, first.y, last.x, last.y]);
      this.directionLine.visible(true);
    } else if (this.directionLine) {
      this.directionLine.visible(false);
    }

    // Draw ghost seats
    for (const pos of seats) {
      const ghost = new Konva.Circle({
        x: pos.x,
        y: pos.y,
        radius: DEFAULT_SEAT_RADIUS,
        fill: 'rgba(255, 255, 255, 0.5)',
        stroke: 'rgba(76, 175, 80, 0.5)',
        strokeWidth: 2,
        listening: false,
      });
      this.layer.add(ghost);
      this.ghostNodes.push(ghost);
    }

    this.layer.batchDraw();
  }

  showTablePreview(center: Point, tableRadius: number, seatCount: number, seatGap: number, label: string): void {
    this.clearGhosts();

    // Ghost table body
    const tableCircle = new Konva.Circle({
      x: center.x,
      y: center.y,
      radius: tableRadius,
      fill: 'rgba(161, 135, 127, 0.4)',
      stroke: 'rgba(141, 110, 99, 0.5)',
      strokeWidth: 2,
      listening: false,
    });
    this.layer.add(tableCircle);
    this.ghostNodes.push(tableCircle);

    // Ghost seats
    const seatRadius = DEFAULT_SEAT_RADIUS;
    const seatDistFromCenter = tableRadius + seatRadius + seatGap;
    for (let i = 0; i < seatCount; i++) {
      const angle = (2 * Math.PI * i) / seatCount;
      const seatX = center.x + Math.cos(angle) * seatDistFromCenter;
      const seatY = center.y + Math.sin(angle) * seatDistFromCenter;
      const ghost = new Konva.Circle({
        x: seatX,
        y: seatY,
        radius: seatRadius,
        fill: 'rgba(255, 255, 255, 0.3)',
        stroke: 'rgba(141, 110, 99, 0.4)',
        strokeWidth: 1,
        listening: false,
      });
      this.layer.add(ghost);
      this.ghostNodes.push(ghost);
    }

    // Label text
    const text = new Konva.Text({
      x: center.x,
      y: center.y,
      text: label,
      fontSize: 16,
      fontStyle: 'bold',
      fill: 'rgba(255, 255, 255, 0.7)',
      listening: false,
      align: 'center',
      verticalAlign: 'middle',
    });
    text.offsetX(text.width() / 2);
    text.offsetY(text.height() / 2);
    this.layer.add(text);
    this.ghostNodes.push(text);

    this.layer.batchDraw();
  }

  showGridPreview(
    seats: Point[],
    anchorPoint: Point,
    cursorPoint: Point,
    angle: number,
    rows: number,
    cols: number,
  ): void {
    // --- Anchor marker (persistent, reused) ---
    if (!this.anchorMarker) {
      this.anchorMarker = new Konva.Circle({
        radius: 4,
        fill: '#E91E63',
        listening: false,
      });
      this.layer.add(this.anchorMarker);
    }
    this.anchorMarker.x(anchorPoint.x);
    this.anchorMarker.y(anchorPoint.y);
    this.anchorMarker.visible(true);

    // --- Direction line along the first row ---
    if (cols > 1 && seats.length >= cols) {
      const first = seats[0];
      const last = seats[cols - 1];
      if (!this.directionLine) {
        this.directionLine = new Konva.Line({
          stroke: '#E91E63',
          strokeWidth: 1,
          dash: [6, 4],
          listening: false,
        });
        this.layer.add(this.directionLine);
      }
      this.directionLine.points([first.x, first.y, last.x, last.y]);
      this.directionLine.visible(true);
    } else if (this.directionLine) {
      this.directionLine.visible(false);
    }

    // --- Ghost seats (pooled for performance) ---
    this.gridPoolActive = 0;
    for (let i = 0; i < seats.length; i++) {
      const pos = seats[i];
      let ghost: Konva.Circle;

      if (i < this.gridSeatPool.length) {
        // Reuse existing pooled node
        ghost = this.gridSeatPool[i];
        ghost.x(pos.x);
        ghost.y(pos.y);
        ghost.visible(true);
      } else {
        // Allocate new node into pool
        ghost = new Konva.Circle({
          x: pos.x,
          y: pos.y,
          radius: DEFAULT_SEAT_RADIUS,
          fill: 'rgba(255, 255, 255, 0.5)',
          stroke: 'rgba(76, 175, 80, 0.5)',
          strokeWidth: 2,
          listening: false,
        });
        this.layer.add(ghost);
        this.gridSeatPool.push(ghost);
      }
      this.gridPoolActive++;
    }

    // Hide excess pooled nodes
    for (let i = this.gridPoolActive; i < this.gridSeatPool.length; i++) {
      this.gridSeatPool[i].visible(false);
    }

    // --- Row separator dashed lines (between adjacent rows) ---
    this.gridLinePoolActive = 0;
    if (rows > 1 && cols >= 1) {
      for (let r = 1; r < rows; r++) {
        const rowStartIdx = r * cols;
        const prevRowStartIdx = (r - 1) * cols;

        if (rowStartIdx >= seats.length || prevRowStartIdx >= seats.length) break;

        // Draw a dashed line at the midpoint between two adjacent rows
        const cur0 = seats[rowStartIdx];
        const prev0 = seats[prevRowStartIdx];
        const curLast = seats[Math.min(rowStartIdx + cols - 1, seats.length - 1)];
        const prevLast = seats[Math.min(prevRowStartIdx + cols - 1, seats.length - 1)];

        const midStart = {
          x: (cur0.x + prev0.x) / 2,
          y: (cur0.y + prev0.y) / 2,
        };
        const midEnd = {
          x: (curLast.x + prevLast.x) / 2,
          y: (curLast.y + prevLast.y) / 2,
        };

        let line: Konva.Line;
        const lineIdx = this.gridLinePoolActive;

        if (lineIdx < this.gridLinePool.length) {
          line = this.gridLinePool[lineIdx];
          line.points([midStart.x, midStart.y, midEnd.x, midEnd.y]);
          line.visible(true);
        } else {
          line = new Konva.Line({
            points: [midStart.x, midStart.y, midEnd.x, midEnd.y],
            stroke: 'rgba(76, 175, 80, 0.3)',
            strokeWidth: 1,
            dash: [4, 4],
            listening: false,
          });
          this.layer.add(line);
          this.gridLinePool.push(line);
        }
        this.gridLinePoolActive++;
      }
    }

    // Hide excess pooled lines
    for (let i = this.gridLinePoolActive; i < this.gridLinePool.length; i++) {
      this.gridLinePool[i].visible(false);
    }

    // --- Floating tooltip near cursor ---
    const degrees = Math.round((angle * 180) / Math.PI);
    const tooltipText = `${degrees}°  ${cols}×${rows}`;

    if (!this.gridTooltip) {
      this.gridTooltip = new Konva.Text({
        fontSize: 13,
        fontStyle: 'bold',
        fill: 'rgba(233, 30, 99, 0.9)',
        listening: false,
      });
      this.layer.add(this.gridTooltip);
    }
    this.gridTooltip.text(tooltipText);
    this.gridTooltip.x(cursorPoint.x + 16);
    this.gridTooltip.y(cursorPoint.y - 20);
    this.gridTooltip.visible(true);

    this.layer.batchDraw();
  }

  showAreaPreview(rect: Rect, color: string, label: string, cursorPoint: Point): void {
    // --- Ghost rectangle (persistent, reused) ---
    if (!this.areaRect) {
      this.areaRect = new Konva.Rect({
        dash: [6, 4],
        strokeWidth: 2,
        cornerRadius: 4,
        listening: false,
      });
      this.layer.add(this.areaRect);
    }
    this.areaRect.x(rect.x);
    this.areaRect.y(rect.y);
    this.areaRect.width(rect.width);
    this.areaRect.height(rect.height);
    this.areaRect.fill(hexToRgba(color, 0.08));
    this.areaRect.stroke(color);
    this.areaRect.visible(true);

    // --- Centered label (persistent, reused) ---
    if (!this.areaLabel) {
      this.areaLabel = new Konva.Text({
        fontSize: 13,
        listening: false,
        align: 'center',
        verticalAlign: 'middle',
      });
      this.layer.add(this.areaLabel);
    }
    this.areaLabel.text(label);
    this.areaLabel.fill(hexToRgba(color, 0.7));
    this.areaLabel.width(rect.width);
    this.areaLabel.x(rect.x);
    this.areaLabel.y(rect.y + (rect.height - this.areaLabel.height()) / 2);
    this.areaLabel.visible(true);

    // --- Dimensions tooltip near cursor (persistent, reused) ---
    const w = Math.round(rect.width);
    const h = Math.round(rect.height);
    const tooltipText = `${w} × ${h}`;

    if (!this.areaTooltip) {
      this.areaTooltip = new Konva.Text({
        fontSize: 13,
        fontStyle: 'bold',
        fill: 'rgba(233, 30, 99, 0.9)',
        listening: false,
      });
      this.layer.add(this.areaTooltip);
    }
    this.areaTooltip.text(tooltipText);
    this.areaTooltip.x(cursorPoint.x + 16);
    this.areaTooltip.y(cursorPoint.y - 20);
    this.areaTooltip.visible(true);

    this.layer.batchDraw();
  }

  private clearAreaPool(): void {
    if (this.areaRect) this.areaRect.visible(false);
    if (this.areaLabel) this.areaLabel.visible(false);
    if (this.areaTooltip) this.areaTooltip.visible(false);
  }

  clear(): void {
    this.clearGhosts();
    this.clearGridPool();
    this.clearAreaPool();
    if (this.anchorMarker) {
      this.anchorMarker.visible(false);
    }
    if (this.directionLine) {
      this.directionLine.visible(false);
    }
    this.layer.batchDraw();
  }

  private clearGhosts(): void {
    for (const node of this.ghostNodes) {
      node.destroy();
    }
    this.ghostNodes = [];
  }

  private clearGridPool(): void {
    for (const node of this.gridSeatPool) {
      node.destroy();
    }
    this.gridSeatPool = [];
    this.gridPoolActive = 0;

    for (const node of this.gridLinePool) {
      node.destroy();
    }
    this.gridLinePool = [];
    this.gridLinePoolActive = 0;

    if (this.gridTooltip) {
      this.gridTooltip.visible(false);
    }
  }
}
