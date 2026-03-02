import type { Command } from './Command';
import type { ElementId, MapElement, Row, Seat } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export class DeleteElementsCommand implements Command {
  readonly name = 'Delete Elements';
  private engine: EditorEngine;
  private ids: ElementId[];
  private savedElements: MapElement[] = [];
  private affectedLabels: Set<string> = new Set();
  private beforeSeatsByLabel: Map<string, Seat[]> = new Map();

  constructor(engine: EditorEngine, ids: ElementId[]) {
    this.engine = engine;
    this.ids = ids;
  }

  execute(): void {
    this.savedElements = [];
    this.affectedLabels = new Set();
    this.beforeSeatsByLabel = new Map();

    for (const id of this.ids) {
      const el = this.engine.state.get(id);
      if (el) {
        this.savedElements.push(el);
        if (el.type === 'row') {
          this.affectedLabels.add((el as Row).label);
        }
      }
    }

    if (this.affectedLabels.size > 0) {
      this.snapshotSeatsByLabel();
    }

    this.engine.removeElements(this.ids);

    if (this.affectedLabels.size > 0) {
      this.renumberAffectedLabels();
    }
  }

  undo(): void {
    this.engine.addElements(this.savedElements);

    if (this.affectedLabels.size > 0) {
      this.restoreOriginalNumbering();
    }
  }

  private snapshotSeatsByLabel(): void {
    for (const label of this.affectedLabels) {
      const seats: Seat[] = [];
      for (const el of this.engine.state.getAll()) {
        if (el.type === 'row' && (el as Row).label === label) {
          for (const seatId of (el as Row).seatIds) {
            const seat = this.engine.state.get(seatId);
            if (seat && seat.type === 'seat') {
              seats.push({ ...seat } as Seat);
            }
          }
        }
      }
      this.beforeSeatsByLabel.set(label, seats);
    }
  }

  private renumberAffectedLabels(): void {
    const updatedElements: MapElement[] = [];

    for (const label of this.affectedLabels) {
      const hasRemainingRows = this.engine.state.getAll()
        .some(el => el.type === 'row' && (el as Row).label === label);
      if (!hasRemainingRows) continue;

      const updatedSeats = this.engine.rowGrouping.renumberLabelGroup(label);
      updatedElements.push(...updatedSeats);
    }

    if (updatedElements.length > 0) {
      this.engine.events.emit('elements:updated', { elements: updatedElements });
      this.engine.events.emit('render:request', {});
    }
  }

  private restoreOriginalNumbering(): void {
    const updatedElements: MapElement[] = [];

    for (const label of this.affectedLabels) {
      const savedSeats = this.beforeSeatsByLabel.get(label);
      if (!savedSeats) continue;

      for (const savedSeat of savedSeats) {
        const current = this.engine.state.get(savedSeat.id);
        if (current && current.type === 'seat') {
          this.engine.state.set(savedSeat.id, savedSeat);
          this.engine.spatialIndex.update(savedSeat);
          updatedElements.push(savedSeat);
        }
      }
    }

    if (updatedElements.length > 0) {
      this.engine.events.emit('elements:updated', { elements: updatedElements });
      this.engine.events.emit('render:request', {});
    }
  }
}
