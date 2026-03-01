import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point } from '@/src/domain/geometry';
import { angleBetween, snapAngleRad, distance } from '@/src/utils/math';

export class SeatPlacementTool extends BaseTool {
  readonly id = 'seat-placement';
  readonly label = 'Place Seats';
  readonly icon = 'EventSeat';
  readonly cursor = 'crosshair';

  private anchorPoint: Point | null = null;
  private previewPositions: Point[] = [];
  private spacing = 35;

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine || event.button !== 0) return;

    switch (this._currentState) {
      case 'idle':
      case 'preview': {
        const snapResult = this.engine.snap.snapPoint(event.worldPoint);
        this.anchorPoint = event.worldPoint;
        if (snapResult.snappedX || snapResult.snappedY || snapResult.angleTargets.length > 0) {
          this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets, snapResult.angleTargets);
        }
        this.transition('anchor');
        break;
      }
    }
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine) return;

    switch (this._currentState) {
      case 'idle': {
        this.transition('preview');
        this.updatePreview(event.worldPoint);
        break;
      }
      case 'preview': {
        this.updatePreview(event.worldPoint);
        break;
      }
      case 'anchor':
      case 'generating': {
        this.transition('generating');
        this.generateSeats(event.worldPoint);
        break;
      }
    }
  }

  onPointerUp(_event: EditorInputEvent): void {
    if (!this.engine) return;

    if (this._currentState === 'generating') {
      this.commitSeats();
    } else if (this._currentState === 'anchor') {
      // Single click placement: place one seat at anchor
      if (this.anchorPoint) {
        this.previewPositions = [this.anchorPoint];
        this.commitSeats();
      }
    }
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.cancel();
    }
  }

  cancel(): void {
    this.anchorPoint = null;
    this.previewPositions = [];
    this.engine?.events.emit('preview:clear', {});
    this.engine?.guidelines.clear();
    this.transition('idle');
  }

  setSpacing(spacing: number): void {
    this.spacing = spacing;
  }

  private updatePreview(worldPoint: Point): void {
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

  private generateSeats(endPoint: Point): void {
    if (!this.engine || !this.anchorPoint) return;

    const snapResult = this.engine.snap.snapPoint(endPoint);

    if (snapResult.snappedX || snapResult.snappedY || snapResult.angleTargets.length > 0) {
      this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets, snapResult.angleTargets);
    } else {
      this.engine.guidelines.clear();
    }

    // Snap the drag angle to clean integer degrees (hard snap near key angles)
    const rawAngle = angleBetween(this.anchorPoint, endPoint);
    const snappedAngle = snapAngleRad(rawAngle);
    const dist = distance(this.anchorPoint, endPoint);
    const snappedEndPoint: Point = {
      x: this.anchorPoint.x + Math.cos(snappedAngle) * dist,
      y: this.anchorPoint.y + Math.sin(snappedAngle) * dist,
    };

    const seats = this.engine.seatGeneration.generateAlongLine(
      this.anchorPoint,
      snappedEndPoint,
      this.spacing,
    );
    this.previewPositions = seats;

    this.engine.events.emit('preview:seats', {
      seats,
      anchorPoint: this.anchorPoint,
      cursorPoint: endPoint,
      angle: snappedAngle,
      seatCount: seats.length,
    });
  }

  private commitSeats(): void {
    if (!this.engine || this.previewPositions.length === 0) return;

    this.engine.placement.placeSeats(this.previewPositions);

    this.previewPositions = [];
    this.anchorPoint = null;
    this.engine.events.emit('preview:clear', {});
    this.engine.guidelines.clear();
    this.transition('idle');
  }
}
