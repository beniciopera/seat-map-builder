import type { Point } from '@/src/domain/geometry';
import type { Seat, Row } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { generateElementId } from '@/src/domain/ids';
import { DEFAULT_SEAT_RADIUS, DEFAULT_SEAT_SPACING } from '@/src/domain/constraints';
import { DEFAULT_TRANSFORM } from '@/src/domain/geometry';
import { PlaceSeatsCommand } from '../commands/PlaceSeatsCommand';
import { PlaceGridCommand } from '../commands/PlaceGridCommand';

export class PlacementSystem {
  private engine: EditorEngine;
  private standaloneSeatCounter = 0;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  placeSeats(positions: Point[]): void {
    if (positions.length === 0) return;

    const radius = DEFAULT_SEAT_RADIUS;
    const seats: Seat[] = positions.map((pos) => ({
      id: generateElementId(),
      type: 'seat' as const,
      label: '',
      rowId: null,
      tableId: null,
      category: 'planta1' as const,
      radius,
      locked: false,
      visible: true,
      transform: {
        ...DEFAULT_TRANSFORM,
        position: pos,
      },
      bounds: {
        x: pos.x - radius,
        y: pos.y - radius,
        width: radius * 2,
        height: radius * 2,
      },
    }));

    // Auto-detect row
    const seatIds = seats.map(s => s.id);
    const row = this.engine.rowGrouping.detectRow(positions, seatIds);

    if (row) {
      // Assign row labels and status to seats (row seats have status)
      const rowLabel = row.label;
      for (let i = 0; i < seats.length; i++) {
        (seats[i] as { label: string }).label = `${rowLabel}-${i + 1}`;
        (seats[i] as { rowId: typeof row.id }).rowId = row.id;
        (seats[i] as { status: 'available' }).status = 'available';
      }
    } else {
      for (let i = 0; i < seats.length; i++) {
        const { label: sLabel, counter } = this.engine.nextAvailableStandaloneSeatLabel(1);
        this.standaloneSeatCounter = counter;
        (seats[i] as { label: string }).label = sLabel;
      }
    }

    const cmd = new PlaceSeatsCommand(this.engine, seats, row ?? undefined);
    this.engine.history.execute(cmd);
  }

  placeGrid(rowPositions: Point[][]): void {
    if (rowPositions.length === 0) return;

    const radius = DEFAULT_SEAT_RADIUS;
    const allRows: Row[] = [];
    const allSeats: Seat[] = [];

    for (const positions of rowPositions) {
      if (positions.length === 0) continue;

      const seats: Seat[] = positions.map((pos) => ({
        id: generateElementId(),
        type: 'seat' as const,
        label: '',
        rowId: null,
        tableId: null,
        category: 'planta1' as const,
        radius,
        locked: false,
        visible: true,
        transform: {
          ...DEFAULT_TRANSFORM,
          position: pos,
        },
        bounds: {
          x: pos.x - radius,
          y: pos.y - radius,
          width: radius * 2,
          height: radius * 2,
        },
      }));

      const seatIds = seats.map(s => s.id);
      const row = this.engine.rowGrouping.detectRow(positions, seatIds);

      if (row) {
        const rowLabel = row.label;
        for (let i = 0; i < seats.length; i++) {
          (seats[i] as { label: string }).label = `${rowLabel}-${i + 1}`;
          (seats[i] as { rowId: typeof row.id }).rowId = row.id;
          (seats[i] as { status: 'available' }).status = 'available';
        }
        allRows.push(row);
      }

      allSeats.push(...seats);
    }

    const cmd = new PlaceGridCommand(this.engine, allRows, allSeats);
    this.engine.history.execute(cmd);
  }

  getDefaultSpacing(): number {
    return DEFAULT_SEAT_SPACING;
  }
}
