import type { Guideline } from '@/src/domain/geometry';
import type { ElementId } from '@/src/domain/types';
import type { SnapTarget } from './SnapEngine';
import type { EditorEngine } from '../EditorEngine';

export class GuidelinesEngine {
  private activeGuidelines: Guideline[] = [];
  private engine: EditorEngine;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  computeFromSnapTargets(matchedTargets: SnapTarget[]): Guideline[] {
    const guidelines: Guideline[] = [];

    for (const target of matchedTargets) {
      const axis = target.axis === 'x' ? 'vertical' : 'horizontal';
      const alignmentType = target.type === 'center' ? 'center' as const
        : (target.type === 'edge-left' || target.type === 'edge-top') ? 'edge-start' as const
        : 'edge-end' as const;

      guidelines.push({
        axis,
        position: target.value,
        sourceElementId: target.sourceElementId as string,
        alignmentType,
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
