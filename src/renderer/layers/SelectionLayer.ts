import Konva from 'konva';
import type { ElementId, Seat, Area, Row } from '@/src/domain/types';
import { isRow, isSeat, isArea } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '@/src/engine/EditorEngine';
import type { ElementLayer } from './ElementLayer';
import { applySeatSelection, clearSeatSelection } from '../shapes/SeatShape';
import { applyAreaSelection, clearAreaSelection } from '../shapes/AreaShape';
import { applyTableSelection, clearTableSelection } from '../shapes/TableShape';
import { distance, angleBetween, parabolaY, parabolaTangentLocal } from '@/src/utils/math';
import { isRowCurvatureEffectivelyStraight } from '@/src/domain/constraints';

export class SelectionLayer {
  readonly layer: Konva.Layer;
  private previousSelectedIds: ElementId[] = [];
  private groupBoundingBox: Konva.Rect | null = null;
  private boxSelectRect: Konva.Rect | null = null;

  // Row shadow shapes (rect for straight, custom shape for curved)
  private rowShadows = new Map<ElementId, Konva.Shape | Konva.Rect>();

  // Extension handles
  private leftHandle: Konva.Circle | null = null;
  private rightHandle: Konva.Circle | null = null;
  handlePositions: { left: Point; right: Point } | null = null;

  // Curve handle
  private curveHandle: Konva.Circle | null = null;
  curveHandlePosition: Point | null = null;

  // Rotation handle
  private rotationHandle: Konva.Circle | null = null;
  rotationHandlePosition: Point | null = null;

  // Resize handles (area corners)
  private resizeHandles: Konva.Rect[] = [];
  resizeHandlePositions: { corner: string; position: Point }[] | null = null;

  constructor() {
    this.layer = new Konva.Layer({ name: 'selection' });
  }

  updateSelection(
    selectedIds: ElementId[],
    engine: EditorEngine,
    elementLayer: ElementLayer,
    toolState?: string,
    toolId?: string,
  ): void {
    const isSeatPicker = toolId === 'seat-picker';
    // 1. Clear previous selections
    for (const id of this.previousSelectedIds) {
      const el = engine.state.get(id);
      const node = elementLayer.getNode(id);
      if (!el || !node) continue;

      switch (el.type) {
        case 'seat':
          clearSeatSelection(node, el as Seat);
          break;
        case 'area':
          clearAreaSelection(node, el as Area);
          break;
        case 'table':
          clearTableSelection(node);
          break;
        case 'row': {
          const row = el as Row;
          for (const seatId of row.seatIds) {
            const seatEl = engine.state.get(seatId);
            const seatNode = elementLayer.getNode(seatId);
            if (seatEl && seatNode && seatEl.type === 'seat') {
              clearSeatSelection(seatNode, seatEl as Seat);
            }
          }
          node.opacity(1);
          break;
        }
      }
    }

    // Clear row shadows
    for (const shadow of this.rowShadows.values()) {
      shadow.destroy();
    }
    this.rowShadows.clear();

    // Clear handles
    this.clearHandles();

    // 2. If nothing selected, hide bounding box and return
    if (selectedIds.length === 0) {
      if (this.groupBoundingBox) {
        this.groupBoundingBox.visible(false);
      }
      this.previousSelectedIds = [];
      this.layer.batchDraw();
      return;
    }

    // Collect unique row IDs from selection
    const selectedRowIds = new Set<ElementId>();
    for (const id of selectedIds) {
      const el = engine.state.get(id);
      if (!el) continue;
      if (isRow(el)) {
        selectedRowIds.add(el.id);
      } else if (isSeat(el) && el.rowId) {
        selectedRowIds.add(el.rowId);
      }
    }

    // 3. Draw row shadows for each selected row (skip during editing or seat-picker)
    const isEditingRow = toolState === 'rotating' || toolState === 'curving-row' || toolState === 'extending-row';
    if (!isEditingRow && !isSeatPicker) {
    for (const rowId of selectedRowIds) {
      const row = engine.state.get(rowId);
      if (!row || !isRow(row) || row.seatIds.length < 2) continue;

      const firstSeat = engine.state.get(row.seatIds[0]);
      const lastSeat = engine.state.get(row.seatIds[row.seatIds.length - 1]);
      if (!firstSeat || !lastSeat || !isSeat(firstSeat) || !isSeat(lastSeat)) continue;

      const firstPos = firstSeat.transform.position;
      const lastPos = lastSeat.transform.position;
      const seatRadius = firstSeat.radius;

      const chord = distance(firstPos, lastPos);
      const isEffectivelyStraight = isRowCurvatureEffectivelyStraight(row.curveRadius ?? 0, chord);

      if (!isEffectivelyStraight) {
        // Curved shadow: draw parabola band as polygon
        const sagitta = row.curveRadius;
        const halfChord = chord / 2;
        const angle = angleBetween(firstPos, lastPos);
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const midX = (firstPos.x + lastPos.x) / 2;
        const midY = (firstPos.y + lastPos.y) / 2;
        const bandOffset = seatRadius + 5;
        const numSamples = 40;

        const shadow = new Konva.Shape({
          sceneFunc: (context, shape) => {
            context.beginPath();

            // Outer edge (offset outward from curve)
            for (let i = 0; i <= numSamples; i++) {
              const lx = -halfChord + (chord * i) / numSamples;
              const ly = parabolaY(lx, sagitta, chord);
              const t = parabolaTangentLocal(lx, sagitta, chord);
              // Normal = perpendicular to tangent, pointing outward (away from straight line)
              const sign = sagitta > 0 ? 1 : -1;
              const nx = -t.ty * sign;
              const ny = t.tx * sign;
              const wx = midX + (lx * cosA - (ly + bandOffset * sign) * sinA) + (-nx * sinA) * 0;
              const wy = midY + (lx * sinA + (ly + bandOffset * sign) * cosA) + (ny * cosA) * 0;
              // Simpler: just offset ly by bandOffset in the sagitta direction
              const oLy = ly + bandOffset * sign;
              const ox = midX + lx * cosA - oLy * sinA;
              const oy = midY + lx * sinA + oLy * cosA;
              if (i === 0) context.moveTo(ox, oy);
              else context.lineTo(ox, oy);
            }

            // Inner edge (offset inward, reverse direction)
            for (let i = numSamples; i >= 0; i--) {
              const lx = -halfChord + (chord * i) / numSamples;
              const ly = parabolaY(lx, sagitta, chord);
              const sign = sagitta > 0 ? 1 : -1;
              const iLy = ly - bandOffset * sign;
              const ix = midX + lx * cosA - iLy * sinA;
              const iy = midY + lx * sinA + iLy * cosA;
              context.lineTo(ix, iy);
            }

            context.closePath();
            context.fillStrokeShape(shape);
          },
          fill: 'rgba(66, 133, 244, 0.08)',
          listening: false,
        });
        this.layer.add(shadow);
        shadow.moveToBottom();
        this.rowShadows.set(rowId, shadow);
      } else {
        // Straight shadow: rect
        const midX = (firstPos.x + lastPos.x) / 2;
        const midY = (firstPos.y + lastPos.y) / 2;
        const rowLen = distance(firstPos, lastPos);
        const shadowWidth = rowLen + 2 * seatRadius + 8;
        const shadowHeight = 2 * seatRadius + 10;
        const angleDeg = angleBetween(firstPos, lastPos) * (180 / Math.PI);

        const shadow = new Konva.Rect({
          x: midX,
          y: midY,
          width: shadowWidth,
          height: shadowHeight,
          offsetX: shadowWidth / 2,
          offsetY: shadowHeight / 2,
          rotation: angleDeg,
          fill: 'rgba(66, 133, 244, 0.08)',
          cornerRadius: 6,
          listening: false,
        });
        this.layer.add(shadow);
        shadow.moveToBottom();
        this.rowShadows.set(rowId, shadow);
      }
    }
    } // end if (!isEditingRow)

    // 4. Apply selection visuals to each selected element
    for (const id of selectedIds) {
      const el = engine.state.get(id);
      const node = elementLayer.getNode(id);
      if (!el || !node) continue;

      switch (el.type) {
        case 'seat':
          applySeatSelection(node);
          break;
        case 'area':
          applyAreaSelection(node);
          break;
        case 'table':
          applyTableSelection(node);
          break;
        case 'row': {
          const row = el as Row;
          for (const seatId of row.seatIds) {
            const seatNode = elementLayer.getNode(seatId);
            if (seatNode) {
              applySeatSelection(seatNode);
            }
          }
          node.opacity(0.85);
          break;
        }
      }
    }

    // 5. Show extension handles and curve handle if exactly one row is selected
    if (selectedRowIds.size === 1 && !isSeatPicker) {
      const rowId = selectedRowIds.values().next().value as ElementId;
      const row = engine.state.get(rowId);
      if (row && isRow(row) && row.seatIds.length >= 1) {
        this.showHandles(row, engine);
        if (row.seatIds.length >= 2) {
          this.showCurveHandle(row, engine);
        }
      }
    }

    // 6. Show rotation handle for single element selection
    if (selectedIds.length >= 1 && !isSeatPicker) {
      // Find the "primary" element (skip seats that belong to rows if a row is also selected)
      let primaryEl = engine.state.get(selectedIds[0]);
      if (primaryEl && isSeat(primaryEl) && primaryEl.rowId && selectedRowIds.size === 1) {
        primaryEl = engine.state.get(selectedRowIds.values().next().value as ElementId);
      }
      if (primaryEl) {
        this.showRotationHandle(primaryEl, engine);
      }
    }

    // 6b. Show resize handles if exactly one area is selected
    if (selectedIds.length === 1 && !isSeatPicker) {
      const singleEl = engine.state.get(selectedIds[0]);
      if (singleEl && isArea(singleEl)) {
        this.showResizeHandles(singleEl as Area);
      }
    }

    // 7. Multi-selection bounding box (hide during rotation)
    if (selectedIds.length > 1 && toolState !== 'rotating') {
      if (!this.groupBoundingBox) {
        this.groupBoundingBox = new Konva.Rect({
          stroke: 'rgba(120, 120, 120, 0.35)',
          strokeWidth: 0.75,
          fill: 'transparent',
          cornerRadius: 2,
          listening: false,
        });
        this.layer.add(this.groupBoundingBox);
      }

      // Check if selection is a single row (straight or curved)
      let usedRotatedBox = false;
      if (selectedRowIds.size === 1 && !isSeatPicker) {
        const rowId = selectedRowIds.values().next().value as ElementId;
        const row = engine.state.get(rowId);
        if (row && isRow(row) && row.seatIds.length >= 2) {
          // Collect all seat positions and radius
          const seatPositions: { x: number; y: number }[] = [];
          let seatRadius = 0;
          let allValid = true;
          for (const seatId of row.seatIds) {
            const seat = engine.state.get(seatId);
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

            // Rotate all seats into local frame and compute AABB
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

            const padding = 6;
            const boxWidth = (maxLx - minLx) + 2 * seatRadius + padding * 2;
            const boxHeight = (maxLy - minLy) + 2 * seatRadius + padding * 2;
            const angleDeg = angle * (180 / Math.PI);

            // Center of local AABB (relative to centroid)
            const localCenterX = (minLx + maxLx) / 2;
            const localCenterY = (minLy + maxLy) / 2;

            // Rotate back to world space
            const cosB = Math.cos(angle);
            const sinB = Math.sin(angle);
            const worldCenterX = cx + localCenterX * cosB - localCenterY * sinB;
            const worldCenterY = cy + localCenterX * sinB + localCenterY * cosB;

            this.groupBoundingBox.x(worldCenterX);
            this.groupBoundingBox.y(worldCenterY);
            this.groupBoundingBox.width(boxWidth);
            this.groupBoundingBox.height(boxHeight);
            this.groupBoundingBox.offsetX(boxWidth / 2);
            this.groupBoundingBox.offsetY(boxHeight / 2);
            this.groupBoundingBox.rotation(angleDeg);
            this.groupBoundingBox.visible(true);
            usedRotatedBox = true;
          }
        }
      }

      if (!usedRotatedBox) {
        // AABB fallback for multi-element or curved-row selections
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const id of selectedIds) {
          const el = engine.state.get(id);
          if (!el) continue;
          minX = Math.min(minX, el.bounds.x);
          minY = Math.min(minY, el.bounds.y);
          maxX = Math.max(maxX, el.bounds.x + el.bounds.width);
          maxY = Math.max(maxY, el.bounds.y + el.bounds.height);
        }
        const padding = 6;
        this.groupBoundingBox.x(minX - padding);
        this.groupBoundingBox.y(minY - padding);
        this.groupBoundingBox.width(maxX - minX + padding * 2);
        this.groupBoundingBox.height(maxY - minY + padding * 2);
        // Reset rotation/offset for AABB mode
        this.groupBoundingBox.offsetX(0);
        this.groupBoundingBox.offsetY(0);
        this.groupBoundingBox.rotation(0);
        this.groupBoundingBox.visible(true);
      }
    } else {
      if (this.groupBoundingBox) {
        this.groupBoundingBox.visible(false);
      }
    }

    this.previousSelectedIds = [...selectedIds];
    this.layer.batchDraw();
  }

  private showHandles(row: Row, engine: EditorEngine): void {
    const firstSeat = engine.state.get(row.seatIds[0]);
    const lastSeat = engine.state.get(row.seatIds[row.seatIds.length - 1]);
    if (!firstSeat || !lastSeat || !isSeat(firstSeat) || !isSeat(lastSeat)) return;

    const firstPos = firstSeat.transform.position;
    const lastPos = lastSeat.transform.position;
    const offset = firstSeat.radius + 6;

    let leftPos: Point;
    let rightPos: Point;

    const chord = distance(firstPos, lastPos);
    if (row.seatIds.length >= 2 && !isRowCurvatureEffectivelyStraight(row.curveRadius ?? 0, chord)) {
      // Curved row: position handles along parabola tangent at endpoints
      const sagitta = row.curveRadius ?? 0;
      const halfChord = chord / 2;
      const angle = angleBetween(firstPos, lastPos);
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Left tangent at -chord/2
      const tLeft = parabolaTangentLocal(-halfChord, sagitta, chord);
      const leftDirX = -(tLeft.tx * cosA - tLeft.ty * sinA);
      const leftDirY = -(tLeft.tx * sinA + tLeft.ty * cosA);
      const leftLen = Math.sqrt(leftDirX * leftDirX + leftDirY * leftDirY);
      leftPos = {
        x: firstPos.x + (leftDirX / leftLen) * offset,
        y: firstPos.y + (leftDirY / leftLen) * offset,
      };

      // Right tangent at +chord/2
      const tRight = parabolaTangentLocal(halfChord, sagitta, chord);
      const rightDirX = tRight.tx * cosA - tRight.ty * sinA;
      const rightDirY = tRight.tx * sinA + tRight.ty * cosA;
      const rightLen = Math.sqrt(rightDirX * rightDirX + rightDirY * rightDirY);
      rightPos = {
        x: lastPos.x + (rightDirX / rightLen) * offset,
        y: lastPos.y + (rightDirY / rightLen) * offset,
      };
    } else {
      // Straight row: use orientationAngle
      const angle = row.orientationAngle;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);
      leftPos = {
        x: firstPos.x - dirX * offset,
        y: firstPos.y - dirY * offset,
      };
      rightPos = {
        x: lastPos.x + dirX * offset,
        y: lastPos.y + dirY * offset,
      };
    }

    this.handlePositions = { left: leftPos, right: rightPos };

    this.leftHandle = new Konva.Circle({
      x: leftPos.x,
      y: leftPos.y,
      radius: 5,
      fill: 'rgba(66, 133, 244, 0.5)',
      stroke: 'rgba(66, 133, 244, 0.8)',
      strokeWidth: 1.5,
      listening: true,
    });
    this.leftHandle.on('mouseenter', () => {
      document.body.style.cursor = 'pointer';
    });
    this.leftHandle.on('mouseleave', () => {
      document.body.style.cursor = 'default';
    });

    this.rightHandle = new Konva.Circle({
      x: rightPos.x,
      y: rightPos.y,
      radius: 5,
      fill: 'rgba(66, 133, 244, 0.5)',
      stroke: 'rgba(66, 133, 244, 0.8)',
      strokeWidth: 1.5,
      listening: true,
    });
    this.rightHandle.on('mouseenter', () => {
      document.body.style.cursor = 'pointer';
    });
    this.rightHandle.on('mouseleave', () => {
      document.body.style.cursor = 'default';
    });

    this.layer.add(this.leftHandle);
    this.layer.add(this.rightHandle);
  }

  private clearHandles(): void {
    if (this.leftHandle) {
      this.leftHandle.destroy();
      this.leftHandle = null;
    }
    if (this.rightHandle) {
      this.rightHandle.destroy();
      this.rightHandle = null;
    }
    this.handlePositions = null;
    this.clearCurveHandle();
    this.clearRotationHandle();
    this.clearResizeHandles();
  }

  private clearCurveHandle(): void {
    if (this.curveHandle) {
      this.curveHandle.destroy();
      this.curveHandle = null;
    }
    this.curveHandlePosition = null;
  }

  private showCurveHandle(row: Row, engine: EditorEngine): void {
    const firstSeat = engine.state.get(row.seatIds[0]);
    const lastSeat = engine.state.get(row.seatIds[row.seatIds.length - 1]);
    if (!firstSeat || !lastSeat || !isSeat(firstSeat) || !isSeat(lastSeat)) return;

    const firstPos = firstSeat.transform.position;
    const lastPos = lastSeat.transform.position;
    const midX = (firstPos.x + lastPos.x) / 2;
    const midY = (firstPos.y + lastPos.y) / 2;

    // Perpendicular direction (90 degrees from row orientation)
    const angle = row.orientationAngle;
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);

    // Offset by current curve amount (use curveRadius as visual offset)
    const curveOffset = row.curveRadius || 0;
    // Clamp handle position to match curve limits
    const chord = distance(firstPos, lastPos);
    const maxSagitta = (chord / 2) * 0.75;
    const clampedOffset = Math.max(-maxSagitta, Math.min(maxSagitta, curveOffset));
    const handlePos: Point = {
      x: midX + perpX * clampedOffset,
      y: midY + perpY * clampedOffset,
    };

    // If no curve yet, show handle slightly offset so it's visible
    const displayPos: Point = clampedOffset === 0
      ? { x: midX + perpX * 20, y: midY + perpY * 20 }
      : handlePos;

    this.curveHandlePosition = displayPos;

    this.curveHandle = new Konva.Circle({
      x: displayPos.x,
      y: displayPos.y,
      radius: 6,
      fill: 'rgba(255, 152, 0, 0.5)',
      stroke: 'rgba(255, 152, 0, 0.9)',
      strokeWidth: 1.5,
      listening: true,
    });
    this.curveHandle.on('mouseenter', () => {
      document.body.style.cursor = 'grab';
    });
    this.curveHandle.on('mouseleave', () => {
      document.body.style.cursor = 'default';
    });

    this.layer.add(this.curveHandle);
  }

  getCurveHandlePosition(): Point | null {
    return this.curveHandlePosition;
  }

  getRowHandlePositions(): { left: Point; right: Point } | null {
    return this.handlePositions;
  }

  getRotationHandlePosition(): Point | null {
    return this.rotationHandlePosition;
  }

  private showRotationHandle(element: import('@/src/domain/types').MapElement, _engine: EditorEngine): void {
    const centerX = element.transform.position.x;
    const centerY = element.transform.position.y;
    const rotation = element.transform.rotation;

    const halfHeight = element.bounds.height / 2;
    const handleOffset = 25;

    // Rotate offset vectors by the element's current rotation
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    // Handle point (0, -(halfHeight + handleOffset)) rotated
    const fullOffset = -(halfHeight + handleOffset);
    const handleX = centerX - fullOffset * sin;
    const handleY = centerY + fullOffset * cos;

    this.rotationHandlePosition = { x: handleX, y: handleY };

    this.rotationHandle = new Konva.Circle({
      x: handleX,
      y: handleY,
      radius: 6,
      fill: 'rgba(76, 175, 80, 0.6)',
      stroke: 'rgba(76, 175, 80, 1)',
      strokeWidth: 1.5,
      listening: true,
    });
    this.rotationHandle.on('mouseenter', () => {
      document.body.style.cursor = 'crosshair';
    });
    this.rotationHandle.on('mouseleave', () => {
      document.body.style.cursor = 'default';
    });

    this.layer.add(this.rotationHandle);
  }

  private clearRotationHandle(): void {
    if (this.rotationHandle) {
      this.rotationHandle.destroy();
      this.rotationHandle = null;
    }
    this.rotationHandlePosition = null;
  }

  private showResizeHandles(area: Area): void {
    const b = area.bounds;
    const cx = area.transform.position.x;
    const cy = area.transform.position.y;
    const halfW = b.width / 2;
    const halfH = b.height / 2;
    const rot = area.transform.rotation;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    const rotateAroundCenter = (lx: number, ly: number) => ({
      x: cx + lx * cosR - ly * sinR,
      y: cy + lx * sinR + ly * cosR,
    });

    const localCorners = [
      { corner: 'tl', lx: -halfW, ly: -halfH, cursor: 'nwse-resize' },
      { corner: 'tr', lx: halfW, ly: -halfH, cursor: 'nesw-resize' },
      { corner: 'bl', lx: -halfW, ly: halfH, cursor: 'nesw-resize' },
      { corner: 'br', lx: halfW, ly: halfH, cursor: 'nwse-resize' },
    ];

    const corners = localCorners.map(c => {
      const rp = rotateAroundCenter(c.lx, c.ly);
      return { corner: c.corner, x: rp.x, y: rp.y, cursor: c.cursor };
    });

    this.resizeHandlePositions = corners.map(c => ({
      corner: c.corner,
      position: { x: c.x, y: c.y },
    }));

    for (const c of corners) {
      const handle = new Konva.Rect({
        x: c.x - 3,
        y: c.y - 3,
        width: 6,
        height: 6,
        fill: 'white',
        stroke: '#1A73E8',
        strokeWidth: 1.5,
        listening: true,
      });
      handle.setAttr('corner', c.corner);
      const cursorStyle = c.cursor;
      handle.on('mouseenter', () => {
        document.body.style.cursor = cursorStyle;
      });
      handle.on('mouseleave', () => {
        document.body.style.cursor = 'default';
      });
      this.layer.add(handle);
      this.resizeHandles.push(handle);
    }
  }

  private clearResizeHandles(): void {
    for (const handle of this.resizeHandles) {
      handle.destroy();
    }
    this.resizeHandles = [];
    this.resizeHandlePositions = null;
  }

  getResizeHandlePositions(): { corner: string; position: Point }[] | null {
    return this.resizeHandlePositions;
  }

  showBoxSelect(x: number, y: number, width: number, height: number): void {
    if (!this.boxSelectRect) {
      this.boxSelectRect = new Konva.Rect({
        stroke: 'rgba(100, 100, 100, 0.35)',
        strokeWidth: 0.5,
        fill: 'rgba(100, 100, 100, 0.04)',
        listening: false,
      });
      this.layer.add(this.boxSelectRect);
    }
    this.boxSelectRect.x(x);
    this.boxSelectRect.y(y);
    this.boxSelectRect.width(width);
    this.boxSelectRect.height(height);
    this.boxSelectRect.visible(true);
    this.layer.batchDraw();
  }

  hideBoxSelect(): void {
    if (this.boxSelectRect) {
      this.boxSelectRect.visible(false);
      this.layer.batchDraw();
    }
  }

  clear(): void {
    if (this.groupBoundingBox) {
      this.groupBoundingBox.destroy();
      this.groupBoundingBox = null;
    }
    for (const shadow of this.rowShadows.values()) {
      shadow.destroy();
    }
    this.rowShadows.clear();
    this.clearHandles();
    this.previousSelectedIds = [];
    this.hideBoxSelect();
    this.layer.batchDraw();
  }
}
