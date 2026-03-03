import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point } from '@/src/domain/geometry';
import type { Area } from '@/src/domain/types';
import { generateElementId } from '@/src/domain/ids';
import { DEFAULT_TRANSFORM } from '@/src/domain/geometry';
import { CreateAreaCommand } from '../commands/CreateAreaCommand';
import { boundsFromVertices, centerOfVertices } from '@/src/domain/polygon';
import { snapToVerticesAndEdges, snapAngleFromPoint } from '../systems/VectorSnap';

const CLOSE_THRESHOLD_PX = 12;
const MIN_VERTICES_TO_CLOSE = 3;
const DEFAULT_COLOR = '#2196F3';

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export class VectorBrushTool extends BaseTool {
  readonly id = 'vector-brush';
  readonly label = 'Vector Brush';
  readonly icon = 'Brush';
  readonly cursor = 'crosshair';

  private points: Point[] = [];
  private currentAreaLabel = 'Area 1';

  private get closeThresholdWorld(): number {
    if (!this.engine) return CLOSE_THRESHOLD_PX;
    return CLOSE_THRESHOLD_PX / this.engine.viewport.zoom;
  }

  private getSnappedCursor(worldPoint: Point): { point: Point; angleDeg?: number } {
    if (!this.engine) return { point: worldPoint };

    // First snap to existing vertices/edges
    const ve = snapToVerticesAndEdges(worldPoint, this.engine);
    let point = ve.snappedPoint;

    // If we have at least one point, apply angle snap from last point
    if (this.points.length > 0) {
      const last = this.points[this.points.length - 1];
      const angleResult = snapAngleFromPoint(last, point, this.engine.viewport.zoom);
      point = angleResult.snappedPoint;
      return { point, angleDeg: angleResult.angleDeg };
    }

    return { point };
  }

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine || event.button !== 0) return;

    const { point, angleDeg } = this.getSnappedCursor(event.worldPoint);

    if (this._currentState === 'idle') {
      // Starting a new shape: clear selection so the previous shape is not still selected
      if (!event.shiftKey) {
        this.engine.selection.clearSelection();
        this.engine.events.emit('selection:changed', { selectedIds: [] });
      }
      this.currentAreaLabel = this.engine.nextAvailableAreaLabel(1).label;
      this.points = [point];
      this.transition('drawing');
      this.engine.events.emit('preview:polygon', {
        points: this.points,
        cursorPoint: point,
        color: DEFAULT_COLOR,
        label: this.currentAreaLabel,
        angleDeg,
      });
      return;
    }

    if (this._currentState === 'drawing') {
      const first = this.points[0];
      const canClose = this.points.length >= MIN_VERTICES_TO_CLOSE && distance(point, first) < this.closeThresholdWorld;

      if (canClose) {
        // Close the shape: use current points as closed polygon (no duplicate first at end)
        const vertices = [...this.points];
        const bounds = boundsFromVertices(vertices);
        const position = centerOfVertices(vertices);

        const area: Area = {
          id: generateElementId(),
          type: 'area',
          label: this.currentAreaLabel,
          color: DEFAULT_COLOR,
          rowIds: [],
          locked: false,
          visible: true,
          transform: { ...DEFAULT_TRANSFORM, position, rotation: 0 },
          bounds,
          vertices,
        };

        const cmd = new CreateAreaCommand(this.engine, area);
        this.engine.history.execute(cmd);
        this.engine.selection.selectMultiple([area.id]);
        this.engine.events.emit('selection:changed', { selectedIds: [area.id] });

        this.points = [];
        this.engine.events.emit('preview:clear', {} as Record<string, never>);
        this.engine.guidelines.clear();
        this.transition('idle');
        return;
      }

      this.points.push(point);
      this.engine.events.emit('preview:polygon', {
        points: this.points,
        cursorPoint: point,
        color: DEFAULT_COLOR,
        label: this.currentAreaLabel,
        angleDeg,
      });
    }
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine) return;

    if (this._currentState === 'drawing' && this.points.length > 0) {
      const { point, angleDeg } = this.getSnappedCursor(event.worldPoint);
      this.engine.events.emit('preview:polygon', {
        points: this.points,
        cursorPoint: point,
        color: DEFAULT_COLOR,
        label: this.currentAreaLabel,
        angleDeg,
      });
    }
  }

  onPointerUp(_event: EditorInputEvent): void {
    // Click-only placement; no-op on pointer up
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.cancel();
  }

  onDeactivate(): void {
    this.engine?.events.emit('preview:clear', {} as Record<string, never>);
    this.engine?.guidelines.clear();
    this.points = [];
    super.onDeactivate();
  }

  cancel(): void {
    this.engine?.events.emit('preview:clear', {} as Record<string, never>);
    this.engine?.guidelines.clear();
    this.points = [];
    this.transition('idle');
  }
}
