import type { Command } from './Command';
import type { Seat, Row } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export class PlaceSeatsCommand implements Command {
  readonly name = 'Place Seats';
  private engine: EditorEngine;
  private seats: Seat[];
  private row?: Row;

  constructor(engine: EditorEngine, seats: Seat[], row?: Row) {
    this.engine = engine;
    this.seats = seats;
    this.row = row;
  }

  execute(): void {
    if (this.row) {
      this.engine.addElements([this.row, ...this.seats]);
    } else {
      this.engine.addElements(this.seats);
    }
  }

  undo(): void {
    const ids = this.seats.map(s => s.id);
    if (this.row) ids.push(this.row.id);
    this.engine.removeElements(ids);
  }
}
