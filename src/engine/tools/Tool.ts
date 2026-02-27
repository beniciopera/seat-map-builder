import type { EditorInputEvent } from '../input/InputEvent';
import type { EditorEngine } from '../EditorEngine';

export interface Tool {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly cursor: string;
  readonly currentState: string;
  onActivate(engine: EditorEngine): void;
  onDeactivate(): void;
  onPointerDown(event: EditorInputEvent): void;
  onPointerMove(event: EditorInputEvent): void;
  onPointerUp(event: EditorInputEvent): void;
  onKeyDown(event: KeyboardEvent): void;
  onKeyUp(event: KeyboardEvent): void;
  cancel(): void;
  reset(): void;
}

export abstract class BaseTool implements Tool {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly icon: string;
  abstract readonly cursor: string;

  protected engine: EditorEngine | null = null;
  protected _currentState = 'idle';

  get currentState(): string {
    return this._currentState;
  }

  protected transition(newState: string): void {
    this._currentState = newState;
    this.engine?.events.emit('tool:state-changed', {
      toolId: this.id,
      state: newState,
    });
  }

  onActivate(engine: EditorEngine): void {
    this.engine = engine;
    this.reset();
  }

  onDeactivate(): void {
    this.cancel();
    this.engine = null;
  }

  abstract onPointerDown(event: EditorInputEvent): void;
  abstract onPointerMove(event: EditorInputEvent): void;
  abstract onPointerUp(event: EditorInputEvent): void;

  onKeyDown(_event: KeyboardEvent): void {}
  onKeyUp(_event: KeyboardEvent): void {}

  cancel(): void {
    this.reset();
  }

  reset(): void {
    this.transition('idle');
  }
}
