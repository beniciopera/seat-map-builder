import type { Guideline } from '@/src/domain/geometry';
import type { SnapTarget, AngleSnapTarget } from './SnapEngine';
import type { EditorEngine } from '../EditorEngine';

export class GuidelinesEngine {
  private activeGuidelines: Guideline[] = [];
  private engine: EditorEngine;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  computeFromSnapTargets(matchedTargets: SnapTarget[], angleTargets: AngleSnapTarget[] = []): Guideline[] {
    const guidelines: Guideline[] = [];

    for (const target of matchedTargets) {
      const alignmentType = target.type === 'center' ? 'center' as const
        : (target.type === 'edge-left' || target.type === 'edge-top') ? 'edge-start' as const
        : 'edge-end' as const;

      // Convert axis-aligned targets to throughPoint+angle format
      if (target.axis === 'x') {
        // Vertical line through x=value
        guidelines.push({
          throughPoint: { x: target.value, y: 0 },
          angle: Math.PI / 2,
          sourceElementId: target.sourceElementId as string,
          alignmentType,
        });
      } else {
        // Horizontal line through y=value
        guidelines.push({
          throughPoint: { x: 0, y: target.value },
          angle: 0,
          sourceElementId: target.sourceElementId as string,
          alignmentType,
        });
      }
    }

    // Add angle-aware guidelines directly
    for (const target of angleTargets) {
      guidelines.push({
        throughPoint: target.throughPoint,
        angle: target.angle,
        sourceElementId: target.sourceElementId as string,
        alignmentType: target.alignmentType,
      });
    }

    this.activeGuidelines = guidelines;
    this.engine.events.emit('guidelines:updated', { guidelines });
    return guidelines;
  }

  getActiveGuidelines(): Guideline[] {
    return this.activeGuidelines;
  }

  clear(): void {
    this.activeGuidelines = [];
    this.engine.events.emit('guidelines:updated', { guidelines: [] });
  }
}
