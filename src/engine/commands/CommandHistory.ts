import type { Command } from './Command';
import type { EditorEventEmitter } from '../events';

export class CommandHistory {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxSize = 100;
  private events: EditorEventEmitter;

  constructor(events: EditorEventEmitter) {
    this.events = events;
  }

  execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack.length = 0;
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    this.emitChange();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    command.undo();
    this.redoStack.push(command);
    this.emitChange();
  }

  replaceLast(command: Command): void {
    if (this.undoStack.length > 0) {
      this.undoStack[this.undoStack.length - 1] = command;
    }
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    command.execute();
    this.undoStack.push(command);
    this.emitChange();
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.emitChange();
  }

  private emitChange(): void {
    this.events.emit('history:changed', {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    });
  }
}
