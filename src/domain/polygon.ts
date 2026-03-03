import type { Point, Rect } from './geometry';

/**
 * Compute axis-aligned bounding box from polygon vertices.
 */
export function boundsFromVertices(vertices: readonly Point[]): Rect {
  if (vertices.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minX = vertices[0].x;
  let minY = vertices[0].y;
  let maxX = vertices[0].x;
  let maxY = vertices[0].y;
  for (let i = 1; i < vertices.length; i++) {
    const p = vertices[i];
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Center (centroid) of polygon vertices.
 */
export function centerOfVertices(vertices: readonly Point[]): Point {
  if (vertices.length === 0) {
    return { x: 0, y: 0 };
  }
  let sumX = 0;
  let sumY = 0;
  for (const p of vertices) {
    sumX += p.x;
    sumY += p.y;
  }
  return {
    x: sumX / vertices.length,
    y: sumY / vertices.length,
  };
}

/**
 * Ray-casting point-in-polygon test.
 * Returns true if point is inside the polygon (or on the boundary for robustness).
 */
export function pointInPolygon(point: Point, vertices: readonly Point[]): boolean {
  const n = vertices.length;
  if (n < 3) return false;

  const { x, y } = point;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x;
    const yi = vertices[i].y;
    const xj = vertices[j].x;
    const yj = vertices[j].y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
