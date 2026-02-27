import type { Command } from './Command';
import type { Table, Seat } from '@/src/domain/types';
import type { EditorEngine } from '../EditorEngine';

export class CreateTableCommand implements Command {
  readonly name = 'Create Table';
  private engine: EditorEngine;
  private table: Table;
  private seats: Seat[];

  constructor(engine: EditorEngine, table: Table, seats: Seat[]) {
    this.engine = engine;
    this.table = table;
    this.seats = seats;
  }

  execute(): void {
    this.engine.addElements([this.table, ...this.seats]);
  }

  undo(): void {
    const ids = [this.table.id, ...this.seats.map(s => s.id)];
    this.engine.removeElements(ids);
  }
}
