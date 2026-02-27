import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point } from '@/src/domain/geometry';

export class SeatPlacementTool extends BaseTool {
  readonly id = 'seat-placement';
  readonly label = 'Place Seats';
  readonly icon = 'EventSeat';
  readonly cursor = 'crosshair';

  private anchorPoint: Point | null = null;
  private previewPositions: Point[] = [];
  private spacing = 40;

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine || event.button !== 0) return;

    switch (this._currentState) {
      case 'idle':
      case 'preview': {
        const snapResult = this.engine.snap.snapPoint(event.worldPoint);
        this.anchorPoint = snapResult.snappedPoint;
        if (snapResult.snappedX || snapResult.snappedY) {
          this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets);
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
    if (snapResult.snappedX || snapResult.snappedY) {
      this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets);
    } else {
      this.engine.guidelines.clear();
    }
    this.engine.events.emit('preview:seats', {
      seats: [snapResult.snappedPoint],
      anchorPoint: snapResult.snappedPoint,
    });
  }

  private generateSeats(endPoint: Point): void {
    if (!this.engine || !this.anchorPoint) return;

    const snapResult = this.engine.snap.snapPoint(endPoint);
    const snappedEnd = snapResult.snappedPoint;

    if (snapResult.snappedX || snapResult.snappedY) {
      this.engine.guidelines.computeFromSnapTargets(snapResult.matchedTargets);
    } else {
      this.engine.guidelines.clear();
    }

    const seats = this.engine.seatGeneration.generateAlongLine(
      this.anchorPoint,
      snappedEnd,
      this.spacing,
    );
    this.previewPositions = seats;

    this.engine.events.emit('preview:seats', {
      seats,
      anchorPoint: this.anchorPoint,
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
