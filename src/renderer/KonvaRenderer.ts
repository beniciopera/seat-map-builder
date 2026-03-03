import Konva from 'konva';
import type { EditorEngine } from '@/src/engine/EditorEngine';
import { Camera } from './Camera';
import { ElementLayer } from './layers/ElementLayer';
import { SelectionLayer } from './layers/SelectionLayer';
import { GuidelinesLayer } from './layers/GuidelinesLayer';
import { PreviewLayer } from './layers/PreviewLayer';
import { ViewportController } from './viewport/ViewportController';
import { setCategoryRegistry } from '@/src/utils/color';

export class KonvaRenderer {
  private stage: Konva.Stage | null = null;
  private engine: EditorEngine;
  readonly camera: Camera;
  readonly elementLayer: ElementLayer;
  readonly selectionLayer: SelectionLayer;
  readonly guidelinesLayer: GuidelinesLayer;
  readonly previewLayer: PreviewLayer;
  readonly viewportController: ViewportController;
  private unsubscribers: Array<() => void> = [];

  constructor(engine: EditorEngine) {
    this.engine = engine;
    this.camera = new Camera(engine.viewport);
    this.elementLayer = new ElementLayer();
    this.elementLayer.setElementGetter(id => engine.state.get(id));
    this.selectionLayer = new SelectionLayer();
    this.guidelinesLayer = new GuidelinesLayer();
    this.previewLayer = new PreviewLayer();
    this.viewportController = new ViewportController(engine);
  }

  attach(container: HTMLDivElement): void {
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    this.stage = new Konva.Stage({
      container,
      width,
      height,
    });

    this.camera.setStage(this.stage);

    // Add layers in draw order (bottom to top)
    this.stage.add(this.elementLayer.layer);
    this.stage.add(this.selectionLayer.layer);
    this.stage.add(this.guidelinesLayer.layer);
    this.stage.add(this.previewLayer.layer);

    // Update viewport dimensions
    this.engine.viewport.canvasWidth = width;
    this.engine.viewport.canvasHeight = height;

    // Subscribe to engine events
    this.subscribeToEvents();

    // Initial sync
    this.elementLayer.syncWithEngine(this.engine);
    this.camera.applyTransform();

    // Sync category registry for color resolution
    setCategoryRegistry(this.engine.state.getCategoriesMap());
  }

  detach(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
    this.stage?.destroy();
    this.stage = null;
  }

  resize(width: number, height: number): void {
    if (!this.stage) return;
    this.stage.width(width);
    this.stage.height(height);
    this.engine.viewport.canvasWidth = width;
    this.engine.viewport.canvasHeight = height;
    this.camera.applyTransform();
  }

  getStage(): Konva.Stage | null {
    return this.stage;
  }

  getContentElement(): HTMLElement | null {
    return this.stage?.content ?? null;
  }

  private subscribeToEvents(): void {
    this.unsubscribers.push(
      this.engine.events.on('elements:added', ({ elements }) => {
        this.elementLayer.addElements(elements);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('elements:removed', ({ elementIds }) => {
        this.elementLayer.removeElements(elementIds);
        const toolState = this.engine.tools.getActiveTool()?.currentState ?? 'idle';
        const toolId = this.engine.tools.getActiveTool()?.id ?? 'selection';
        this.selectionLayer.updateSelection(
          this.engine.selection.getSelectedIds(),
          this.engine,
          this.elementLayer,
          toolState,
          toolId,
        );
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('elements:updated', ({ elements }) => {
        this.elementLayer.updateElements(elements);
        // Also update selection highlights
        if (this.engine.selection.hasSelection) {
          const toolState = this.engine.tools.getActiveTool()?.currentState ?? 'idle';
          const toolId = this.engine.tools.getActiveTool()?.id ?? 'selection';
          this.selectionLayer.updateSelection(
            this.engine.selection.getSelectedIds(),
            this.engine,
            this.elementLayer,
            toolState,
            toolId,
          );
        }
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('selection:changed', ({ selectedIds }) => {
        const toolState = this.engine.tools.getActiveTool()?.currentState ?? 'idle';
        const toolId = this.engine.tools.getActiveTool()?.id ?? 'selection';
        this.selectionLayer.updateSelection(selectedIds, this.engine, this.elementLayer, toolState, toolId);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('tool:state-changed', () => {
        if (this.engine.selection.hasSelection) {
          const toolState = this.engine.tools.getActiveTool()?.currentState ?? 'idle';
          const toolId = this.engine.tools.getActiveTool()?.id ?? 'selection';
          this.selectionLayer.updateSelection(
            this.engine.selection.getSelectedIds(),
            this.engine,
            this.elementLayer,
            toolState,
            toolId,
          );
        }
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('guidelines:updated', ({ guidelines }) => {
        const bounds = this.camera.getVisibleBounds();
        this.guidelinesLayer.updateGuidelines(guidelines, bounds, this.engine.viewport.zoom);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:seats', ({ seats, anchorPoint, cursorPoint, angle, seatCount }) => {
        this.previewLayer.showSeatPreviews(seats, anchorPoint, cursorPoint, angle, seatCount);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:grid', ({ seats, anchorPoint, cursorPoint, angle, rows, cols }) => {
        this.previewLayer.showGridPreview(seats, anchorPoint, cursorPoint, angle, rows, cols);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:table', ({ center, tableRadius, seatCount, seatGap, label }) => {
        this.previewLayer.showTablePreview(center, tableRadius, seatCount, seatGap, label);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:area', ({ rect, color, label, cursorPoint }) => {
        this.previewLayer.showAreaPreview(rect, color, label, cursorPoint);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:polygon', ({ points, cursorPoint, color, label, angleDeg }) => {
        this.previewLayer.showPolygonPreview(points, cursorPoint, color, label, angleDeg);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:rotation', ({ cursorPoint, angle }) => {
        this.previewLayer.showRotationTooltip(cursorPoint, angle);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:contraction', ({ seatIds }) => {
        this.elementLayer.dimElements(seatIds);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('preview:clear', () => {
        this.previewLayer.clear();
        this.elementLayer.restoreDimmed();
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('viewport:changed', () => {
        this.camera.applyTransform();
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('render:request', () => {
        this.camera.applyTransform();
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('boxselect:update', ({ rect }) => {
        this.selectionLayer.showBoxSelect(rect.x, rect.y, rect.width, rect.height);
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('boxselect:end', () => {
        this.selectionLayer.hideBoxSelect();
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('layout:loaded', () => {
        this.elementLayer.syncWithEngine(this.engine);
        const toolId = this.engine.tools.getActiveTool()?.id ?? 'selection';
        this.selectionLayer.updateSelection([], this.engine, this.elementLayer, 'idle', toolId);
        this.camera.applyTransform();
      }),
    );

    this.unsubscribers.push(
      this.engine.events.on('categories:changed', () => {
        setCategoryRegistry(this.engine.state.getCategoriesMap());
        this.elementLayer.syncWithEngine(this.engine);
        const toolId = this.engine.tools.getActiveTool()?.id ?? 'selection';
        const toolState = this.engine.tools.getActiveTool()?.currentState ?? 'idle';
        this.selectionLayer.updateSelection(
          this.engine.selection.getSelectedIds(),
          this.engine,
          this.elementLayer,
          toolState,
          toolId,
        );
      }),
    );
  }
}
