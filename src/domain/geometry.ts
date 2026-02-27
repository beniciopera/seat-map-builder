export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Transform {
  readonly position: Point;
  readonly rotation: number;
  readonly scale: Point;
}

export interface LineSegment {
  readonly start: Point;
  readonly end: Point;
}

export interface Guideline {
  readonly axis: 'horizontal' | 'vertical';
  readonly position: number;
  readonly sourceElementId: string;
  readonly alignmentType: 'center' | 'edge-start' | 'edge-end';
}

export const DEFAULT_TRANSFORM: Transform = {
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
};

export const ZERO_POINT: Point = { x: 0, y: 0 };

export const EMPTY_RECT: Rect = { x: 0, y: 0, width: 0, height: 0 };
