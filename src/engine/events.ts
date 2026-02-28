import type { MapElement, ElementId } from '@/src/domain/types';
import type { Guideline, Point, Rect } from '@/src/domain/geometry';

export interface EditorEventMap {
  'elements:added': { elements: MapElement[] };
  'elements:removed': { elementIds: ElementId[] };
  'elements:updated': { elements: MapElement[] };
  'selection:changed': { selectedIds: ElementId[] };
  'tool:changed': { toolId: string; previousToolId: string | null };
  'tool:state-changed': { toolId: string; state: string };
  'guidelines:updated': { guidelines: Guideline[] };
  'viewport:changed': { zoom: number; panX: number; panY: number };
  'history:changed': { canUndo: boolean; canRedo: boolean };
  'cursor:changed': { cursor: string };
  'render:request': Record<string, never>;
  'preview:seats': { seats: Point[]; anchorPoint: Point; cursorPoint?: Point; angle?: number; seatCount?: number };
  'preview:contraction': { seatIds: ElementId[] };
  'preview:table': { center: Point; tableRadius: number; seatCount: number; seatGap: number; label: string };
  'preview:grid': { seats: Point[]; anchorPoint: Point; cursorPoint: Point; angle: number; rows: number; cols: number };
  'preview:area': { rect: Rect; color: string; label: string; cursorPoint: Point };
  'preview:rotation': { cursorPoint: Point; angle: number };
  'preview:clear': Record<string, never>;
  'boxselect:update': { rect: Rect };
  'boxselect:end': Record<string, never>;
  'delete:confirm': { elementIds: ElementId[] };
  'layout:loaded': Record<string, never>;
}

type Handler<T> = (payload: T) => void;

export class EditorEventEmitter {
  private listeners = new Map<string, Set<Handler<unknown>>>();

  on<K extends keyof EditorEventMap>(
    event: K,
    handler: Handler<EditorEventMap[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const handlers = this.listeners.get(event)!;
    handlers.add(handler as Handler<unknown>);
    return () => {
      handlers.delete(handler as Handler<unknown>);
    };
  }

  off<K extends keyof EditorEventMap>(
    event: K,
    handler: Handler<EditorEventMap[K]>,
  ): void {
    this.listeners.get(event)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof EditorEventMap>(
    event: K,
    payload: EditorEventMap[K],
  ): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(payload);
      }
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
