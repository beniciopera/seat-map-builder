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

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Snap an angle in degrees: hard-snap to 0/90/180/270 within threshold,
 * otherwise round to nearest integer. Input is normalized to [0, 360).
 */
export function snapAngleDeg(angleDeg: number, hardThreshold = 5): number {
  let a = angleDeg % 360;
  if (a < 0) a += 360;

  const cardinals = [0, 90, 180, 270, 360];
  for (const c of cardinals) {
    if (Math.abs(a - c) <= hardThreshold) {
      return c === 360 ? 0 : c;
    }
  }
  return Math.round(a);
}

// ── Parabolic curve functions ──────────────────────────────────────────
// Parabola: y(x) = sagitta × (1 - 4x²/chord²)  in local space
// Origin at chord midpoint, x along chord, y perpendicular.

/** Evaluate parabola y-value at local x. */
export function parabolaY(x: number, sagitta: number, chord: number): number {
  return sagitta * (1 - (4 * x * x) / (chord * chord));
}

/** Unit tangent vector in local space at position x along the chord. */
export function parabolaTangentLocal(
  x: number,
  sagitta: number,
  chord: number,
): { tx: number; ty: number } {
  const dydx = (-8 * sagitta * x) / (chord * chord);
  const len = Math.sqrt(1 + dydx * dydx);
  return { tx: 1 / len, ty: dydx / len };
}

/**
 * Arc-length of parabola between x1 and x2 (closed-form via asinh).
 * ∫√(1 + (dy/dx)²) dx where dy/dx = -8·sagitta·x / chord²
 */
export function parabolaArcLength(
  x1: number,
  x2: number,
  sagitta: number,
  chord: number,
): number {
  const k = (8 * Math.abs(sagitta)) / (chord * chord);
  if (k < 1e-12) return Math.abs(x2 - x1); // essentially straight

  // Antiderivative: F(x) = x/2 · √(1 + k²x²) + 1/(2k) · asinh(kx)
  const F = (x: number) => {
    const kx = k * x;
    const sq = Math.sqrt(1 + kx * kx);
    return (x / 2) * sq + (1 / (2 * k)) * Math.asinh(kx);
  };
  return Math.abs(F(x2) - F(x1));
}

/**
 * Find x such that arc-length from x1 to x equals targetLen, searching in `direction` (+1 or -1).
 * Uses binary search (60 iterations).
 */
export function parabolaXAtArcLength(
  x1: number,
  targetLen: number,
  sagitta: number,
  chord: number,
  direction: 1 | -1,
): number {
  // Search bounds: x can range quite far for extensions
  const maxExtent = chord * 3; // generous bound
  let lo = 0;
  let hi = maxExtent;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    const x2 = x1 + direction * mid;
    const len = parabolaArcLength(x1, x2, sagitta, chord);
    if (len < targetLen) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return x1 + direction * ((lo + hi) / 2);
}

/**
 * Distribute seats evenly by arc-length along a parabola defined by two world-space
 * endpoints and a sagitta value. Returns world-space Point[].
 */
export function parabolaPositions(
  first: Point,
  last: Point,
  sagitta: number,
  seatCount: number,
): Point[] {
  if (seatCount < 1) return [];
  if (seatCount === 1) {
    return [{ x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 }];
  }

  const chord = distance(first, last);
  if (chord < 1e-6) {
    return Array.from({ length: seatCount }, () => ({ x: first.x, y: first.y }));
  }

  // Total arc length
  const halfChord = chord / 2;
  const totalLen = parabolaArcLength(-halfChord, halfChord, sagitta, chord);
  const step = totalLen / (seatCount - 1);

  // Build local x positions via arc-length parameterization
  const localXs: number[] = [-halfChord];
  for (let i = 1; i < seatCount - 1; i++) {
    localXs.push(parabolaXAtArcLength(-halfChord, step * i, sagitta, chord, 1));
  }
  localXs.push(halfChord);

  // Transform from local to world
  const angle = angleBetween(first, last);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const midX = (first.x + last.x) / 2;
  const midY = (first.y + last.y) / 2;

  return localXs.map(lx => {
    const ly = parabolaY(lx, sagitta, chord);
    return {
      x: midX + lx * cosA - ly * sinA,
      y: midY + lx * sinA + ly * cosA,
    };
  });
}
