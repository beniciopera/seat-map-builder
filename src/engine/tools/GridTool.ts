import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point } from '@/src/domain/geometry';
import { angleBetween, snapAngleRad, distance } from '@/src/utils/math';

interface GridResult {
  /** All seat positions, organized as a flat array (row-major: row0 seats, row1 seats, ...) */
  allSeats: Point[];
  /** Seat positions grouped per row */
  rowPositions: Point[][];
  rowCount: number;
  colCount: number;
  perpAngle: number;
}

export class GridTool extends BaseTool {
  readonly id = 'grid';
  readonly label = 'Grid Generator';
  readonly icon = 'GridView';
  readonly cursor = 'crosshair';

  private originPoint: Point | null = null;
  private rowAngle = 0;
  private seatCount = 0;
  private firstRowPositions: Point[] = [];
  private spacing = 35;
  private rowSpacing = 40;

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine || event.button !== 0) return;

    switch (this._currentState) {
      case 'idle':
      case 'preview': {
        const snapResult = this.engine.snap.snapPoint(event.worldPoint);
        this.originPoint = event.worldPoint;
        if (snapResult.snappedX || snapResult.snappedY || snapResult.angleTargets.length > 0) {
          this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets, snapResult.angleTargets);
        }
        this.transition('dragging');
        break;
      }
      case 'rows-pending': {
        // Commit the grid
        this.commitGrid(event.worldPoint);
        break;
      }
    }
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine) return;

    switch (this._currentState) {
      case 'idle': {
        this.transition('preview');
        this.updateIdlePreview(event.worldPoint);
        break;
      }
      case 'preview': {
        this.updateIdlePreview(event.worldPoint);
        break;
      }
      case 'dragging': {
        this.updateFirstRowPreview(event.worldPoint);
        break;
      }
      case 'rows-pending': {
        this.updateGridPreview(event.worldPoint);
        break;
      }
    }
  }

  onPointerUp(_event: EditorInputEvent): void {
    if (this._currentState !== 'dragging') return;

    if (this.firstRowPositions.length > 0) {
      this.transition('rows-pending');
    } else {
      this.cancel();
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.cancel();
    }
  }

  cancel(): void {
    this.originPoint = null;
    this.firstRowPositions = [];
    this.seatCount = 0;
    this.rowAngle = 0;
    this.engine?.events.emit('preview:clear', {});
    this.engine?.guidelines.clear();
    this.transition('idle');
  }

  setSpacing(spacing: number): void {
    this.spacing = spacing;
  }

  setRowSpacing(rowSpacing: number): void {
    this.rowSpacing = rowSpacing;
  }

  private updateIdlePreview(worldPoint: Point): void {
    if (!this.engine) return;
    const snapResult = this.engine.snap.snapPoint(worldPoint);
    if (snapResult.snappedX || snapResult.snappedY || snapResult.angleTargets.length > 0) {
      this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets, snapResult.angleTargets);
    } else {
      this.engine.guidelines.clear();
    }
    this.engine.events.emit('preview:seats', {
      seats: [worldPoint],
      anchorPoint: worldPoint,
    });
  }

  private updateFirstRowPreview(endPoint: Point): void {
    if (!this.engine || !this.originPoint) return;

    const snapResult = this.engine.snap.snapPoint(endPoint);

    if (snapResult.snappedX || snapResult.snappedY || snapResult.angleTargets.length > 0) {
      this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets, snapResult.angleTargets);
    } else {
      this.engine.guidelines.clear();
    }

    // Snap the drag angle to clean integer degrees (hard snap near key angles)
    const rawAngle = angleBetween(this.originPoint, endPoint);
    const snappedAngle = snapAngleRad(rawAngle);
    const dist = distance(this.originPoint, endPoint);
    const snappedEndPoint: Point = {
      x: this.originPoint.x + Math.cos(snappedAngle) * dist,
      y: this.originPoint.y + Math.sin(snappedAngle) * dist,
    };

    const seats = this.engine.seatGeneration.generateAlongLine(
      this.originPoint,
      snappedEndPoint,
      this.spacing,
    );

    this.firstRowPositions = seats;
    this.seatCount = seats.length;
    this.rowAngle = snappedAngle;

    this.engine.events.emit('preview:grid', {
      seats,
      anchorPoint: this.originPoint,
      cursorPoint: endPoint,
      angle: this.rowAngle,
      rows: 1,
      cols: this.seatCount,
    });
  }

  private updateGridPreview(mousePoint: Point): void {
    if (!this.engine || !this.originPoint || this.firstRowPositions.length === 0) return;

    // Show guidelines for alignment (visual only)
    const snapResult = this.engine.snap.snapPoint(mousePoint);

    if (snapResult.snappedX || snapResult.snappedY || snapResult.angleTargets.length > 0) {
      this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets, snapResult.angleTargets);
    } else {
      this.engine.guidelines.clear();
    }

    const grid = this.generateGrid(mousePoint);

    this.engine.events.emit('preview:grid', {
      seats: grid.allSeats,
      anchorPoint: this.originPoint,
      cursorPoint: mousePoint,
      angle: this.rowAngle,
      rows: grid.rowCount,
      cols: grid.colCount,
    });
  }

  private commitGrid(mousePoint: Point): void {
    if (!this.engine || !this.originPoint || this.firstRowPositions.length === 0) return;

    const grid = this.generateGrid(mousePoint);

    this.engine.placement.placeGrid(grid.rowPositions);

    this.originPoint = null;
    this.firstRowPositions = [];
    this.seatCount = 0;
    this.rowAngle = 0;
    this.engine.events.emit('preview:clear', {});
    this.engine.guidelines.clear();
    this.transition('idle');
  }

  /**
   * Shared grid generation used by both preview and commit.
   * Guarantees identical coordinates in both paths (WYSIWYG).
   */
  private generateGrid(mousePoint: Point): GridResult {
    const perpDistance = this.perpendicularDistance(mousePoint);
    const rowCount = Math.max(1, Math.floor(Math.abs(perpDistance) / this.rowSpacing) + 1);

    // Perpendicular direction follows the mouse:
    // Positive perpDistance means mouse is "left" of the row vector (screen-relative),
    // so rows should extend toward the mouse, not away from it.
    const perpAngle = perpDistance >= 0
      ? this.rowAngle - Math.PI / 2
      : this.rowAngle + Math.PI / 2;

    const allSeats: Point[] = [];
    const rowPositions: Point[][] = [];

    for (let r = 0; r < rowCount; r++) {
      const offsetX = Math.cos(perpAngle) * this.rowSpacing * r;
      const offsetY = Math.sin(perpAngle) * this.rowSpacing * r;

      const rowSeats: Point[] = [];
      for (const seat of this.firstRowPositions) {
        const p = {
          x: seat.x + offsetX,
          y: seat.y + offsetY,
        };
        allSeats.push(p);
        rowSeats.push(p);
      }
      rowPositions.push(rowSeats);
    }

    return { allSeats, rowPositions, rowCount, colCount: this.seatCount, perpAngle };
  }

  /**
   * Signed perpendicular distance from a point to the first row line.
   * Uses the 2D cross product: (point - origin) x direction.
   */
  private perpendicularDistance(point: Point): number {
    if (!this.originPoint) return 0;

    const dx = point.x - this.originPoint.x;
    const dy = point.y - this.originPoint.y;

    const dirX = Math.cos(this.rowAngle);
    const dirY = Math.sin(this.rowAngle);

    return dx * dirY - dy * dirX;
  }
}
