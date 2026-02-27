import type { Point } from '@/src/domain/geometry';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function angleBetween(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
}

export function pointAdd(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function pointSub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function pointScale(p: Point, s: number): Point {
  return { x: p.x * s, y: p.y * s };
}

/**
 * Compute arc geometry from two endpoints and a sagitta (perpendicular midpoint displacement).
 * Returns the arc center, radius, and start/end angles.
 */
export function arcFromSagitta(
  first: Point,
  last: Point,
  sagitta: number,
): { center: Point; radius: number; startAngle: number; endAngle: number; angleDiff: number } {
  const chord = distance(first, last);
  const radius = (chord * chord) / (8 * Math.abs(sagitta)) + Math.abs(sagitta) / 2;

  const angle = angleBetween(first, last);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);

  const midX = (first.x + last.x) / 2;
  const midY = (first.y + last.y) / 2;

  const sign = sagitta > 0 ? 1 : -1;
  const centerOffset = radius - Math.abs(sagitta);
  const center: Point = {
    x: midX - perpX * centerOffset * sign,
    y: midY - perpY * centerOffset * sign,
  };

  const startAngle = Math.atan2(first.y - center.y, first.x - center.x);
  const endAngle = Math.atan2(last.y - center.y, last.x - center.x);

  let angleDiff = endAngle - startAngle;
  while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
  while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

  return { center, radius, startAngle, endAngle, angleDiff };
}
