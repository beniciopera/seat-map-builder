import type { Command } from './Command';
import type { ElementId, Table, Seat, MapElement } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';
import { generateElementId } from '@/src/domain/ids';
import { DEFAULT_TRANSFORM } from '@/src/domain/geometry';
import { DEFAULT_SEAT_RADIUS, DEFAULT_TABLE_SEAT_GAP } from '@/src/domain/constraints';
import { propagateRowLabel } from '@/src/domain/labels';

export class ChangeTableSeatCountCommand implements Command {
  readonly name = 'Change Table Seat Count';
  private engine: EditorEngine;
  private tableId: ElementId;
  private newSeatCount: number;

  // Snapshots for undo
  private oldTable: Table;
  private oldSeats: Seat[];
  private addedSeatIds: ElementId[] = [];
  private removedSeats: Seat[] = [];

  constructor(engine: EditorEngine, tableId: ElementId, newSeatCount: number) {
    this.engine = engine;
    this.tableId = tableId;
    this.newSeatCount = newSeatCount;

    // Snapshot current state
    this.oldTable = { ...engine.state.get(tableId) } as Table;
    this.oldSeats = this.oldTable.seatIds.map(
      (id) => ({ ...engine.state.get(id) }) as Seat,
    );
  }

  execute(): void {
    const table = this.engine.state.get(this.tableId) as Table | undefined;
    if (!table) return;

    const currentCount = table.seatIds.length;
    const delta = this.newSeatCount - currentCount;

    let seatIds = [...table.seatIds];
    const tableCenter = table.transform.position;
    const seatRadius = this.oldSeats.length > 0 ? this.oldSeats[0].radius : DEFAULT_SEAT_RADIUS;
    const seatDistFromCenter = table.tableRadius + seatRadius + DEFAULT_TABLE_SEAT_GAP;

    if (delta > 0) {
      // Add new seats
      const newSeats: Seat[] = [];
      for (let i = 0; i < delta; i++) {
        const id = generateElementId();
        this.addedSeatIds.push(id);
        seatIds.push(id);
        // Temporary position — will be repositioned below
        const seat: Seat = {
          id,
          type: 'seat',
          label: '',
          rowId: null,
          tableId: this.tableId,
          status: 'available',
          category: table.category || 'planta1',
          radius: seatRadius,
          locked: false,
          visible: true,
          transform: { ...DEFAULT_TRANSFORM, position: { x: 0, y: 0 } },
          bounds: { x: 0, y: 0, width: seatRadius * 2, height: seatRadius * 2 },
        };
        newSeats.push(seat);
      }
      this.engine.addElements(newSeats);
    } else if (delta < 0) {
      // Remove excess seats from the end
      const toRemove = seatIds.splice(this.newSeatCount);
      this.removedSeats = toRemove.map(
        (id) => ({ ...this.engine.state.get(id) }) as Seat,
      );
      this.engine.removeElements(toRemove);
    }

    // Reposition ALL seats in circular layout
    const updated: MapElement[] = [];
    for (let i = 0; i < seatIds.length; i++) {
      const angle = (2 * Math.PI * i) / this.newSeatCount;
      const seatPos = {
        x: tableCenter.x + Math.cos(angle) * seatDistFromCenter,
        y: tableCenter.y + Math.sin(angle) * seatDistFromCenter,
      };
      const seat = this.engine.state.get(seatIds[i]) as Seat | undefined;
      if (!seat) continue;
      const merged: Seat = {
        ...seat,
        transform: { ...seat.transform, position: seatPos },
        bounds: {
          x: seatPos.x - seat.radius,
          y: seatPos.y - seat.radius,
          width: seat.radius * 2,
          height: seat.radius * 2,
        },
      };
      this.engine.state.set(merged.id, merged);
      this.engine.spatialIndex.update(merged);
      updated.push(merged);
    }

    // Regenerate seat labels
    const newLabels = propagateRowLabel(table.label, this.newSeatCount);
    for (let i = 0; i < seatIds.length; i++) {
      const seat = this.engine.state.get(seatIds[i]) as Seat | undefined;
      if (!seat) continue;
      const labeled: Seat = { ...seat, label: newLabels[i] };
      this.engine.state.set(labeled.id, labeled);
      this.engine.spatialIndex.update(labeled);
      // Update in our updated array
      const idx = updated.findIndex((u) => u.id === labeled.id);
      if (idx >= 0) updated[idx] = labeled;
      else updated.push(labeled);
    }

    // Update the table record
    const updatedTable: Table = {
      ...table,
      seatCount: this.newSeatCount,
      seatIds,
    };
    this.engine.state.set(this.tableId, updatedTable);
    this.engine.spatialIndex.update(updatedTable);
    updated.push(updatedTable);

    this.engine.events.emit('elements:updated', { elements: updated });
    this.engine.events.emit('render:request', {});

    // Re-sync selection to include updated seat IDs
    const currentSelection = this.engine.selection.getSelectedIds();
    if (currentSelection.includes(this.tableId)) {
      const newSelection = new Set(currentSelection);
      // Remove old seats that were deleted
      for (const s of this.removedSeats) newSelection.delete(s.id);
      // Add new seats
      for (const id of this.addedSeatIds) newSelection.add(id);
      this.engine.selection.selectMultiple(Array.from(newSelection));
      this.engine.events.emit('selection:changed', {
        selectedIds: this.engine.selection.getSelectedIds(),
      });
    }
  }

  undo(): void {
    // Remove any seats that were added
    if (this.addedSeatIds.length > 0) {
      this.engine.removeElements(this.addedSeatIds);
    }

    // Re-add any seats that were removed
    if (this.removedSeats.length > 0) {
      this.engine.addElements(this.removedSeats);
    }

    // Restore all original seats
    for (const seat of this.oldSeats) {
      this.engine.state.set(seat.id, seat);
      this.engine.spatialIndex.update(seat);
    }

    // Restore original table
    this.engine.state.set(this.tableId, this.oldTable);
    this.engine.spatialIndex.update(this.oldTable);

    const allRestored: MapElement[] = [this.oldTable, ...this.oldSeats];
    this.engine.events.emit('elements:updated', { elements: allRestored });
    this.engine.events.emit('render:request', {});

    // Re-sync selection
    const currentSelection = this.engine.selection.getSelectedIds();
    if (currentSelection.includes(this.tableId)) {
      const newSelection = new Set(currentSelection);
      for (const id of this.addedSeatIds) newSelection.delete(id);
      for (const s of this.oldSeats) newSelection.add(s.id);
      this.engine.selection.selectMultiple(Array.from(newSelection));
      this.engine.events.emit('selection:changed', {
        selectedIds: this.engine.selection.getSelectedIds(),
      });
    }
  }
}
