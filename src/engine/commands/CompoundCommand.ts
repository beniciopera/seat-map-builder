import type { Command } from './Command';

export class CompoundCommand implements Command {
  readonly name: string;
  private commands: Command[];

  constructor(name: string, commands: Command[]) {
    this.name = name;
    this.commands = commands;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }
}
