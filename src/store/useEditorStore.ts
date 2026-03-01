import { create } from 'zustand';
import type { ElementId, ElementType, MapElement } from '@/src/domain/types';
import { DARK_DEFAULT_CURSOR } from '@/src/utils/cursors';

export interface SelectedElementData {
  type: ElementType;
  id: ElementId;
  label: string;
  [key: string]: unknown;
}

export interface ElementCounts {
  total: number;
  seats: number;
  rows: number;
  areas: number;
  tables: number;
}

export interface EditorStoreState {
  activeToolId: string;
  toolState: string;
  selectedIds: ElementId[];
  selectionCount: number;
  zoom: number;
  panX: number;
  panY: number;
  canUndo: boolean;
  canRedo: boolean;
  elementCounts: ElementCounts;
  cursor: string;
  selectedElementData: SelectedElementData | null;
  mouseWorldX: number;
  mouseWorldY: number;

  setActiveToolId: (id: string) => void;
  setToolState: (state: string) => void;
  setSelectedIds: (ids: ElementId[]) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  setCanUndo: (canUndo: boolean) => void;
  setCanRedo: (canRedo: boolean) => void;
  setCursor: (cursor: string) => void;
  setElementCounts: (counts: ElementCounts) => void;
  setSelectedElementData: (data: SelectedElementData | null) => void;
  setMouseWorld: (x: number, y: number) => void;
}

export const useEditorStore = create<EditorStoreState>((set) => ({
  activeToolId: 'selection',
  toolState: 'idle',
  selectedIds: [],
  selectionCount: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  canUndo: false,
  canRedo: false,
  elementCounts: { total: 0, seats: 0, rows: 0, areas: 0, tables: 0 },
  cursor: DARK_DEFAULT_CURSOR,
  selectedElementData: null,
  mouseWorldX: 0,
  mouseWorldY: 0,

  setActiveToolId: (id) => set({ activeToolId: id }),
  setToolState: (state) => set({ toolState: state }),
  setSelectedIds: (ids) => set({ selectedIds: ids, selectionCount: ids.length }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (x, y) => set({ panX: x, panY: y }),
  setCanUndo: (canUndo) => set({ canUndo }),
  setCanRedo: (canRedo) => set({ canRedo }),
  setCursor: (cursor) => set({ cursor }),
  setElementCounts: (counts) => set({ elementCounts: counts }),
  setSelectedElementData: (data) => set({ selectedElementData: data }),
  setMouseWorld: (x, y) => set({ mouseWorldX: x, mouseWorldY: y }),
}));
