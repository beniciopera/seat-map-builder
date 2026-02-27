import type { Point } from '@/src/domain/geometry';

export interface EditorInputEvent {
  readonly screenPoint: Point;
  readonly worldPoint: Point;
  readonly button: number;
  readonly shiftKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly metaKey: boolean;
  readonly deltaY?: number;
  readonly originalEvent: MouseEvent | WheelEvent | TouchEvent;
}
