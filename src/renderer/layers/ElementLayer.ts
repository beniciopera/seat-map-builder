import Konva from 'konva';
import type { EditorEngine } from '@/src/engine/EditorEngine';
import type { MapElement, ElementId, Row, Seat } from '@/src/domain/types';
import { createSeatShape, updateSeatShape } from '../shapes/SeatShape';
import { createRowShape, updateRowShape } from '../shapes/RowShape';
import type { RowLabelInfo } from '../shapes/RowShape';
import { createAreaShape, updateAreaShape } from '../shapes/AreaShape';
import { createTableShape, updateTableShape } from '../shapes/TableShape';
import { seatNumberFromLabel, seatDisplayLabel } from '@/src/domain/labels';

export class ElementLayer {
  readonly layer: Konva.Layer;
  private nodeMap = new Map<ElementId, Konva.Group>();
  private elementGetter: ((id: ElementId) => MapElement | undefined) | null = null;

  constructor() {
    this.layer = new Konva.Layer({ name: 'elements' });
  }

  setElementGetter(getter: (id: ElementId) => MapElement | undefined): void {
    this.elementGetter = getter;
  }

  /**
   * For a seat in a row: when row is right-to-left, return the display number from the
   * opposite end so seat labels appear in reverse order (10…1). Otherwise undefined = use actual label.
   */
  private getSeatDisplayLabel(seat: Seat, row: Row): string | undefined {
    if ((row.seatOrderDirection ?? 'left-to-right') !== 'right-to-left') return undefined;
    const idx = row.seatIds.indexOf(seat.id);
    if (idx < 0) return undefined;
    const oppositeIdx = row.seatIds.length - 1 - idx;
    const oppositeSeat = this.elementGetter?.(row.seatIds[oppositeIdx]) as Seat | undefined;
    if (!oppositeSeat || oppositeSeat.type !== 'seat') return undefined;
    return seatDisplayLabel(oppositeSeat.label);
  }

  private buildRowLabelInfo(row: Row): RowLabelInfo | undefined {
    if (!this.elementGetter || row.seatIds.length === 0) return undefined;

    // Collect seats with their parsed numeric labels
    const seats: { seat: Seat; num: number }[] = [];
    for (const sid of row.seatIds) {
      const s = this.elementGetter(sid) as Seat | undefined;
      if (!s || s.type !== 'seat') continue;
      const num = seatNumberFromLabel(s.label);
      if (num !== null) seats.push({ seat: s, num });
    }

    if (seats.length === 0) {
      // Fallback when no parseable seat numbers: use first/last by array index based on direction
      const direction = row.seatOrderDirection ?? 'left-to-right';
      const index = direction === 'right-to-left' ? row.seatIds.length - 1 : 0;
      const fallback = this.elementGetter(row.seatIds[index]) as Seat | undefined;
      if (!fallback || fallback.type !== 'seat') return undefined;
      return { firstSeatPos: fallback.transform.position, lastSeatPos: null, seatRadius: fallback.radius };
    }

    let minEntry = seats[0];
    let maxEntry = seats[0];
    for (const entry of seats) {
      if (entry.num < minEntry.num) minEntry = entry;
      if (entry.num > maxEntry.num) maxEntry = entry;
    }

    // left-to-right: label next to min number; right-to-left: label next to max number
    const direction = row.seatOrderDirection ?? 'left-to-right';
    const labelSeat = direction === 'right-to-left' ? maxEntry : minEntry;
    const farSeat = direction === 'right-to-left' ? minEntry : maxEntry;

    return {
      firstSeatPos: labelSeat.seat.transform.position,
      lastSeatPos: seats.length >= 2 ? farSeat.seat.transform.position : null,
      seatRadius: labelSeat.seat.radius,
    };
  }

  addElements(elements: MapElement[]): void {
    for (const el of elements) {
      if (this.nodeMap.has(el.id)) continue;

      let group: Konva.Group;
      switch (el.type) {
        case 'seat': {
          const seat = el as Seat;
          let displayLabel: string | undefined;
          if (seat.rowId && this.elementGetter) {
            const row = this.elementGetter(seat.rowId) as Row | undefined;
            if (row?.type === 'row') displayLabel = this.getSeatDisplayLabel(seat, row);
          }
          group = createSeatShape(seat, displayLabel);
          break;
        }
        case 'row':
          group = createRowShape(el, this.buildRowLabelInfo(el));
          break;
        case 'area':
          group = createAreaShape(el);
          break;
        case 'table':
          group = createTableShape(el);
          break;
      }

      this.nodeMap.set(el.id, group);

      // Areas go behind everything
      if (el.type === 'area') {
        this.layer.add(group);
        group.moveToBottom();
      } else {
        this.layer.add(group);
      }
    }
    this.layer.batchDraw();
  }

  removeElements(ids: ElementId[]): void {
    for (const id of ids) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.destroy();
        this.nodeMap.delete(id);
      }
    }
    this.layer.batchDraw();
  }

  updateElements(elements: MapElement[]): void {
    for (const el of elements) {
      const group = this.nodeMap.get(el.id);
      if (!group) continue;

      switch (el.type) {
        case 'seat': {
          const seat = el as Seat;
          let displayLabel: string | undefined;
          if (seat.rowId && this.elementGetter) {
            const row = (this.elementGetter(seat.rowId) ?? null) as Row | undefined;
            if (row?.type === 'row') displayLabel = this.getSeatDisplayLabel(seat, row);
          }
          updateSeatShape(group, seat, displayLabel);
          break;
        }
        case 'row': {
          // Use engine state so we always have latest seatOrderDirection and seat data
          const row = (this.elementGetter?.(el.id) ?? el) as Row;
          updateRowShape(group, row, this.buildRowLabelInfo(row));
          // Update seat display labels so they show in the chosen order (1…10 or 10…1)
          for (const seatId of row.seatIds) {
            const seat = this.elementGetter?.(seatId) as Seat | undefined;
            const seatGroup = this.nodeMap.get(seatId);
            if (seat?.type === 'seat' && seatGroup) {
              const displayLabel = this.getSeatDisplayLabel(seat, row);
              updateSeatShape(seatGroup, seat, displayLabel);
            }
          }
          break;
        }
        case 'area':
          updateAreaShape(group, el);
          break;
        case 'table':
          updateTableShape(group, el);
          break;
      }
    }
    this.layer.batchDraw();
  }

  getNode(id: ElementId): Konva.Group | undefined {
    return this.nodeMap.get(id);
  }

  private dimmedIds = new Set<ElementId>();

  dimElements(ids: ElementId[]): void {
    // Restore previously dimmed first
    this.restoreDimmed();
    for (const id of ids) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.opacity(0.3);
        this.dimmedIds.add(id);
      }
    }
    this.layer.batchDraw();
  }

  restoreDimmed(): void {
    for (const id of this.dimmedIds) {
      const node = this.nodeMap.get(id);
      if (node) {
        node.opacity(1);
      }
    }
    this.dimmedIds.clear();
    this.layer.batchDraw();
  }

  syncWithEngine(engine: EditorEngine): void {
    // Full rebuild
    for (const node of this.nodeMap.values()) {
      node.destroy();
    }
    this.nodeMap.clear();
    this.addElements(engine.getAllElements());
  }
}
