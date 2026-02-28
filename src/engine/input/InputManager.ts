import type { EditorInputEvent } from './InputEvent';
import type { EditorEngine } from '../EditorEngine';

export class InputManager {
  private engine: EditorEngine;
  private element: HTMLElement | null = null;
  private boundHandlers = new Map<string, EventListener>();
  private isPanning = false;
  private lastPanPoint = { x: 0, y: 0 };
  private isSpaceDown = false;
  private isSpacePanning = false;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onKeyUp: ((e: KeyboardEvent) => void) | null = null;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  bind(element: HTMLElement): void {
    this.element = element;

    const onPointerDown = (e: Event) => this.handlePointerDown(e as PointerEvent);
    const onPointerMove = (e: Event) => this.handlePointerMove(e as PointerEvent);
    const onPointerUp = (e: Event) => this.handlePointerUp(e as PointerEvent);
    const onWheel = (e: Event) => this.handleWheel(e as WheelEvent);
    const onContextMenu = (e: Event) => e.preventDefault();

    this.boundHandlers.set('pointerdown', onPointerDown);
    this.boundHandlers.set('pointermove', onPointerMove);
    this.boundHandlers.set('pointerup', onPointerUp);
    this.boundHandlers.set('wheel', onWheel);
    this.boundHandlers.set('contextmenu', onContextMenu);

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerUp);
    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('contextmenu', onContextMenu);

    // Space key listeners for temporary pan mode
    this.onKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && !e.repeat) {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        this.isSpaceDown = true;
        this.engine.events.emit('cursor:changed', { cursor: 'grab' });
      }
    };
    this.onKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        this.isSpaceDown = false;
        if (this.isSpacePanning) {
          this.isSpacePanning = false;
          this.isPanning = false;
        }
        // Restore cursor to active tool's cursor
        const activeTool = this.engine.tools.getActiveTool();
        if (activeTool) {
          this.engine.events.emit('cursor:changed', { cursor: activeTool.cursor });
        }
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  unbind(): void {
    if (!this.element) return;
    for (const [event, handler] of this.boundHandlers) {
      this.element.removeEventListener(event, handler);
    }
    this.boundHandlers.clear();
    if (this.onKeyDown) window.removeEventListener('keydown', this.onKeyDown);
    if (this.onKeyUp) window.removeEventListener('keyup', this.onKeyUp);
    this.onKeyDown = null;
    this.onKeyUp = null;
    this.element = null;
  }

  private toInputEvent(e: MouseEvent | PointerEvent | WheelEvent): EditorInputEvent {
    const rect = this.element!.getBoundingClientRect();
    const screenPoint = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
    const worldPoint = this.engine.viewport.screenToWorld(screenPoint);
    return {
      screenPoint,
      worldPoint,
      button: e.button,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey || e.metaKey,
      altKey: e.altKey,
      metaKey: e.metaKey,
      deltaY: 'deltaY' in e ? (e as WheelEvent).deltaY : undefined,
      originalEvent: e,
    };
  }

  private handlePointerDown(e: PointerEvent): void {
    // Middle button = pan
    if (e.button === 1) {
      this.isPanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    // Space + left click = temporary pan
    if (e.button === 0 && this.isSpaceDown) {
      this.isPanning = true;
      this.isSpacePanning = true;
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.engine.events.emit('cursor:changed', { cursor: 'grabbing' });
      e.preventDefault();
      return;
    }

    const inputEvent = this.toInputEvent(e);
    const tool = this.engine.tools.getActiveTool();
    tool?.onPointerDown(inputEvent);
  }

  private handlePointerMove(e: PointerEvent): void {
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanPoint.x;
      const dy = e.clientY - this.lastPanPoint.y;
      this.engine.viewport.panBy(dx, dy);
      this.lastPanPoint = { x: e.clientX, y: e.clientY };
      this.engine.events.emit('viewport:changed', {
        zoom: this.engine.viewport.zoom,
        panX: this.engine.viewport.panX,
        panY: this.engine.viewport.panY,
      });
      this.engine.events.emit('render:request', {});
      return;
    }

    const inputEvent = this.toInputEvent(e);
    const tool = this.engine.tools.getActiveTool();
    tool?.onPointerMove(inputEvent);
  }

  private handlePointerUp(e: PointerEvent): void {
    if (e.button === 1) {
      this.isPanning = false;
      return;
    }

    // End space panning
    if (e.button === 0 && this.isSpacePanning) {
      this.isPanning = false;
      this.isSpacePanning = false;
      this.engine.events.emit('cursor:changed', {
        cursor: this.isSpaceDown ? 'grab' : (this.engine.tools.getActiveTool()?.cursor ?? 'default'),
      });
      return;
    }

    const inputEvent = this.toInputEvent(e);
    const tool = this.engine.tools.getActiveTool();
    tool?.onPointerUp(inputEvent);
  }

  private handleWheel(e: WheelEvent): void {
    e.preventDefault();

    if (e.altKey) {
      // Alt/Option + Scroll → Zoom (cursor-centered)
      const inputEvent = this.toInputEvent(e);
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = this.engine.viewport.zoom * zoomFactor;
      this.engine.viewport.setZoomAtPoint(newZoom, inputEvent.screenPoint);
    } else {
      // Normal Scroll → Pan
      this.engine.viewport.panBy(-e.deltaX, -e.deltaY);
    }

    this.engine.events.emit('viewport:changed', {
      zoom: this.engine.viewport.zoom,
      panX: this.engine.viewport.panX,
      panY: this.engine.viewport.panY,
    });
    this.engine.events.emit('render:request', {});
  }
}
