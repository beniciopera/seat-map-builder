import type { Point } from '@/src/domain/geometry';
import { distance, angleBetween } from '@/src/utils/math';

export class SeatGenerationSystem {
  generateAlongLine(
    anchor: Point,
    endpoint: Point,
    spacing: number,
    _curveRadius = 0,
  ): Point[] {
    const dist = distance(anchor, endpoint);
    if (dist < spacing / 2) return [anchor];

    const count = Math.floor(dist / spacing) + 1;
    const angle = angleBetween(anchor, endpoint);
    const seats: Point[] = [];

    for (let i = 0; i < count; i++) {
      seats.push({
        x: anchor.x + Math.cos(angle) * spacing * i,
        y: anchor.y + Math.sin(angle) * spacing * i,
      });
    }

    return seats;
  }

  generateAlongArc(
    center: Point,
    radius: number,
    startAngle: number,
    endAngle: number,
    spacing: number,
  ): Point[] {
    const arcLength = Math.abs(endAngle - startAngle) * radius;
    const count = Math.max(2, Math.floor(arcLength / spacing) + 1);
    const angleStep = (endAngle - startAngle) / (count - 1);
    const seats: Point[] = [];

    for (let i = 0; i < count; i++) {
      const angle = startAngle + angleStep * i;
      seats.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }

    return seats;
  }

  calculateSeatCount(start: Point, end: Point, spacing: number): number {
    const dist = distance(start, end);
    return Math.floor(dist / spacing) + 1;
  }
}
