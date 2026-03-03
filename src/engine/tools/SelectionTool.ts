import { BaseTool } from './Tool';
import type { EditorInputEvent } from '../input/InputEvent';
import type { Point, Rect } from '@/src/domain/geometry';
import type { ElementId, MapElement, Row, Seat, Table, Area, CurveDefinition } from '@/src/domain/types';
import { isSeat, isRow, isArea, isTable } from '@/src/domain/types';
import { MoveElementsCommand } from '../commands/MoveElementsCommand';
import { DeleteElementsCommand } from '../commands/DeleteElementsCommand';
import { ExtendRowCommand } from '../commands/ExtendRowCommand';
import { ContractRowCommand } from '../commands/ContractRowCommand';
import { CurveRowCommand } from '../commands/CurveRowCommand';
import { RotateElementsCommand } from '../commands/RotateElementsCommand';
import { ResizeElementCommand } from '../commands/ResizeElementCommand';
import { distance, angleBetween, parabolaPositions, parabolaTangentLocal, parabolaArcLength, parabolaXAtArcLength, parabolaY, radToDeg, degToRad, snapAngleDeg, curveDefinitionFromEndpoints, worldToParabolaLocalX } from '@/src/utils/math';
import { generateElementId } from '@/src/domain/ids';
import { DEFAULT_SEAT_RADIUS, isRowCurvatureEffectivelyStraight } from '@/src/domain/constraints';
import type { SnapTarget, AngleSnapTarget } from '../systems/SnapEngine';
import { boundsFromVertices, centerOfVertices } from '@/src/domain/polygon';

export class SelectionTool extends BaseTool {
  readonly id = 'selection';
  readonly label = 'Select';
  readonly icon = 'NearMe';
  readonly cursor = 'default';

  private dragStartWorld: Point | null = null;
  private dragStartScreen: Point | null = null;
  private dragOriginalPositions = new Map<ElementId, Point>();
  private dragOriginalCurveDefinitions = new Map<ElementId, CurveDefinition | null>();
  private dragOriginalVertices = new Map<ElementId, Readonly<Point>[]>();
  private boxSelectStart: Point | null = null;
  private boxSelectCurrent: Point | null = null;

  // Row extension state
  private extendingRowId: ElementId | null = null;
  private extendingHandle: 'left' | 'right' | null = null;
  private extendDragStart: Point | null = null;

  // Row curving state
  private curvingRowId: ElementId | null = null;
  private curveDragStart: Point | null = null;
  private curveOriginalPositions = new Map<ElementId, Point>();
  private curveOriginalRadius = 0;

  // Rotation handle state
  private rotatingIds: ElementId[] = [];
  private rotationPrimaryId: ElementId | null = null;
  private rotationCenter: Point | null = null;
  private rotationStartAngle = 0;
  private rotationOriginalTransforms = new Map<ElementId, { position: Point; rotation: number }>();
  private isMultiEntityRotation = false;
  private lastRotationGuidelinesAngle: number | null = null;

  // Area resize state
  private resizingAreaId: ElementId | null = null;
  private resizeCorner: string | null = null;
  private resizeOriginalBounds: Rect | null = null;
  private resizeOriginalPosition: Point | null = null;
  private resizeDragStart: Point | null = null;
  private resizeOriginalRotation: number = 0;

  onPointerDown(event: EditorInputEvent): void {
    if (!this.engine) return;

    if (event.button !== 0) return;

    // Check if clicking near a resize handle (area corners)
    const resizeHit = this.hitTestResizeHandles(event.worldPoint);
    if (resizeHit) {
      const area = this.engine.state.get(resizeHit.areaId);
      if (area) {
        this.resizingAreaId = resizeHit.areaId;
        this.resizeCorner = resizeHit.corner;
        this.resizeOriginalBounds = { ...area.bounds };
        this.resizeOriginalPosition = { ...area.transform.position };
        this.resizeDragStart = event.worldPoint;
        this.resizeOriginalRotation = area.transform.rotation;
        this.transition('resizing-area');
        return;
      }
    }

    // Check if clicking near rotation handle
    const rotationHit = this.hitTestRotationHandle(event.worldPoint);
    if (rotationHit) {
      this.setupRotation(event.worldPoint);
      this.transition('rotating');
      this.engine.events.emit('cursor:changed', { cursor: 'grabbing' });
      this.updateRotationGuidelines();
      return;
    }

    // Check if clicking near curve handle (Ctrl+click or just click)
    const curveHit = this.hitTestCurveHandle(event.worldPoint);
    if (curveHit) {
      this.curvingRowId = curveHit;
      this.curveDragStart = event.worldPoint;
      this.curveOriginalPositions.clear();
      const row = this.engine.state.get(curveHit) as Row;
      if (row) {
        this.curveOriginalRadius = row.curveRadius;
        for (const seatId of row.seatIds) {
          const seat = this.engine.state.get(seatId);
          if (seat) {
            this.curveOriginalPositions.set(seatId, { ...seat.transform.position });
          }
        }
      }
      this.transition('curving-row');
      return;
    }

    // Check if clicking near a row extension handle
    const handleHit = this.hitTestHandles(event.worldPoint);
    if (handleHit) {
      this.extendingRowId = handleHit.rowId;
      this.extendingHandle = handleHit.handle;
      this.extendDragStart = event.worldPoint;
      this.transition('extending-row');
      return;
    }

    const hit = this.engine.hitTest(event.worldPoint);

    if (hit) {
      // Click on element
      if (event.shiftKey) {
        this.engine.selection.toggleSelection(hit.id);
      } else if (!this.engine.selection.isSelected(hit.id)) {
        this.engine.selection.select(hit.id);
      }

      // Expand selection to include full rows and tables
      const expandedRows = this.expandSelectionWithRows(this.engine.selection.getSelectedIds());
      const expanded = this.expandSelectionWithTables(expandedRows);
      this.engine.selection.selectMultiple(expanded);

      this.engine.events.emit('selection:changed', {
        selectedIds: this.engine.selection.getSelectedIds(),
      });

      // Start dragging
      this.dragStartWorld = event.worldPoint;
      this.dragStartScreen = event.screenPoint;
      this.dragOriginalPositions.clear();
      this.dragOriginalCurveDefinitions.clear();
      this.dragOriginalVertices.clear();

      for (const id of this.engine.selection.getSelectedIds()) {
        const el = this.engine.state.get(id);
        if (el) {
          this.dragOriginalPositions.set(id, el.transform.position);
          if (isRow(el) && el.curveDefinition) {
            this.dragOriginalCurveDefinitions.set(id, el.curveDefinition);
          }
          if (isArea(el) && (el as Area).vertices && (el as Area).vertices!.length >= 3) {
            this.dragOriginalVertices.set(id, [...(el as Area).vertices!]);
          }
        }
      }

      this.engine.snap.setExcluded(this.engine.selection.getSelectedIds());
      this.transition('dragging');
      // Show guidelines immediately on click-hold
      this.showGuidelinesAtPoint(event.worldPoint);
    } else if (this.engine.selection.hasSelection && this.isPointInSelectionBounds(event.worldPoint)) {
      // Click inside selection bounding box but not on an element — start dragging
      this.dragStartWorld = event.worldPoint;
      this.dragStartScreen = event.screenPoint;
      this.dragOriginalPositions.clear();
      this.dragOriginalCurveDefinitions.clear();
      this.dragOriginalVertices.clear();
      for (const id of this.engine.selection.getSelectedIds()) {
        const el = this.engine.state.get(id);
        if (el) {
          this.dragOriginalPositions.set(id, el.transform.position);
          if (isRow(el) && el.curveDefinition) {
            this.dragOriginalCurveDefinitions.set(id, el.curveDefinition);
          }
          if (isArea(el) && (el as Area).vertices && (el as Area).vertices!.length >= 3) {
            this.dragOriginalVertices.set(id, [...(el as Area).vertices!]);
          }
        }
      }
      this.engine.snap.setExcluded(this.engine.selection.getSelectedIds());
      this.transition('dragging');
      // Show guidelines immediately on click-hold
      this.showGuidelinesAtPoint(event.worldPoint);
    } else {
      // Click on empty space — clear selection, start box-selecting
      if (!event.shiftKey) {
        this.engine.selection.clearSelection();
        this.engine.events.emit('selection:changed', {
          selectedIds: [],
        });
      }
      this.boxSelectStart = event.worldPoint;
      this.transition('box-selecting');
    }

    this.engine.events.emit('render:request', {});
  }

  onPointerMove(event: EditorInputEvent): void {
    if (!this.engine) return;

    switch (this._currentState) {
      case 'rotating': {
        if (!this.rotationCenter || this.rotatingIds.length === 0) break;
        const currentAngle = Math.atan2(
          event.worldPoint.y - this.rotationCenter.y,
          event.worldPoint.x - this.rotationCenter.x,
        );
        const rawDelta = currentAngle - this.rotationStartAngle;
        const { snappedDelta, snappedAbsoluteRad } = this.computeSnappedDelta(rawDelta);

        this.engine.events.emit('preview:rotation', {
          cursorPoint: event.worldPoint,
          angle: this.isMultiEntityRotation ? snappedDelta : snappedAbsoluteRad,
        });

        // Preview rotation (restore originals first, then apply new rotation)
        const cos = Math.cos(snappedDelta);
        const sin = Math.sin(snappedDelta);
        const updated: MapElement[] = [];
        for (const id of this.rotatingIds) {
          const orig = this.rotationOriginalTransforms.get(id);
          const el = this.engine.state.get(id);
          if (!orig || !el) continue;
          const dx = orig.position.x - this.rotationCenter.x;
          const dy = orig.position.y - this.rotationCenter.y;
          const newPos = {
            x: this.rotationCenter.x + dx * cos - dy * sin,
            y: this.rotationCenter.y + dx * sin + dy * cos,
          };
          const merged = {
            ...el,
            transform: {
              ...el.transform,
              position: newPos,
              rotation: orig.rotation + snappedDelta,
            },
            bounds: {
              ...el.bounds,
              x: newPos.x - el.bounds.width / 2,
              y: newPos.y - el.bounds.height / 2,
            },
          } as MapElement;
          this.engine.state.set(id, merged);
          this.engine.spatialIndex.update(merged);
          updated.push(merged);
        }
        if (updated.length > 0) {
          this.engine.events.emit('elements:updated', { elements: updated });
          this.engine.events.emit('render:request', {});
        }
        const previewAngle = this.isMultiEntityRotation ? snappedDelta : snappedAbsoluteRad;
        this.updateRotationGuidelines(previewAngle);
        break;
      }
      case 'dragging': {
        if (!this.dragStartWorld) return;
        const delta = {
          x: event.worldPoint.x - this.dragStartWorld.x,
          y: event.worldPoint.y - this.dragStartWorld.y,
        };

        // Preview move (no history)
        const updated: MapElement[] = [];
        for (const [id, origPos] of this.dragOriginalPositions) {
          const el = this.engine.state.get(id);
          if (!el) continue;
          const newPos = { x: origPos.x + delta.x, y: origPos.y + delta.y };
          let merged: MapElement;
          const origVertices = this.dragOriginalVertices.get(id);
          if (isArea(el) && origVertices && origVertices.length >= 3) {
            const area = el as Area;
            const newVertices = origVertices.map((v) => ({ x: v.x + delta.x, y: v.y + delta.y }));
            const bounds = boundsFromVertices(newVertices);
            merged = {
              ...area,
              transform: { ...area.transform, position: newPos },
              bounds,
              vertices: newVertices,
            } as MapElement;
          } else {
            merged = {
              ...el,
              transform: { ...el.transform, position: newPos },
              bounds: { ...el.bounds, x: newPos.x - el.bounds.width / 2, y: newPos.y - el.bounds.height / 2 },
            } as MapElement;
          }
          // Translate curveDefinition.center during live preview so shadow follows
          const origCurveDef = this.dragOriginalCurveDefinitions.get(id);
          if (isRow(merged) && origCurveDef) {
            merged = {
              ...merged,
              curveDefinition: {
                ...origCurveDef,
                center: {
                  x: origCurveDef.center.x + delta.x,
                  y: origCurveDef.center.y + delta.y,
                },
              },
            } as MapElement;
          }
          this.engine.state.set(id, merged);
          this.engine.spatialIndex.update(merged);
          updated.push(merged);
        }
        this.engine.events.emit('elements:updated', { elements: updated });

        // After elements have been preview-moved, recompute self-guidelines so
        // guidelines follow only the dragged elements (no proximity to others).
        const selfGuidelines = this.computeSelfGuidelines();
        if (selfGuidelines.length > 0) {
          this.engine.guidelines.computeFromSnapTargets([], selfGuidelines);
        } else {
          this.engine.guidelines.clear();
        }

        this.engine.events.emit('render:request', {});
        break;
      }
      case 'box-selecting': {
        if (!this.boxSelectStart) break;
        this.boxSelectCurrent = event.worldPoint;
        const rect = this.makeRect(this.boxSelectStart, this.boxSelectCurrent);

        // Real-time spatial query for elements inside the selection rectangle
        const ids = this.engine.spatialIndex.queryRect(rect);
        const visibleIds = ids.filter(id => {
          const el = this.engine!.state.get(id);
          return el && el.visible && !el.locked && this.rectIntersectsElement(rect, el);
        });
        const expandedRows = this.expandSelectionWithRows(visibleIds);
        const expanded = this.expandSelectionWithTables(expandedRows);
        this.engine.selection.selectMultiple(expanded);
        this.engine.events.emit('selection:changed', {
          selectedIds: this.engine.selection.getSelectedIds(),
        });

        // Emit box-select rect for renderer
        this.engine.events.emit('boxselect:update', { rect });
        break;
      }
      case 'resizing-area': {
        if (!this.resizeDragStart || !this.resizingAreaId || !this.resizeCorner || !this.resizeOriginalBounds) break;

        const worldDx = event.worldPoint.x - this.resizeDragStart.x;
        const worldDy = event.worldPoint.y - this.resizeDragStart.y;

        // Rotate world deltas into the area's local (unrotated) frame
        const rot = this.resizeOriginalRotation;
        const cosNR = Math.cos(-rot);
        const sinNR = Math.sin(-rot);
        const dx = worldDx * cosNR - worldDy * sinNR;
        const dy = worldDx * sinNR + worldDy * cosNR;

        const ob = this.resizeOriginalBounds;
        let newX = ob.x;
        let newY = ob.y;
        let newW = ob.width;
        let newH = ob.height;

        switch (this.resizeCorner) {
          case 'br':
            newW = ob.width + dx;
            newH = ob.height + dy;
            break;
          case 'bl':
            newX = ob.x + dx;
            newW = ob.width - dx;
            newH = ob.height + dy;
            break;
          case 'tr':
            newY = ob.y + dy;
            newW = ob.width + dx;
            newH = ob.height - dy;
            break;
          case 'tl':
            newX = ob.x + dx;
            newY = ob.y + dy;
            newW = ob.width - dx;
            newH = ob.height - dy;
            break;
        }

        // Enforce minimum size
        newW = Math.max(10, newW);
        newH = Math.max(10, newH);

        // Recompute origin if we clamped and were adjusting x/y
        if (this.resizeCorner === 'tl' || this.resizeCorner === 'bl') {
          newX = ob.x + ob.width - newW;
        }
        if (this.resizeCorner === 'tl' || this.resizeCorner === 'tr') {
          newY = ob.y + ob.height - newH;
        }

        const resizeBounds: Rect = { x: newX, y: newY, width: newW, height: newH };

        // Compute new center in local space, then rotate back to world space
        const localCenterX = newX + newW / 2;
        const localCenterY = newY + newH / 2;
        const origCenter = this.resizeOriginalPosition!;
        const cosR = Math.cos(rot);
        const sinR = Math.sin(rot);
        const resizeCenter: Point = {
          x: origCenter.x + (localCenterX - origCenter.x) * cosR - (localCenterY - origCenter.y) * sinR,
          y: origCenter.y + (localCenterX - origCenter.x) * sinR + (localCenterY - origCenter.y) * cosR,
        };

        const areaEl = this.engine.state.get(this.resizingAreaId);
        if (areaEl) {
          const merged = {
            ...areaEl,
            bounds: resizeBounds,
            transform: { ...areaEl.transform, position: resizeCenter },
          } as MapElement;
          this.engine.state.set(this.resizingAreaId, merged);
          this.engine.spatialIndex.update(merged);
          this.engine.events.emit('elements:updated', { elements: [merged] });
          this.engine.events.emit('render:request', {});
          this.engine.events.emit('selection:changed', {
            selectedIds: this.engine.selection.getSelectedIds(),
          });
        }
        break;
      }
      case 'curving-row': {
        if (!this.curveDragStart || !this.curvingRowId) break;

        const curveRow = this.engine.state.get(this.curvingRowId) as Row | undefined;
        if (!curveRow || curveRow.seatIds.length < 2) break;

        // Use original first/last seat positions for stable reference
        const origFirst = this.curveOriginalPositions.get(curveRow.seatIds[0]);
        const origLast = this.curveOriginalPositions.get(curveRow.seatIds[curveRow.seatIds.length - 1]);
        if (!origFirst || !origLast) break;

        const cAngle = angleBetween(origFirst, origLast);
        const perpX = -Math.sin(cAngle);
        const perpY = Math.cos(cAngle);

        // Project drag displacement onto perpendicular direction
        const dragDelta = {
          x: event.worldPoint.x - this.curveDragStart.x,
          y: event.worldPoint.y - this.curveDragStart.y,
        };
        const perpDisplacement = (dragDelta.x * perpX + dragDelta.y * perpY) + this.curveOriginalRadius;

        // Clamp to prevent arc from exceeding ~171° (semicircle limit)
        const chord = distance(origFirst, origLast);
        const maxSagitta = (chord / 2) * 0.75;
        const clampedDisplacement = Math.max(-maxSagitta, Math.min(maxSagitta, perpDisplacement));

        // Snap to straight during live preview when curvature is near zero
        const previewDisplacement = isRowCurvatureEffectivelyStraight(clampedDisplacement, chord) ? 0 : clampedDisplacement;

        // Reposition seats along curve (live preview)
        this.repositionSeatsAlongCurve(curveRow, origFirst, origLast, previewDisplacement);
        break;
      }
      case 'extending-row': {
        if (!this.extendDragStart || !this.extendingRowId || !this.extendingHandle) break;

        const row = this.engine.state.get(this.extendingRowId) as Row | undefined;
        if (!row) break;

        const dragDelta = {
          x: event.worldPoint.x - this.extendDragStart.x,
          y: event.worldPoint.y - this.extendDragStart.y,
        };

        const tangents = this.getCurvedRowTangents(row);

        // Compute projection along the appropriate direction
        let projection: number;
        let effectiveSpacing = row.spacing;
        if (tangents) {
          const dir = this.extendingHandle === 'right' ? tangents.rightDir : tangents.leftDir;
          projection = dragDelta.x * dir.x + dragDelta.y * dir.y;
          // Arc length per seat along parabola using curveDefinition chord
          const firstSeatForSpacing = this.engine.state.get(row.seatIds[0]) as Seat | undefined;
          const lastSeatForSpacing = this.engine.state.get(row.seatIds[row.seatIds.length - 1]) as Seat | undefined;
          if (firstSeatForSpacing && lastSeatForSpacing) {
            const def = row.curveDefinition ?? curveDefinitionFromEndpoints(firstSeatForSpacing.transform.position, lastSeatForSpacing.transform.position);
            const localXFirst = worldToParabolaLocalX(firstSeatForSpacing.transform.position, def);
            const localXLast = worldToParabolaLocalX(lastSeatForSpacing.transform.position, def);
            effectiveSpacing = parabolaArcLength(localXFirst, localXLast, tangents.sagitta, tangents.chord) / (row.seatIds.length - 1);
          }
        } else {
          const angle = row.orientationAngle;
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          const sign = this.extendingHandle === 'right' ? 1 : -1;
          projection = (dragDelta.x * dirX + dragDelta.y * dirY) * sign;
        }

        if (projection >= effectiveSpacing) {
          // Expansion: preview ghost seats outward
          const newSeatCount = Math.floor(projection / effectiveSpacing);
          const anchorSeatId = this.extendingHandle === 'right'
            ? row.seatIds[row.seatIds.length - 1]
            : row.seatIds[0];
          const anchorSeat = this.engine.state.get(anchorSeatId) as Seat | undefined;
          if (!anchorSeat) break;

          const previewPositions: Point[] = [];

          if (tangents) {
            // Place new seats along parabola continuation using curveDefinition
            const firstSeat = this.engine.state.get(row.seatIds[0]) as Seat | undefined;
            const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]) as Seat | undefined;
            if (!firstSeat || !lastSeat) break;
            const def = row.curveDefinition ?? curveDefinitionFromEndpoints(firstSeat.transform.position, lastSeat.transform.position);
            const chord = def.chord;
            const sagitta = tangents.sagitta;
            const cosA = Math.cos(def.angle);
            const sinA = Math.sin(def.angle);
            const midX = def.center.x;
            const midY = def.center.y;

            const anchorLocalX = worldToParabolaLocalX(anchorSeat.transform.position, def);
            const direction: 1 | -1 = this.extendingHandle === 'right' ? 1 : -1;

            for (let i = 1; i <= newSeatCount; i++) {
              const lx = parabolaXAtArcLength(anchorLocalX, effectiveSpacing * i, sagitta, chord, direction);
              const ly = parabolaY(lx, sagitta, chord);
              previewPositions.push({
                x: midX + lx * cosA - ly * sinA,
                y: midY + lx * sinA + ly * cosA,
              });
            }
          } else {
            const angle = row.orientationAngle;
            const dirX = Math.cos(angle);
            const dirY = Math.sin(angle);
            const sign = this.extendingHandle === 'right' ? 1 : -1;
            for (let i = 1; i <= newSeatCount; i++) {
              previewPositions.push({
                x: anchorSeat.transform.position.x + dirX * row.spacing * i * sign,
                y: anchorSeat.transform.position.y + dirY * row.spacing * i * sign,
              });
            }
          }

          this.engine.events.emit('preview:clear', {});
          this.engine.events.emit('preview:seats', {
            seats: previewPositions,
            anchorPoint: anchorSeat.transform.position,
          });
        } else if (projection <= -effectiveSpacing && row.seatIds.length > 1) {
          // Contraction: dim seats that would be removed
          const seatsToRemove = Math.min(
            Math.floor(Math.abs(projection) / effectiveSpacing),
            row.seatIds.length - 1, // keep at least 1 seat
          );

          const dimIds: ElementId[] = [];
          if (this.extendingHandle === 'right') {
            for (let i = 0; i < seatsToRemove; i++) {
              dimIds.push(row.seatIds[row.seatIds.length - 1 - i]);
            }
          } else {
            for (let i = 0; i < seatsToRemove; i++) {
              dimIds.push(row.seatIds[i]);
            }
          }

          this.engine.events.emit('preview:clear', {});
          this.engine.events.emit('preview:contraction', { seatIds: dimIds });
        } else {
          this.engine.events.emit('preview:clear', {});
        }
        break;
      }
    }
  }

  onPointerUp(event: EditorInputEvent): void {
    if (!this.engine) return;

    switch (this._currentState) {
      case 'rotating': {
        if (!this.rotationCenter || this.rotatingIds.length === 0) break;
        const finalAngle = Math.atan2(
          event.worldPoint.y - this.rotationCenter.y,
          event.worldPoint.x - this.rotationCenter.x,
        );
        const rawDelta = finalAngle - this.rotationStartAngle;
        const { snappedDelta } = this.computeSnappedDelta(rawDelta);

        // Restore original transforms before creating command
        for (const id of this.rotatingIds) {
          const orig = this.rotationOriginalTransforms.get(id);
          const el = this.engine.state.get(id);
          if (!orig || !el) continue;
          const restored = {
            ...el,
            transform: { ...el.transform, position: orig.position, rotation: orig.rotation },
          } as MapElement;
          this.engine.state.set(id, restored);
          this.engine.spatialIndex.update(restored);
        }

        if (Math.abs(snappedDelta) > 0.001) {
          const cmd = new RotateElementsCommand(
            this.engine,
            this.rotatingIds,
            snappedDelta,
            this.rotationCenter,
          );
          this.engine.history.execute(cmd);
        }

        this.engine.events.emit('preview:clear', {});
        this.engine.events.emit('cursor:changed', { cursor: this.cursor });

        // Refresh selection visuals
        this.engine.events.emit('selection:changed', {
          selectedIds: this.engine.selection.getSelectedIds(),
        });
        this.clearRotationGuidelines();
        break;
      }
      case 'dragging': {
        if (!this.dragStartWorld) break;
        const delta = {
          x: event.worldPoint.x - this.dragStartWorld.x,
          y: event.worldPoint.y - this.dragStartWorld.y,
        };

        // Only commit if actually moved
        if (Math.abs(delta.x) > 1 || Math.abs(delta.y) > 1) {
          // Restore original positions, curveDefinitions, and vertices first (for clean command)
          for (const [id, origPos] of this.dragOriginalPositions) {
            const el = this.engine.state.get(id);
            if (!el) continue;
            const origVertices = this.dragOriginalVertices.get(id);
            let restored: MapElement;
            if (isArea(el) && origVertices && origVertices.length >= 3) {
              const area = el as Area;
              const bounds = boundsFromVertices(origVertices);
              restored = {
                ...area,
                transform: { ...area.transform, position: origPos },
                bounds,
                vertices: [...origVertices],
              } as MapElement;
            } else {
              restored = {
                ...el,
                transform: { ...el.transform, position: origPos },
                bounds: { ...el.bounds, x: origPos.x - el.bounds.width / 2, y: origPos.y - el.bounds.height / 2 },
              } as MapElement;
            }
            const origCurveDef = this.dragOriginalCurveDefinitions.get(id);
            if (isRow(restored) && origCurveDef !== undefined) {
              restored = { ...restored, curveDefinition: origCurveDef } as MapElement;
            }
            this.engine.state.set(id, restored);
            this.engine.spatialIndex.update(restored);
          }

          // Now create command with the proper after positions
          const after = new Map<ElementId, Point>();
          for (const [id, origPos] of this.dragOriginalPositions) {
            after.set(id, { x: origPos.x + delta.x, y: origPos.y + delta.y });
          }
          const cmd = new MoveElementsCommand(this.engine, this.dragOriginalPositions, after);
          this.engine.history.execute(cmd);
        }

        this.engine.guidelines.clear();
        this.engine.snap.clearExcluded();
        break;
      }
      case 'box-selecting': {
        if (this.boxSelectStart) {
          const rect = this.makeRect(this.boxSelectStart, event.worldPoint);
          const ids = this.engine!.spatialIndex.queryRect(rect);
          const visibleIds = ids.filter(id => {
            const el = this.engine!.state.get(id);
            return el && el.visible && !el.locked && this.rectIntersectsElement(rect, el);
          });
          const expandedRows = this.expandSelectionWithRows(visibleIds);
          const expanded = this.expandSelectionWithTables(expandedRows);
          if (event.shiftKey) {
            for (const id of expanded) {
              this.engine.selection.addToSelection(id);
            }
          } else {
            this.engine.selection.selectMultiple(expanded);
          }
          this.engine.events.emit('selection:changed', {
            selectedIds: this.engine.selection.getSelectedIds(),
          });
        }
        this.engine.events.emit('boxselect:end', {});
        break;
      }
      case 'resizing-area': {
        if (!this.resizingAreaId || !this.resizeOriginalBounds || !this.resizeOriginalPosition || !this.resizeDragStart) break;

        const areaEl = this.engine.state.get(this.resizingAreaId);
        if (!areaEl) break;

        const finalBounds = { ...areaEl.bounds };
        const finalPosition = { ...areaEl.transform.position };

        // Restore original bounds before creating command
        const restoredArea = {
          ...areaEl,
          bounds: this.resizeOriginalBounds,
          transform: { ...areaEl.transform, position: this.resizeOriginalPosition },
        } as MapElement;
        this.engine.state.set(this.resizingAreaId, restoredArea);
        this.engine.spatialIndex.update(restoredArea);

        // Only commit if bounds actually changed
        if (
          finalBounds.x !== this.resizeOriginalBounds.x ||
          finalBounds.y !== this.resizeOriginalBounds.y ||
          finalBounds.width !== this.resizeOriginalBounds.width ||
          finalBounds.height !== this.resizeOriginalBounds.height
        ) {
          const cmd = new ResizeElementCommand(
            this.engine,
            this.resizingAreaId,
            this.resizeOriginalBounds,
            finalBounds,
            this.resizeOriginalPosition,
            finalPosition,
          );
          this.engine.history.execute(cmd);
        }

        this.engine.events.emit('selection:changed', {
          selectedIds: this.engine.selection.getSelectedIds(),
        });
        break;
      }
      case 'curving-row': {
        if (!this.curveDragStart || !this.curvingRowId) break;

        const curveRow = this.engine.state.get(this.curvingRowId) as Row | undefined;
        if (!curveRow || curveRow.seatIds.length < 2) break;

        const origFirst = this.curveOriginalPositions.get(curveRow.seatIds[0]);
        const origLast = this.curveOriginalPositions.get(curveRow.seatIds[curveRow.seatIds.length - 1]);
        if (!origFirst || !origLast) break;

        const cAngle = angleBetween(origFirst, origLast);
        const perpX = -Math.sin(cAngle);
        const perpY = Math.cos(cAngle);
        const dragDelta = {
          x: event.worldPoint.x - this.curveDragStart.x,
          y: event.worldPoint.y - this.curveDragStart.y,
        };
        const perpDisplacement = (dragDelta.x * perpX + dragDelta.y * perpY) + this.curveOriginalRadius;

        // Clamp to prevent arc from exceeding ~171° (semicircle limit)
        const chord = distance(origFirst, origLast);
        const maxSagitta = (chord / 2) * 0.75;
        const clampedDisplacement = Math.max(-maxSagitta, Math.min(maxSagitta, perpDisplacement));

        // Snap to straight when curvature is below threshold
        const finalDisplacement = isRowCurvatureEffectivelyStraight(clampedDisplacement, chord) ? 0 : clampedDisplacement;

        if (finalDisplacement !== this.curveOriginalRadius) {
          // Restore original positions first
          for (const [seatId, origPos] of this.curveOriginalPositions) {
            const seat = this.engine.state.get(seatId) as Seat | undefined;
            if (!seat) continue;
            const restored: Seat = {
              ...seat,
              transform: { ...seat.transform, position: origPos },
              bounds: { x: origPos.x - seat.radius, y: origPos.y - seat.radius, width: seat.radius * 2, height: seat.radius * 2 },
            };
            this.engine.state.set(seatId, restored);
          }

          // Compute new seat positions for the command
          const newPositions = this.computeCurvePositions(curveRow, origFirst, origLast, finalDisplacement);
          const cmd = new CurveRowCommand(this.engine, this.curvingRowId, finalDisplacement, newPositions);
          this.engine.history.execute(cmd);
        }

        // Re-select the row to refresh handles
        this.engine.events.emit('selection:changed', {
          selectedIds: this.engine.selection.getSelectedIds(),
        });
        break;
      }
      case 'extending-row': {
        if (!this.extendDragStart || !this.extendingRowId || !this.extendingHandle) break;

        const row = this.engine.state.get(this.extendingRowId) as Row | undefined;
        if (!row) break;

        const dragDelta = {
          x: event.worldPoint.x - this.extendDragStart.x,
          y: event.worldPoint.y - this.extendDragStart.y,
        };

        const extTangents = this.getCurvedRowTangents(row);

        let projection: number;
        let extEffectiveSpacing = row.spacing;
        if (extTangents) {
          const dir = this.extendingHandle === 'right' ? extTangents.rightDir : extTangents.leftDir;
          projection = dragDelta.x * dir.x + dragDelta.y * dir.y;
          // Arc length per seat using curveDefinition
          const extFirstSeat = this.engine.state.get(row.seatIds[0]) as Seat | undefined;
          const extLastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]) as Seat | undefined;
          if (extFirstSeat && extLastSeat) {
            const def = row.curveDefinition ?? curveDefinitionFromEndpoints(extFirstSeat.transform.position, extLastSeat.transform.position);
            const localXFirst = worldToParabolaLocalX(extFirstSeat.transform.position, def);
            const localXLast = worldToParabolaLocalX(extLastSeat.transform.position, def);
            extEffectiveSpacing = parabolaArcLength(localXFirst, localXLast, extTangents.sagitta, extTangents.chord) / (row.seatIds.length - 1);
          }
        } else {
          const angle = row.orientationAngle;
          const dirX = Math.cos(angle);
          const dirY = Math.sin(angle);
          const sign = this.extendingHandle === 'right' ? 1 : -1;
          projection = (dragDelta.x * dirX + dragDelta.y * dirY) * sign;
        }

        if (projection >= extEffectiveSpacing) {
          // Expansion: add new seats
          const newSeatCount = Math.floor(projection / extEffectiveSpacing);
          const anchorSeatId = this.extendingHandle === 'right'
            ? row.seatIds[row.seatIds.length - 1]
            : row.seatIds[0];
          const anchorSeat = this.engine.state.get(anchorSeatId) as Seat | undefined;
          if (anchorSeat) {
            const newSeats: Seat[] = [];

            if (extTangents) {
              // Place new seats along parabola continuation using curveDefinition
              const firstSeat = this.engine.state.get(row.seatIds[0]) as Seat | undefined;
              const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]) as Seat | undefined;
              if (firstSeat && lastSeat) {
                const def = row.curveDefinition ?? curveDefinitionFromEndpoints(firstSeat.transform.position, lastSeat.transform.position);
                const chord = def.chord;
                const sagitta = extTangents.sagitta;
                const cosA = Math.cos(def.angle);
                const sinA = Math.sin(def.angle);
                const midX = def.center.x;
                const midY = def.center.y;

                const anchorLocalX = worldToParabolaLocalX(anchorSeat.transform.position, def);
                const direction: 1 | -1 = this.extendingHandle === 'right' ? 1 : -1;
                const r = anchorSeat.radius || DEFAULT_SEAT_RADIUS;

                for (let i = 1; i <= newSeatCount; i++) {
                  const lx = parabolaXAtArcLength(anchorLocalX, extEffectiveSpacing * i, sagitta, chord, direction);
                  const ly = parabolaY(lx, sagitta, chord);
                  const pos = {
                    x: midX + lx * cosA - ly * sinA,
                    y: midY + lx * sinA + ly * cosA,
                  };
                  const seat: Seat = {
                    id: generateElementId(),
                    type: 'seat',
                    label: '',
                    rowId: row.id,
                    tableId: null,
                    status: 'available',
                    category: anchorSeat.category,
                    radius: r,
                    transform: {
                      position: pos,
                      rotation: 0,
                      scale: { x: 1, y: 1 },
                    },
                    bounds: {
                      x: pos.x - r,
                      y: pos.y - r,
                      width: r * 2,
                      height: r * 2,
                    },
                    locked: false,
                    visible: true,
                  };
                  newSeats.push(seat);
                }
              }
            } else {
              const angle = row.orientationAngle;
              const dirX = Math.cos(angle);
              const dirY = Math.sin(angle);
              const sign = this.extendingHandle === 'right' ? 1 : -1;
              for (let i = 1; i <= newSeatCount; i++) {
                const pos = {
                  x: anchorSeat.transform.position.x + dirX * row.spacing * i * sign,
                  y: anchorSeat.transform.position.y + dirY * row.spacing * i * sign,
                };
                const seat: Seat = {
                  id: generateElementId(),
                  type: 'seat',
                  label: '',
                  rowId: row.id,
                  tableId: null,
                  status: 'available',
                  category: anchorSeat.category,
                  radius: anchorSeat.radius || DEFAULT_SEAT_RADIUS,
                  transform: {
                    position: pos,
                    rotation: 0,
                    scale: { x: 1, y: 1 },
                  },
                  bounds: {
                    x: pos.x - (anchorSeat.radius || DEFAULT_SEAT_RADIUS),
                    y: pos.y - (anchorSeat.radius || DEFAULT_SEAT_RADIUS),
                    width: (anchorSeat.radius || DEFAULT_SEAT_RADIUS) * 2,
                    height: (anchorSeat.radius || DEFAULT_SEAT_RADIUS) * 2,
                  },
                  locked: false,
                  visible: true,
                };
                newSeats.push(seat);
              }
            }

            if (newSeats.length > 0) {
              const originalRow: Row = { ...row, seatIds: [...row.seatIds] };
              const cmd = new ExtendRowCommand(
                this.engine,
                row.id,
                newSeats,
                this.extendingHandle,
                originalRow,
              );
              this.engine.history.execute(cmd);
            }
          }
        } else if (projection <= -extEffectiveSpacing && row.seatIds.length > 1) {
          // Contraction: remove seats from the dragged side
          const seatsToRemove = Math.min(
            Math.floor(Math.abs(projection) / extEffectiveSpacing),
            row.seatIds.length - 1,
          );

          const removedSeats: Seat[] = [];
          if (this.extendingHandle === 'right') {
            for (let i = 0; i < seatsToRemove; i++) {
              const seatId = row.seatIds[row.seatIds.length - 1 - i];
              const seat = this.engine.state.get(seatId) as Seat | undefined;
              if (seat) removedSeats.push(seat);
            }
          } else {
            for (let i = 0; i < seatsToRemove; i++) {
              const seatId = row.seatIds[i];
              const seat = this.engine.state.get(seatId) as Seat | undefined;
              if (seat) removedSeats.push(seat);
            }
          }

          if (removedSeats.length > 0) {
            const originalRow: Row = { ...row, seatIds: [...row.seatIds] };
            const cmd = new ContractRowCommand(
              this.engine,
              row.id,
              removedSeats,
              this.extendingHandle,
              originalRow,
            );
            this.engine.history.execute(cmd);
          }
        }

        this.engine.events.emit('preview:clear', {});

        // Re-select the row with updated seatIds so new/remaining seats are in the selection
        {
          const updatedRow = this.engine.state.get(this.extendingRowId) as Row | undefined;
          if (updatedRow && isRow(updatedRow)) {
            const newSelection = [updatedRow.id, ...updatedRow.seatIds] as ElementId[];
            this.engine.selection.selectMultiple(newSelection);
          }
          this.engine.events.emit('selection:changed', {
            selectedIds: this.engine.selection.getSelectedIds(),
          });
        }
        break;
      }
    }

    this.dragStartWorld = null;
    this.dragStartScreen = null;
    this.dragOriginalPositions.clear();
    this.dragOriginalCurveDefinitions.clear();
    this.boxSelectStart = null;
    this.boxSelectCurrent = null;
    this.extendingRowId = null;
    this.extendingHandle = null;
    this.extendDragStart = null;
    this.curvingRowId = null;
    this.curveDragStart = null;
    this.curveOriginalPositions.clear();
    this.rotatingIds = [];
    this.rotationPrimaryId = null;
    this.rotationCenter = null;
    this.rotationOriginalTransforms.clear();
    this.resizingAreaId = null;
    this.resizeCorner = null;
    this.resizeOriginalBounds = null;
    this.resizeOriginalPosition = null;
    this.resizeDragStart = null;
    this.transition('idle');
    this.engine.events.emit('render:request', {});
  }

  onKeyDown(event: KeyboardEvent): void {
    if (!this.engine) return;
    if (event.key === 'Escape') {
      this.cancel();
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      const ids = this.engine!.selection.getSelectedIds();
      if (ids.length > 0) {
        this.engine!.events.emit('delete:confirm', { elementIds: [...ids] });
      }
    }
  }

  cancel(): void {
    if (this._currentState === 'dragging' && this.engine) {
      // Revert to original positions, curveDefinitions, and vertices
      const reverted: MapElement[] = [];
      for (const [id, origPos] of this.dragOriginalPositions) {
        const el = this.engine.state.get(id);
        if (!el) continue;
        const origVertices = this.dragOriginalVertices.get(id);
        let restored: MapElement;
        if (isArea(el) && origVertices && origVertices.length >= 3) {
          const area = el as Area;
          const bounds = boundsFromVertices(origVertices);
          restored = {
            ...area,
            transform: { ...area.transform, position: origPos },
            bounds,
            vertices: [...origVertices],
          } as MapElement;
        } else {
          restored = {
            ...el,
            transform: { ...el.transform, position: origPos },
            bounds: { ...el.bounds, x: origPos.x - el.bounds.width / 2, y: origPos.y - el.bounds.height / 2 },
          } as MapElement;
        }
        const origCurveDef = this.dragOriginalCurveDefinitions.get(id);
        if (isRow(restored) && origCurveDef !== undefined) {
          restored = { ...restored, curveDefinition: origCurveDef } as MapElement;
        }
        this.engine.state.set(id, restored);
        this.engine.spatialIndex.update(restored);
        reverted.push(restored);
      }
      this.engine.guidelines.clear();
      this.engine.snap.clearExcluded();
      this.engine.events.emit('elements:updated', { elements: reverted });
      this.engine.events.emit('render:request', {});
    }
    if (this._currentState === 'box-selecting' && this.engine) {
      this.engine.events.emit('boxselect:end', {});
      this.engine.selection.clearSelection();
      this.engine.events.emit('selection:changed', { selectedIds: [] });
      this.engine.events.emit('render:request', {});
    }
    if (this._currentState === 'extending-row' && this.engine) {
      this.engine.events.emit('preview:clear', {});
      this.engine.events.emit('render:request', {});
    }
    if (this._currentState === 'curving-row' && this.engine) {
      // Restore original positions
      for (const [seatId, origPos] of this.curveOriginalPositions) {
        const seat = this.engine.state.get(seatId) as Seat | undefined;
        if (!seat) continue;
        const restored: Seat = {
          ...seat,
          transform: { ...seat.transform, position: origPos },
          bounds: { x: origPos.x - seat.radius, y: origPos.y - seat.radius, width: seat.radius * 2, height: seat.radius * 2 },
        };
        this.engine.state.set(seatId, restored);
        this.engine.spatialIndex.update(restored);
      }
      this.engine.events.emit('render:request', {});
    }
    if (this._currentState === 'resizing-area' && this.engine) {
      // Restore original bounds
      if (this.resizingAreaId && this.resizeOriginalBounds && this.resizeOriginalPosition) {
        const el = this.engine.state.get(this.resizingAreaId);
        if (el) {
          const restored = {
            ...el,
            bounds: this.resizeOriginalBounds,
            transform: { ...el.transform, position: this.resizeOriginalPosition },
          } as MapElement;
          this.engine.state.set(this.resizingAreaId, restored);
          this.engine.spatialIndex.update(restored);
        }
      }
      this.engine.events.emit('elements:updated', { elements: [] });
      this.engine.events.emit('render:request', {});
    }
    if (this._currentState === 'rotating' && this.engine) {
      // Restore original transforms
      for (const id of this.rotatingIds) {
        const orig = this.rotationOriginalTransforms.get(id);
        const el = this.engine.state.get(id);
        if (!orig || !el) continue;
        const restored = {
          ...el,
          transform: { ...el.transform, position: orig.position, rotation: orig.rotation },
        } as MapElement;
        this.engine.state.set(id, restored);
        this.engine.spatialIndex.update(restored);
      }
      this.engine.events.emit('preview:clear', {});
      this.engine.events.emit('cursor:changed', { cursor: this.cursor });
      this.engine.events.emit('render:request', {});
    }
    this.dragStartWorld = null;
    this.dragOriginalPositions.clear();
    this.dragOriginalCurveDefinitions.clear();
    this.dragOriginalVertices.clear();
    this.boxSelectStart = null;
    this.boxSelectCurrent = null;
    this.extendingRowId = null;
    this.extendingHandle = null;
    this.extendDragStart = null;
    this.curvingRowId = null;
    this.curveDragStart = null;
    this.curveOriginalPositions.clear();
    this.rotatingIds = [];
    this.rotationPrimaryId = null;
    this.rotationCenter = null;
    this.rotationOriginalTransforms.clear();
    this.lastRotationGuidelinesAngle = null;
    this.resizingAreaId = null;
    this.resizeCorner = null;
    this.resizeOriginalBounds = null;
    this.resizeOriginalPosition = null;
    this.resizeDragStart = null;
    this.transition('idle');
  }

  getBoxSelectRect(): Rect | null {
    if (this.boxSelectStart && this.boxSelectCurrent) {
      return this.makeRect(this.boxSelectStart, this.boxSelectCurrent);
    }
    return null;
  }

  /**
   * For a curved row, compute the outward tangent directions at the first and last seats.
   * Returns null if the row is straight (curveRadius ~0).
   * Uses parabolic curve math.
   */
  private getCurvedRowTangents(row: Row): { leftDir: Point; rightDir: Point; chord: number; sagitta: number } | null {
    if (!this.engine || row.seatIds.length < 2) return null;

    const firstSeat = this.engine.state.get(row.seatIds[0]);
    const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]);
    if (!firstSeat || !lastSeat || !isSeat(firstSeat) || !isSeat(lastSeat)) return null;

    const firstPos = firstSeat.transform.position;
    const lastPos = lastSeat.transform.position;
    const sagitta = row.curveRadius ?? 0;

    // Use curveDefinition if available, fallback to endpoints
    const def = row.curveDefinition ?? curveDefinitionFromEndpoints(firstPos, lastPos);
    if (isRowCurvatureEffectivelyStraight(sagitta, def.chord)) return null;

    // Compute actual local x of first and last seats on the parabola
    const localXFirst = worldToParabolaLocalX(firstPos, def);
    const localXLast = worldToParabolaLocalX(lastPos, def);

    // Local tangent at actual first seat position
    const tLeft = parabolaTangentLocal(localXFirst, sagitta, def.chord);
    // Local tangent at actual last seat position
    const tRight = parabolaTangentLocal(localXLast, sagitta, def.chord);

    // Transform local tangents to world space using the parabola angle
    const cosA = Math.cos(def.angle);
    const sinA = Math.sin(def.angle);

    // Left outward = opposite of curve traversal direction at left end
    const leftRawX = -(tLeft.tx * cosA - tLeft.ty * sinA);
    const leftRawY = -(tLeft.tx * sinA + tLeft.ty * cosA);
    const leftLen = Math.sqrt(leftRawX * leftRawX + leftRawY * leftRawY);
    const leftDir: Point = { x: leftRawX / leftLen, y: leftRawY / leftLen };

    // Right outward = same as curve traversal direction at right end
    const rightRawX = tRight.tx * cosA - tRight.ty * sinA;
    const rightRawY = tRight.tx * sinA + tRight.ty * cosA;
    const rightLen = Math.sqrt(rightRawX * rightRawX + rightRawY * rightRawY);
    const rightDir: Point = { x: rightRawX / rightLen, y: rightRawY / rightLen };

    return { leftDir, rightDir, chord: def.chord, sagitta };
  }

  private hitTestHandles(point: Point): { rowId: ElementId; handle: 'left' | 'right' } | null {
    if (!this.engine) return null;

    const selectedIds = this.engine.selection.getSelectedIds();
    if (selectedIds.length === 0) return null;

    // Find selected rows
    const selectedRowIds = new Set<ElementId>();
    for (const id of selectedIds) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      if (isRow(el)) {
        selectedRowIds.add(el.id);
      } else if (isSeat(el) && el.rowId) {
        selectedRowIds.add(el.rowId);
      }
    }

    // Handles only show for single row selection
    if (selectedRowIds.size !== 1) return null;

    const rowId = selectedRowIds.values().next().value as ElementId;
    const row = this.engine.state.get(rowId);
    if (!row || !isRow(row) || row.seatIds.length < 1) return null;

    const firstSeat = this.engine.state.get(row.seatIds[0]);
    const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]);
    if (!firstSeat || !lastSeat || !isSeat(firstSeat) || !isSeat(lastSeat)) return null;

    const offset = firstSeat.radius + 6;
    const tangents = this.getCurvedRowTangents(row);

    let leftPos: Point;
    let rightPos: Point;

    if (tangents) {
      leftPos = {
        x: firstSeat.transform.position.x + tangents.leftDir.x * offset,
        y: firstSeat.transform.position.y + tangents.leftDir.y * offset,
      };
      rightPos = {
        x: lastSeat.transform.position.x + tangents.rightDir.x * offset,
        y: lastSeat.transform.position.y + tangents.rightDir.y * offset,
      };
    } else {
      const angle = row.orientationAngle;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      leftPos = {
        x: firstSeat.transform.position.x - dirX * offset,
        y: firstSeat.transform.position.y - dirY * offset,
      };
      rightPos = {
        x: lastSeat.transform.position.x + dirX * offset,
        y: lastSeat.transform.position.y + dirY * offset,
      };
    }

    const hitRadius = 8;
    if (distance(point, leftPos) < hitRadius) {
      return { rowId, handle: 'left' };
    }
    if (distance(point, rightPos) < hitRadius) {
      return { rowId, handle: 'right' };
    }

    return null;
  }

  private showGuidelinesAtPoint(point: Point): void {
    if (!this.engine) return;
    const snapResult = this.engine.snap.snapPoint(point);
    const selfGuidelines = this.computeSelfGuidelines();
    const allAngle = [...snapResult.angleTargets, ...selfGuidelines];
    // For dragging/selection, only show angle-based guidelines (row/table
    // directions and perpendiculars), not generic proximity/axis guides.
    if (allAngle.length > 0) {
      this.engine.guidelines.computeFromSnapTargets([], allAngle);
    }
  }

  private updateRotationGuidelines(currentAngle?: number): void {
    if (!this.engine) return;
    if (this._currentState !== 'rotating') return;
    if (!this.rotationCenter) return;

    // Lightweight throttling: skip tiny angle changes to reduce work on jitter
    if (typeof currentAngle === 'number') {
      if (
        this.lastRotationGuidelinesAngle !== null &&
        Math.abs(currentAngle - this.lastRotationGuidelinesAngle) < degToRad(0.5)
      ) {
        return;
      }
      this.lastRotationGuidelinesAngle = currentAngle;
    }

    // During rotation, show only guidelines derived from the rotating
    // selection itself – no proximity/angle targets from other elements.
    const selfGuidelines = this.computeSelfGuidelines();
    if (selfGuidelines.length > 0) {
      this.engine.guidelines.computeFromSnapTargets([], selfGuidelines);
    } else {
      this.engine.guidelines.clear();
    }
  }

  private clearRotationGuidelines(): void {
    if (!this.engine) return;
    this.lastRotationGuidelinesAngle = null;
    this.engine.guidelines.clear();
  }

  /**
   * Generate guidelines from the dragged elements themselves:
   * - For rows: along orientationAngle and perpendicular through the row's position
   * - For rows in areas: also show guidelines for the outermost (extreme) rows of the area
   * - For tables: horizontal and vertical through the table's center
   */
  private computeSelfGuidelines(): AngleSnapTarget[] {
    if (!this.engine) return [];
    const targets: AngleSnapTarget[] = [];
    const selectedIds = this.engine.selection.getSelectedIds();
    const seen = new Set<string>();
    const processedAreas = new Set<string>();

    for (const id of selectedIds) {
      const el = this.engine.state.get(id);
      if (!el) continue;

      // Resolve the row (directly or via seat)
      let row: Row | null = null;
      if (isRow(el)) {
        row = el;
      } else if (isSeat(el) && el.rowId) {
        const r = this.engine.state.get(el.rowId);
        if (r && isRow(r)) row = r;
      }

      if (row) {
        const key = `row-${row.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          const pos = row.transform.position;
          // Derive current row direction from seat positions when possible so
          // guidelines follow live transforms (e.g. during rotation preview).
          let directionAngle = row.orientationAngle;
          if (row.seatIds.length >= 2) {
            const firstSeat = this.engine.state.get(row.seatIds[0]);
            const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]);
            if (firstSeat && lastSeat && isSeat(firstSeat) && isSeat(lastSeat)) {
              directionAngle = angleBetween(firstSeat.transform.position, lastSeat.transform.position);
            }
          }
          // Along row direction through row center
          targets.push({
            throughPoint: pos,
            angle: directionAngle,
            sourceElementId: row.id,
            alignmentType: 'center',
          });
          // Perpendicular guidelines at first and last seat (extremes)
          if (row.seatIds.length > 0) {
            const firstSeat = this.engine.state.get(row.seatIds[0]);
            const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]);
            if (firstSeat) {
              targets.push({
                throughPoint: firstSeat.transform.position,
                angle: directionAngle + Math.PI / 2,
                sourceElementId: row.seatIds[0],
                alignmentType: 'edge-start',
              });
            }
            if (lastSeat && row.seatIds.length > 1) {
              targets.push({
                throughPoint: lastSeat.transform.position,
                angle: directionAngle + Math.PI / 2,
                sourceElementId: row.seatIds[row.seatIds.length - 1],
                alignmentType: 'edge-end',
              });
            }
          }
        }
      }

      // For tables: horizontal and vertical through center
      if (isTable(el)) {
        const pos = el.transform.position;
        const key = `table-${id}`;
        if (!seen.has(key)) {
          seen.add(key);
          targets.push({
            throughPoint: pos,
            angle: 0,
            sourceElementId: id,
            alignmentType: 'center',
          });
          targets.push({
            throughPoint: pos,
            angle: Math.PI / 2,
            sourceElementId: id,
            alignmentType: 'center',
          });
        }
      }
    }

    return targets;
  }

  /**
   * Find the outermost (extreme) rows of an area and add their guidelines.
   * Projects each row's position onto the perpendicular axis of the row direction
   * to find the first and last rows in the stacking direction.
   */
  private addExtremeRowGuidelines(
    area: Area,
    orientationAngle: number,
    targets: AngleSnapTarget[],
    seen: Set<string>,
  ): void {
    if (!this.engine) return;

    const perpX = -Math.sin(orientationAngle);
    const perpY = Math.cos(orientationAngle);

    let minProj = Infinity;
    let maxProj = -Infinity;
    let minRow: Row | null = null;
    let maxRow: Row | null = null;

    for (const rowId of area.rowIds) {
      const r = this.engine.state.get(rowId);
      if (!r || !isRow(r)) continue;

      const pos = r.transform.position;
      const proj = pos.x * perpX + pos.y * perpY;

      if (proj < minProj) {
        minProj = proj;
        minRow = r;
      }
      if (proj > maxProj) {
        maxProj = proj;
        maxRow = r;
      }
    }

    const extremeRows = [minRow, maxRow].filter((r): r is Row => r !== null);
    for (const r of extremeRows) {
      const key = `row-${r.orientationAngle.toFixed(4)}-${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const pos = r.transform.position;
      targets.push({
        throughPoint: pos,
        angle: r.orientationAngle,
        sourceElementId: r.id,
        alignmentType: 'edge-start',
      });
      targets.push({
        throughPoint: pos,
        angle: r.orientationAngle + Math.PI / 2,
        sourceElementId: r.id,
        alignmentType: 'edge-end',
      });
    }
  }

  private isPointInSelectionBounds(point: Point): boolean {
    const selectedIds = this.engine!.selection.getSelectedIds();
    if (selectedIds.length === 0) return false;

    // Check if this is a single-row selection — use rotated OBB
    const selectedRowIds = new Set<ElementId>();
    for (const id of selectedIds) {
      const el = this.engine!.state.get(id);
      if (!el) continue;
      if (isRow(el)) selectedRowIds.add(el.id);
      else if (isSeat(el) && el.rowId) selectedRowIds.add(el.rowId);
    }

    if (selectedRowIds.size === 1) {
      const rowId = selectedRowIds.values().next().value as ElementId;
      const row = this.engine!.state.get(rowId);
      if (row && isRow(row) && row.seatIds.length >= 2) {
        const seatPositions: Point[] = [];
        let seatRadius = 0;
        let allValid = true;
        for (const seatId of row.seatIds) {
          const seat = this.engine!.state.get(seatId);
          if (!seat || !isSeat(seat)) { allValid = false; break; }
          seatPositions.push(seat.transform.position);
          seatRadius = seat.radius;
        }
        if (allValid && seatPositions.length >= 2) {
          const angle = row.orientationAngle;
          const cosA = Math.cos(-angle);
          const sinA = Math.sin(-angle);

          // Compute centroid
          let cx = 0, cy = 0;
          for (const p of seatPositions) { cx += p.x; cy += p.y; }
          cx /= seatPositions.length;
          cy /= seatPositions.length;

          // Compute local AABB
          let minLx = Infinity, minLy = Infinity, maxLx = -Infinity, maxLy = -Infinity;
          for (const p of seatPositions) {
            const dx = p.x - cx;
            const dy = p.y - cy;
            const lx = dx * cosA - dy * sinA;
            const ly = dx * sinA + dy * cosA;
            minLx = Math.min(minLx, lx);
            minLy = Math.min(minLy, ly);
            maxLx = Math.max(maxLx, lx);
            maxLy = Math.max(maxLy, ly);
          }

          // Transform test point into local frame
          const pdx = point.x - cx;
          const pdy = point.y - cy;
          const plx = pdx * cosA - pdy * sinA;
          const ply = pdx * sinA + pdy * cosA;

          const padding = 6;
          return plx >= minLx - seatRadius - padding && plx <= maxLx + seatRadius + padding &&
                 ply >= minLy - seatRadius - padding && ply <= maxLy + seatRadius + padding;
        }
      }
    }

    // AABB fallback for non-row or multi-row selections
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of selectedIds) {
      const el = this.engine!.state.get(id);
      if (!el) continue;
      minX = Math.min(minX, el.bounds.x);
      minY = Math.min(minY, el.bounds.y);
      maxX = Math.max(maxX, el.bounds.x + el.bounds.width);
      maxY = Math.max(maxY, el.bounds.y + el.bounds.height);
    }

    const padding = 6;
    return point.x >= minX - padding && point.x <= maxX + padding &&
           point.y >= minY - padding && point.y <= maxY + padding;
  }

  private expandSelectionWithRows(ids: ElementId[]): ElementId[] {
    if (!this.engine) return ids;
    const expanded = new Set<ElementId>(ids);

    for (const id of ids) {
      const el = this.engine.state.get(id);
      if (!el) continue;

      if (isSeat(el) && el.rowId) {
        // Seat belongs to a row → add the row + all sibling seats
        const row = this.engine.state.get(el.rowId);
        if (row && isRow(row)) {
          expanded.add(row.id);
          for (const seatId of row.seatIds) expanded.add(seatId);
        }
      } else if (isRow(el)) {
        // Row selected directly → add all its seats
        for (const seatId of el.seatIds) expanded.add(seatId);
      }
    }

    return Array.from(expanded);
  }

  private expandSelectionWithTables(ids: ElementId[]): ElementId[] {
    if (!this.engine) return ids;
    const expanded = new Set<ElementId>(ids);

    for (const id of ids) {
      const el = this.engine.state.get(id);
      if (!el) continue;

      if (isSeat(el) && el.tableId) {
        // Seat belongs to a table → add the table + all sibling seats
        const table = this.engine.state.get(el.tableId);
        if (table && isTable(table)) {
          expanded.add(table.id);
          for (const seatId of table.seatIds) expanded.add(seatId);
        }
      } else if (isTable(el)) {
        // Table selected directly → add all its seats
        for (const seatId of el.seatIds) expanded.add(seatId);
      }
    }

    return Array.from(expanded);
  }

  private makeRect(a: Point, b: Point): Rect {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(b.x - a.x),
      height: Math.abs(b.y - a.y),
    };
  }

  private rectIntersectsElement(rect: Rect, el: MapElement): boolean {
    if (el.type === 'row') {
      const row = el as Row;
      for (const seatId of row.seatIds) {
        const seat = this.engine!.state.get(seatId);
        if (seat && isSeat(seat)) {
          if (this.circleIntersectsRect(seat.transform.position, seat.radius, rect)) {
            return true;
          }
        }
      }
      return false;
    }
    // For other types, AABB overlap from spatial index is sufficient
    const b = el.bounds;
    return rect.x < b.x + b.width && rect.x + rect.width > b.x &&
           rect.y < b.y + b.height && rect.y + rect.height > b.y;
  }

  private circleIntersectsRect(center: Point, radius: number, rect: Rect): boolean {
    const closestX = Math.max(rect.x, Math.min(center.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(center.y, rect.y + rect.height));
    const dx = center.x - closestX;
    const dy = center.y - closestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  private hitTestCurveHandle(point: Point): ElementId | null {
    if (!this.engine) return null;

    const selectedIds = this.engine.selection.getSelectedIds();
    if (selectedIds.length === 0) return null;

    const selectedRowIds = new Set<ElementId>();
    for (const id of selectedIds) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      if (isRow(el)) {
        selectedRowIds.add(el.id);
      } else if (isSeat(el) && el.rowId) {
        selectedRowIds.add(el.rowId);
      }
    }

    if (selectedRowIds.size !== 1) return null;

    const rowId = selectedRowIds.values().next().value as ElementId;
    const row = this.engine.state.get(rowId);
    if (!row || !isRow(row) || row.seatIds.length < 2) return null;

    const firstSeat = this.engine.state.get(row.seatIds[0]);
    const lastSeat = this.engine.state.get(row.seatIds[row.seatIds.length - 1]);
    if (!firstSeat || !lastSeat || !isSeat(firstSeat) || !isSeat(lastSeat)) return null;

    const firstPos = firstSeat.transform.position;
    const lastPos = lastSeat.transform.position;

    // Use curveDefinition for center/angle if available (asymmetric curves)
    const def = row.curveDefinition ?? curveDefinitionFromEndpoints(firstPos, lastPos);
    const midX = def.center.x;
    const midY = def.center.y;

    const perpX = -Math.sin(def.angle);
    const perpY = Math.cos(def.angle);

    const curveOffset = row.curveRadius || 0;
    // Clamp handle position to match curve limits
    const maxSagitta = (def.chord / 2) * 0.75;
    const clampedOffset = Math.max(-maxSagitta, Math.min(maxSagitta, curveOffset));
    const handlePos: Point = clampedOffset === 0
      ? { x: midX + perpX * 20, y: midY + perpY * 20 }
      : { x: midX + perpX * clampedOffset, y: midY + perpY * clampedOffset };

    if (distance(point, handlePos) < 10) {
      return rowId;
    }

    return null;
  }

  private repositionSeatsAlongCurve(
    row: Row,
    origFirst: Point,
    origLast: Point,
    perpDisplacement: number,
  ): void {
    if (!this.engine) return;

    const positions = this.computeCurvePositions(row, origFirst, origLast, perpDisplacement);
    const updated: MapElement[] = [];

    for (const [seatId, pos] of positions) {
      const seat = this.engine.state.get(seatId) as Seat | undefined;
      if (!seat) continue;
      const updatedSeat: Seat = {
        ...seat,
        transform: { ...seat.transform, position: pos },
        bounds: { x: pos.x - seat.radius, y: pos.y - seat.radius, width: seat.radius * 2, height: seat.radius * 2 },
      };
      this.engine.state.set(seatId, updatedSeat);
      this.engine.spatialIndex.update(updatedSeat);
      updated.push(updatedSeat);
    }

    if (updated.length > 0) {
      this.engine.events.emit('elements:updated', { elements: updated });
      this.engine.events.emit('render:request', {});
    }
  }

  private computeCurvePositions(
    row: Row,
    origFirst: Point,
    origLast: Point,
    perpDisplacement: number,
  ): Map<ElementId, Point> {
    const positions = new Map<ElementId, Point>();
    const seatCount = row.seatIds.length;
    if (seatCount < 2) return positions;

    const chord = distance(origFirst, origLast);
    if (isRowCurvatureEffectivelyStraight(perpDisplacement, chord)) {
      // Essentially straight — distribute seats linearly
      for (let i = 0; i < seatCount; i++) {
        const t = i / (seatCount - 1);
        positions.set(row.seatIds[i], {
          x: origFirst.x + (origLast.x - origFirst.x) * t,
          y: origFirst.y + (origLast.y - origFirst.y) * t,
        });
      }
      return positions;
    }

    // Use parabolic curve to distribute seats evenly by arc-length
    const worldPositions = parabolaPositions(origFirst, origLast, perpDisplacement, seatCount);
    for (let i = 0; i < seatCount; i++) {
      positions.set(row.seatIds[i], worldPositions[i]);
    }

    return positions;
  }

  private hitTestResizeHandles(point: Point): { areaId: ElementId; corner: string } | null {
    if (!this.engine) return null;

    const selectedIds = this.engine.selection.getSelectedIds();
    if (selectedIds.length !== 1) return null;

    const el = this.engine.state.get(selectedIds[0]);
    if (!el || !isArea(el)) return null;
    if ((el as Area).vertices && (el as Area).vertices!.length >= 3) return null;

    const b = el.bounds;
    const cx = el.transform.position.x;
    const cy = el.transform.position.y;
    const rot = el.transform.rotation;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    const halfW = b.width / 2;
    const halfH = b.height / 2;

    const rotateAroundCenter = (lx: number, ly: number): Point => ({
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR,
    });

    const localCorners = [
      { corner: 'tl', lx: -halfW, ly: -halfH },
      { corner: 'tr', lx: halfW, ly: -halfH },
      { corner: 'bl', lx: -halfW, ly: halfH },
      { corner: 'br', lx: halfW, ly: halfH },
    ];

    for (const c of localCorners) {
      const rotated = rotateAroundCenter(c.lx, c.ly);
      if (distance(point, rotated) < 10) {
        return { areaId: el.id, corner: c.corner };
      }
    }

    return null;
  }

  private hitTestRotationHandle(point: Point): boolean {
    if (!this.engine) return false;

    const selectedIds = this.engine.selection.getSelectedIds();
    if (selectedIds.length === 0) return false;

    // Compute rotation handle position matching SelectionLayer logic
    // Find primary element
    let primaryEl = this.engine.state.get(selectedIds[0]);
    if (!primaryEl) return false;

    // If a seat in a row is selected, use the row
    const selectedRowIds = new Set<ElementId>();
    for (const id of selectedIds) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      if (isRow(el)) selectedRowIds.add(el.id);
      else if (isSeat(el) && el.rowId) selectedRowIds.add(el.rowId);
    }
    if (isSeat(primaryEl) && primaryEl.rowId && selectedRowIds.size === 1) {
      primaryEl = this.engine.state.get(selectedRowIds.values().next().value as ElementId) ?? primaryEl;
    } else if (isSeat(primaryEl) && primaryEl.tableId) {
      primaryEl = this.engine.state.get(primaryEl.tableId) ?? primaryEl;
    }

    let handlePos: Point;

    if (selectedIds.length > 1) {
      // Multi-selection: handle is at top-center of global AABB
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of selectedIds) {
        const el = this.engine.state.get(id);
        if (!el) continue;
        minX = Math.min(minX, el.bounds.x);
        minY = Math.min(minY, el.bounds.y);
        maxX = Math.max(maxX, el.bounds.x + el.bounds.width);
        maxY = Math.max(maxY, el.bounds.y + el.bounds.height);
      }
      handlePos = { x: (minX + maxX) / 2, y: minY - 25 };
    } else {
      // Single element: rotation-aware positioning
      const centerX = primaryEl.transform.position.x;
      const centerY = primaryEl.transform.position.y;
      const rotation = primaryEl.transform.rotation;
      const halfHeight = primaryEl.bounds.height / 2;
      const fullOffset = -(halfHeight + 25);
      const cos = Math.cos(rotation);
      const sin = Math.sin(rotation);
      handlePos = {
        x: centerX - fullOffset * sin,
        y: centerY + fullOffset * cos,
      };
    }

    return distance(point, handlePos) < 10;
  }

  private computeSnappedDelta(rawDeltaAngle: number): { snappedDelta: number; snappedAbsoluteRad: number } {
    if (this.isMultiEntityRotation) {
      // For multi-selection, rotation starts from 0° and represents a pure delta
      const deltaDeg = radToDeg(rawDeltaAngle);
      const snappedDeg = snapAngleDeg(deltaDeg);
      const snappedDelta = degToRad(snappedDeg);
      return { snappedDelta, snappedAbsoluteRad: snappedDelta };
    }

    const primaryId = this.rotationPrimaryId ?? this.rotatingIds[0];
    const orig = this.rotationOriginalTransforms.get(primaryId);
    const originalRotation = orig ? orig.rotation : 0;
    const absoluteDeg = radToDeg(originalRotation + rawDeltaAngle);
    const snappedDeg = snapAngleDeg(absoluteDeg);
    const snappedAbsoluteRad = degToRad(snappedDeg);
    const snappedDelta = snappedAbsoluteRad - originalRotation;
    return { snappedDelta, snappedAbsoluteRad };
  }

  private setupRotation(startPoint: Point): void {
    if (!this.engine) return;

    const selectedIds = this.engine.selection.getSelectedIds();
    if (selectedIds.length === 0) return;

    // Find primary element and all IDs to rotate
    const selectedRowIds = new Set<ElementId>();
    for (const id of selectedIds) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      if (isRow(el)) selectedRowIds.add(el.id);
      else if (isSeat(el) && el.rowId) selectedRowIds.add(el.rowId);
    }

    // Determine primary element for center
    let primaryEl = this.engine.state.get(selectedIds[0]);
    if (!primaryEl) return;
    if (isSeat(primaryEl) && primaryEl.rowId && selectedRowIds.size === 1) {
      primaryEl = this.engine.state.get(selectedRowIds.values().next().value as ElementId) ?? primaryEl;
    } else if (isSeat(primaryEl) && primaryEl.tableId) {
      primaryEl = this.engine.state.get(primaryEl.tableId) ?? primaryEl;
    }

    this.rotationPrimaryId = primaryEl.id;

    // Determine if this is a true multi-entity rotation (multiple distinct top-level entities)
    const topLevelEntities = new Set<ElementId>();
    for (const id of selectedIds) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      if (isSeat(el) && el.rowId) topLevelEntities.add(el.rowId);
      else if (isSeat(el) && el.tableId) topLevelEntities.add(el.tableId);
      else topLevelEntities.add(el.id);
    }
    this.isMultiEntityRotation = topLevelEntities.size > 1;

    // For multi-selection, use the centroid of the global AABB as rotation center
    if (selectedIds.length > 1) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const id of selectedIds) {
        const el = this.engine.state.get(id);
        if (!el) continue;
        minX = Math.min(minX, el.bounds.x);
        minY = Math.min(minY, el.bounds.y);
        maxX = Math.max(maxX, el.bounds.x + el.bounds.width);
        maxY = Math.max(maxY, el.bounds.y + el.bounds.height);
      }
      this.rotationCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
    } else {
      this.rotationCenter = primaryEl.transform.position;
    }

    // Collect all IDs that should rotate
    const allIds = new Set<ElementId>(selectedIds);
    // If rows are selected, include their seats
    for (const rowId of selectedRowIds) {
      const row = this.engine.state.get(rowId);
      if (row && isRow(row)) {
        allIds.add(row.id);
        for (const seatId of row.seatIds) allIds.add(seatId);
      }
    }
    // If tables are selected, include their seats (and vice versa)
    for (const id of selectedIds) {
      const el = this.engine.state.get(id);
      if (!el) continue;
      if (isTable(el)) {
        allIds.add(el.id);
        for (const seatId of el.seatIds) allIds.add(seatId);
      } else if (isSeat(el) && el.tableId) {
        const table = this.engine.state.get(el.tableId);
        if (table && isTable(table)) {
          allIds.add(table.id);
          for (const seatId of table.seatIds) allIds.add(seatId);
        }
      }
    }
    this.rotatingIds = Array.from(allIds);

    // Store original transforms
    this.rotationOriginalTransforms.clear();
    for (const id of this.rotatingIds) {
      const el = this.engine.state.get(id);
      if (el) {
        this.rotationOriginalTransforms.set(id, {
          position: { ...el.transform.position },
          rotation: el.transform.rotation,
        });
      }
    }

    this.rotationStartAngle = Math.atan2(
      startPoint.y - this.rotationCenter.y,
      startPoint.x - this.rotationCenter.x,
    );
  }
}
