export interface Command {
  readonly name: string;
  execute(): void;
  undo(): void;
}
