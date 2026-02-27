import type { Command } from './Command';
import type { Seat, Row } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export class PlaceGridCommand implements Command {
  readonly name = 'Place Grid';
  private engine: EditorEngine;
  private rows: Row[];
  private allSeats: Seat[];

  constructor(engine: EditorEngine, rows: Row[], allSeats: Seat[]) {
    this.engine = engine;
    this.rows = rows;
    this.allSeats = allSeats;
  }

  execute(): void {
    this.engine.addElements([...this.rows, ...this.allSeats]);
  }

  undo(): void {
    const ids = [
      ...this.allSeats.map(s => s.id),
      ...this.rows.map(r => r.id),
    ];
    this.engine.removeElements(ids);
  }
}
