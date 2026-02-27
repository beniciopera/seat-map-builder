import type { Tool } from './Tool';
import type { EditorEngine } from '../EditorEngine';

export class ToolManager {
  private tools = new Map<string, Tool>();
  private activeTool: Tool | null = null;
  private engine: EditorEngine;

  constructor(engine: EditorEngine) {
    this.engine = engine;
  }

  register(tool: Tool): void {
    this.tools.set(tool.id, tool);
  }

  getTool(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  setActiveTool(id: string): void {
    const tool = this.tools.get(id);
    if (!tool) return;
    if (this.activeTool === tool) return;

    const previousId = this.activeTool?.id ?? null;

    if (this.activeTool) {
      this.activeTool.onDeactivate();
    }

    this.activeTool = tool;
    tool.onActivate(this.engine);

    this.engine.events.emit('tool:changed', {
      toolId: id,
      previousToolId: previousId,
    });
    this.engine.events.emit('cursor:changed', {
      cursor: tool.cursor,
    });
  }

  getActiveTool(): Tool | null {
    return this.activeTool;
  }

  getToolIds(): string[] {
    return Array.from(this.tools.keys());
  }
}
