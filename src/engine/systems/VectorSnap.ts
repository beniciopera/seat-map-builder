import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';
import type { Area, MapElement, ElementId } from '@/src/domain/types';
import { isArea } from '@/src/domain/types';

const KEY_ANGLES_DEG = [0, 45, 90, 135, 180, 225, 270, 315];
const HARD_SNAP_DEG_THRESHOLD = 5; // degrees within which we snap to key angle
const DEFAULT_THRESHOLD_PX = 8;

export interface AngleSnapResult {
  readonly snappedPoint: Point;
  readonly angleDeg: number;
}

export interface VertexEdgeSnapResult {
  readonly snappedPoint: Point;
  readonly snappedTo: 'vertex' | 'edge' | null;
}

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function normalizeAngleDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

/**
 * Snap a segment from fromPoint toward cursorPoint to key angles (0°, 45°, ...) or integer degrees.
 * Returns the snapped point on the same ray at the same distance as cursorPoint.
 */
export function snapAngleFromPoint(
  fromPoint: Point,
  cursorPoint: Point,
  zoom: number
): AngleSnapResult {
  const dx = cursorPoint.x - fromPoint.x;
  const dy = cursorPoint.y - fromPoint.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1e-6) {
    return { snappedPoint: { ...cursorPoint }, angleDeg: 0 };
  }

  let angleRad = Math.atan2(dy, dx);
  let angleDeg = normalizeAngleDeg((angleRad * 180) / Math.PI);

  // Hard snap: within threshold of a key angle
  for (const key of KEY_ANGLES_DEG) {
    let diff = Math.abs(angleDeg - key);
    if (diff > 180) diff = 360 - diff;
    if (diff <= HARD_SNAP_DEG_THRESHOLD) {
      angleDeg = key;
      break;
    }
  }

  // Soft snap: nearest integer degree (if not already key)
  const keyMatch = KEY_ANGLES_DEG.some(
    (k) => Math.abs(normalizeAngleDeg(angleDeg - k)) < 0.5
  );
  if (!keyMatch) {
    angleDeg = Math.round(angleDeg);
    if (angleDeg >= 360) angleDeg = 0;
  }

  const rad = (angleDeg * Math.PI) / 180;
  const snappedPoint: Point = {
    x: fromPoint.x + Math.cos(rad) * dist,
    y: fromPoint.y + Math.sin(rad) * dist,
  };

  return { snappedPoint, angleDeg };
}

/**
 * Snap point to nearest vertex or edge of existing elements within world threshold.
 */
export function snapToVerticesAndEdges(
  point: Point,
  engine: EditorEngine,
  excludeIds: Set<string> = new Set()
): VertexEdgeSnapResult {
  const worldThreshold = DEFAULT_THRESHOLD_PX / engine.viewport.zoom;
  const searchRadius = worldThreshold * 4;
  const nearbyIds = engine.spatialIndex.queryRadius(point, searchRadius);

  let bestPoint: Point = point;
  let bestDist = worldThreshold;
  let snappedTo: 'vertex' | 'edge' | null = null;

  for (const id of nearbyIds) {
    if (excludeIds.has(id as string)) continue;
    const el = engine.state.get(id);
    if (!el || !el.visible) continue;

    const vertices = getElementVertices(el, engine);
    const edges = getElementEdges(el);

    for (const v of vertices) {
      const d = distance(point, v);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = v;
        snappedTo = 'vertex';
      }
    }

    for (const edge of edges) {
      const proj = projectPointOntoSegment(point, edge.start, edge.end);
      const d = distance(point, proj);
      if (d < bestDist) {
        bestDist = d;
        bestPoint = proj;
        snappedTo = 'edge';
      }
    }
  }

  return {
    snappedPoint: bestPoint,
    snappedTo,
  };
}

interface Edge {
  start: Point;
  end: Point;
}

function getElementVertices(el: MapElement, engine: EditorEngine): Point[] {
  if (isArea(el)) {
    const area = el as Area;
    if (area.vertices && area.vertices.length >= 3) {
      return [...area.vertices];
    }
    const b = area.bounds;
    return [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ];
  }
  if (el.type === 'seat' || el.type === 'table') {
    return [el.transform.position];
  }
  if (el.type === 'row') {
    const row = el as { seatIds: readonly ElementId[] };
    const out: Point[] = [];
    for (const sid of row.seatIds) {
      const seat = engine.state.get(sid);
      if (seat && seat.type === 'seat') out.push(seat.transform.position);
    }
    return out;
  }
  return [];
}

function getElementEdges(el: MapElement): Edge[] {
  if (isArea(el)) {
    const area = el as Area;
    if (area.vertices && area.vertices.length >= 3) {
      const edges: Edge[] = [];
      for (let i = 0; i < area.vertices.length; i++) {
        const next = (i + 1) % area.vertices.length;
        edges.push({
          start: area.vertices[i],
          end: area.vertices[next],
        });
      }
      return edges;
    }
    const b = area.bounds;
    return [
      { start: { x: b.x, y: b.y }, end: { x: b.x + b.width, y: b.y } },
      { start: { x: b.x + b.width, y: b.y }, end: { x: b.x + b.width, y: b.y + b.height } },
      { start: { x: b.x + b.width, y: b.y + b.height }, end: { x: b.x, y: b.y + b.height } },
      { start: { x: b.x, y: b.y + b.height }, end: { x: b.x, y: b.y } },
    ];
  }
  return [];
}

function projectPointOntoSegment(
  p: Point,
  a: Point,
  b: Point
): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return { ...a };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return {
    x: a.x + t * dx,
    y: a.y + t * dy,
  };
}
