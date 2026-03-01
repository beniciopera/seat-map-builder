import type { ElementId, Seat, Row, MapElement } from '@/src/domain/types';
import type { Point } from '@/src/domain/geometry';
import type { EditorEngine } from '../EditorEngine';
import { generateElementId } from '@/src/domain/ids';
import { rowLabelFromIndex, propagateRowLabel } from '@/src/domain/labels';
import { angleBetween, distance } from '@/src/utils/math';
import { DEFAULT_TRANSFORM } from '@/src/domain/geometry';

export class RowGroupingSystem {
  private engine: EditorEngine;
  private rowCounter = 0;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  detectRow(seatPositions: Point[], seatIds: ElementId[], overrideLabel?: string): Row | null {
    if (seatPositions.length < 2) return null;

    const first = seatPositions[0];
    const last = seatPositions[seatPositions.length - 1];
    const orientationAngle = angleBetween(first, last);
    const spacing = seatPositions.length > 1
      ? distance(seatPositions[0], seatPositions[1])
      : 40;

    let label: string;
    if (overrideLabel !== undefined) {
      label = overrideLabel;
    } else {
      const result = this.engine.nextAvailableRowLabel(0);
      label = result.label;
      this.rowCounter = result.index + 1;
    }

    // Compute bounding rect for the row
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of seatPositions) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const row: Row = {
      id: generateElementId(),
      type: 'row',
      label,
      seatIds,
      orientationAngle,
      spacing,
      seatOrderDirection: 'left-to-right',
      curveRadius: 0,
      curveDefinition: null,
      category: 'planta1',
      areaId: null,
      locked: false,
      visible: true,
      transform: {
        ...DEFAULT_TRANSFORM,
        position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
        rotation: orientationAngle,
      },
      bounds: {
        x: minX,
        y: minY,
        width: maxX - minX || 1,
        height: maxY - minY || 1,
      },
    };

    return row;
  }

  propagateLabel(rowId: ElementId, newLabel: string): Seat[] {
    const row = this.engine.state.get(rowId);
    if (!row || row.type !== 'row') return [];

    const oldLabel = (row as Row).label;

    // Update row label
    this.engine.state.set(rowId, { ...row, label: newLabel });

    // Renumber the new label group; the changed row goes last
    const updatedSeats = this.renumberLabelGroup(newLabel, rowId);

    // If old label was different, renumber that group too
    if (oldLabel !== newLabel && oldLabel) {
      const oldGroupSeats = this.renumberLabelGroup(oldLabel);
      updatedSeats.push(...oldGroupSeats);
    }

    return updatedSeats;
  }

  /**
   * Find all rows sharing the given label, order them, and renumber all their
   * seats with continuous numbering. When changedRowId is provided, that row is
   * placed last so existing rows keep their numbering and the newcomer continues.
   * seatOrderDirection is NOT used here — it only affects row label position.
   */
  renumberLabelGroup(label: string, changedRowId?: ElementId): Seat[] {
    const rows = this.getRowsByLabel(label, changedRowId);
    if (rows.length === 0) return [];

    const updatedSeats: Seat[] = [];
    let seatIndex = 0;

    for (const row of rows) {
      const labels = propagateRowLabel(label, row.seatIds.length, seatIndex);

      for (let i = 0; i < row.seatIds.length; i++) {
        const seat = this.engine.state.get(row.seatIds[i]);
        if (seat && seat.type === 'seat') {
          const updated: Seat = { ...seat, label: labels[i] };
          this.engine.state.set(seat.id, updated);
          this.engine.spatialIndex.update(updated);
          updatedSeats.push(updated);
        }
      }
      seatIndex += row.seatIds.length;
    }

    return updatedSeats;
  }

  /**
   * Get all rows with a given label, sorted spatially (top-to-bottom, left-to-right).
   * If changedRowId is provided, that row is moved to the end of the list.
   */
  private getRowsByLabel(label: string, changedRowId?: ElementId): Row[] {
    const rows: Row[] = [];
    for (const el of this.engine.state.getAll()) {
      if (el.type === 'row' && (el as Row).label === label) {
        rows.push(el as Row);
      }
    }

    rows.sort((a, b) => {
      if (changedRowId) {
        if (a.id === changedRowId && b.id !== changedRowId) return 1;
        if (b.id === changedRowId && a.id !== changedRowId) return -1;
      }
      const dy = a.transform.position.y - b.transform.position.y;
      if (Math.abs(dy) > 1) return dy;
      return a.transform.position.x - b.transform.position.x;
    });

    return rows;
  }

  reorderSeats(row: Row): ElementId[] {
    if (row.seatOrderDirection === 'right-to-left') {
      return [...row.seatIds].reverse();
    }
    return [...row.seatIds];
  }
}
