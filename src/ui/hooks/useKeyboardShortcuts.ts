'use client';
import { useEffect } from 'react';
import type { EditorEngine } from '@/src/engine/EditorEngine';

export function useKeyboardShortcuts(engine: EditorEngine) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // Global shortcuts
      if (ctrl && e.key === 'z') {
        e.preventDefault();
        engine.history.undo();
        return;
      }
      if (ctrl && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        engine.history.redo();
        return;
      }
      if (ctrl && e.key === 'a') {
        e.preventDefault();
        const allIds = engine.getAllElements()
          .filter(el => el.visible && !el.locked)
          .map(el => el.id);
        engine.selection.selectMultiple(allIds);
        engine.events.emit('selection:changed', { selectedIds: allIds });
        return;
      }

      // Tool shortcuts
      switch (e.key.toLowerCase()) {
        case 'v':
          engine.tools.setActiveTool('selection');
          break;
        case 's':
          engine.tools.setActiveTool('seat-placement');
          break;
        case 'a':
          if (!ctrl) engine.tools.setActiveTool('area');
          break;
        case 't':
          engine.tools.setActiveTool('table');
          break;
        case 'g':
          engine.tools.setActiveTool('grid');
          break;
        case 'h':
          engine.tools.setActiveTool('pan');
          break;
        case ' ':
          // Space is handled by InputManager for temporary pan; prevent default here
          e.preventDefault();
          break;
        case 'escape':
          engine.tools.getActiveTool()?.cancel();
          break;
        case 'delete':
        case 'backspace':
          // Forward to active tool
          engine.tools.getActiveTool()?.onKeyDown(e);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [engine]);
}
