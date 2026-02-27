import type { EditorEngine } from '@/src/engine/EditorEngine';
import { useEditorStore } from './useEditorStore';
import { throttle } from '@/src/utils/debounce';

export function bridgeEngineToStore(engine: EditorEngine): () => void {
  const unsubscribers: Array<() => void> = [];

  unsubscribers.push(
    engine.events.on('tool:changed', ({ toolId }) => {
      useEditorStore.getState().setActiveToolId(toolId);
    }),
  );

  unsubscribers.push(
    engine.events.on('tool:state-changed', ({ state }) => {
      useEditorStore.getState().setToolState(state);
    }),
  );

  unsubscribers.push(
    engine.events.on('selection:changed', ({ selectedIds }) => {
      useEditorStore.getState().setSelectedIds(selectedIds);
      if (selectedIds.length === 1) {
        const element = engine.getElement(selectedIds[0]);
        if (element) {
          const label = 'label' in element ? (element as { label: string }).label : '';
          useEditorStore.getState().setSelectedElementData({
            ...element,
            type: element.type,
            id: element.id,
            label,
          });
        }
      } else {
        // Check if selection is a row + its child seats (treat as row selection)
        let rowElement: ReturnType<typeof engine.getElement> | null = null;
        for (const id of selectedIds) {
          const el = engine.getElement(id);
          if (el && el.type === 'row') {
            if (rowElement) { rowElement = null; break; } // multiple rows → not a row group
            rowElement = el;
          }
        }
        if (rowElement && rowElement.type === 'row' && 'seatIds' in rowElement) {
          const seatIds = (rowElement as unknown as { seatIds: readonly string[] }).seatIds;
          const expectedSize = seatIds.length + 1; // row + seats
          if (selectedIds.length === expectedSize) {
            const label = 'label' in rowElement ? (rowElement as { label: string }).label : '';
            useEditorStore.getState().setSelectedElementData({
              ...rowElement,
              type: rowElement.type,
              id: rowElement.id,
              label,
            });
          } else {
            useEditorStore.getState().setSelectedElementData(null);
          }
        } else {
          // Check if selection is a table + its child seats (treat as table selection)
          let tableElement: ReturnType<typeof engine.getElement> | null = null;
          for (const id of selectedIds) {
            const el = engine.getElement(id);
            if (el && el.type === 'table') {
              if (tableElement) { tableElement = null; break; } // multiple tables → not a table group
              tableElement = el;
            }
          }
          if (tableElement && tableElement.type === 'table' && 'seatIds' in tableElement) {
            const seatIds = (tableElement as unknown as { seatIds: readonly string[] }).seatIds;
            const expectedSize = seatIds.length + 1; // table + seats
            if (selectedIds.length === expectedSize) {
              const label = 'label' in tableElement ? (tableElement as { label: string }).label : '';
              useEditorStore.getState().setSelectedElementData({
                ...tableElement,
                type: tableElement.type,
                id: tableElement.id,
                label,
              });
            } else {
              useEditorStore.getState().setSelectedElementData(null);
            }
          } else {
            useEditorStore.getState().setSelectedElementData(null);
          }
        }
      }
    }),
  );

  unsubscribers.push(
    engine.events.on('viewport:changed', ({ zoom, panX, panY }) => {
      useEditorStore.getState().setZoom(zoom);
      useEditorStore.getState().setPan(panX, panY);
    }),
  );

  unsubscribers.push(
    engine.events.on('history:changed', ({ canUndo, canRedo }) => {
      useEditorStore.getState().setCanUndo(canUndo);
      useEditorStore.getState().setCanRedo(canRedo);
    }),
  );

  unsubscribers.push(
    engine.events.on('cursor:changed', ({ cursor }) => {
      useEditorStore.getState().setCursor(cursor);
    }),
  );

  // Throttled element count updates
  const updateCounts = throttle(() => {
    const all = engine.getAllElements();
    useEditorStore.getState().setElementCounts({
      total: all.length,
      seats: all.filter(e => e.type === 'seat').length,
      rows: all.filter(e => e.type === 'row').length,
      areas: all.filter(e => e.type === 'area').length,
      tables: all.filter(e => e.type === 'table').length,
    });
  }, 100);

  unsubscribers.push(engine.events.on('elements:added', updateCounts));
  unsubscribers.push(engine.events.on('elements:removed', updateCounts));
  unsubscribers.push(engine.events.on('layout:loaded', updateCounts));

  // Refresh selected element data when properties change
  unsubscribers.push(
    engine.events.on('elements:updated', ({ elements }) => {
      const store = useEditorStore.getState();
      const current = store.selectedElementData;
      if (!current) return;
      const updated = elements.find((el: { id: string }) => el.id === current.id);
      if (updated) {
        const label = 'label' in updated ? (updated as { label: string }).label : '';
        store.setSelectedElementData({
          ...updated,
          type: updated.type,
          id: updated.id,
          label,
        });
      }
    }),
  );

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
