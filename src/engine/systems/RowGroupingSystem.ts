import type { ElementId, Seat, Row } from '@/src/domain/types';
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

  detectRow(seatPositions: Point[], seatIds: ElementId[]): Row | null {
    if (seatPositions.length < 2) return null;

    const first = seatPositions[0];
    const last = seatPositions[seatPositions.length - 1];
    const orientationAngle = angleBetween(first, last);
    const spacing = seatPositions.length > 1
      ? distance(seatPositions[0], seatPositions[1])
      : 40;

    const label = rowLabelFromIndex(this.rowCounter++);

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
      category: 'planta1',
      price: 0,
      areaId: null,
      locked: false,
      visible: true,
      transform: {
        ...DEFAULT_TRANSFORM,
        position: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
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

    const newLabels = propagateRowLabel(newLabel, row.seatIds.length);
    const updatedSeats: Seat[] = [];

    row.seatIds.forEach((seatId, i) => {
      const seat = this.engine.state.get(seatId);
      if (seat && seat.type === 'seat') {
        const updated: Seat = { ...seat, label: newLabels[i] };
        this.engine.state.set(seatId, updated);
        updatedSeats.push(updated);
      }
    });

    // Update row label too
    this.engine.state.set(rowId, { ...row, label: newLabel });

    return updatedSeats;
  }

  reorderSeats(row: Row): ElementId[] {
    if (row.seatOrderDirection === 'right-to-left') {
      return [...row.seatIds].reverse();
    }
    return [...row.seatIds];
  }
}
