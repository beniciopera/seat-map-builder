import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point } from '@/src/domain/geometry';
import type { Area } from '@/src/domain/types';
import { generateElementId } from '@/src/domain/ids';
import { DEFAULT_TRANSFORM } from '@/src/domain/geometry';
import { CreateAreaCommand } from '../commands/CreateAreaCommand';

export class AreaTool extends BaseTool {
  readonly id = 'area';
  readonly label = 'Draw Area';
  readonly icon = 'CropFree';
  readonly cursor = 'crosshair';

  private startPoint: Point | null = null;
  private areaCounter = 0;

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine || event.button !== 0) return;

    this.startPoint = event.worldPoint;
    this.transition('drawing');
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine) return;

    if (this._currentState === 'drawing' && this.startPoint) {
      const endPoint = event.worldPoint;

      // Compute the rectangle
      const x = Math.min(this.startPoint.x, endPoint.x);
      const y = Math.min(this.startPoint.y, endPoint.y);
      const width = Math.abs(endPoint.x - this.startPoint.x);
      const height = Math.abs(endPoint.y - this.startPoint.y);

      // Show visual guidelines
      const snapResult = this.engine.snap.snapPoint(event.worldPoint);
      if (snapResult.snappedX || snapResult.snappedY || snapResult.angleTargets.length > 0) {
        this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets, snapResult.angleTargets);
      } else {
        this.engine.guidelines.clear();
      }

      // Emit area preview
      this.engine.events.emit('preview:area', {
        rect: { x, y, width, height },
        color: '#2196F3',
        label: `Area ${this.areaCounter + 1}`,
        cursorPoint: event.worldPoint,
      });
    }
  }

  onPointerUp(event: EditorInputEvent): void {
    if (!this.engine || !this.startPoint) return;

    if (this._currentState === 'drawing') {
      const endPoint = event.worldPoint;

      const x = Math.min(this.startPoint.x, endPoint.x);
      const y = Math.min(this.startPoint.y, endPoint.y);
      const width = Math.abs(endPoint.x - this.startPoint.x);
      const height = Math.abs(endPoint.y - this.startPoint.y);

      if (width > 10 && height > 10) {
        const area: Area = {
          id: generateElementId(),
          type: 'area',
          label: `Area ${++this.areaCounter}`,
          color: '#2196F3',
          rowIds: [],
          locked: false,
          visible: true,
          transform: {
            ...DEFAULT_TRANSFORM,
            position: { x: x + width / 2, y: y + height / 2 },
          },
          bounds: { x, y, width, height },
        };

        const cmd = new CreateAreaCommand(this.engine, area);
        this.engine.history.execute(cmd);
      }

      // Clear preview and guidelines
      this.engine.events.emit('preview:clear', {} as Record<string, never>);
      this.engine.guidelines.clear();
      this.startPoint = null;
      this.transition('idle');
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.cancel();
  }

  onDeactivate(): void {
    this.engine?.events.emit('preview:clear', {} as Record<string, never>);
    this.engine?.guidelines.clear();
    super.onDeactivate();
  }

  cancel(): void {
    this.engine?.events.emit('preview:clear', {} as Record<string, never>);
    this.engine?.guidelines.clear();
    this.startPoint = null;
    this.transition('idle');
  }
}
