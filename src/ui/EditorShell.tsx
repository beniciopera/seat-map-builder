'use client';
import { useRef, useEffect, useState, useCallback } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Box,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import { editorTheme } from './theme';
import { EngineProvider } from './hooks/useEngine';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { Toolbar } from './components/Toolbar/Toolbar';
import { CanvasHost } from './components/Canvas/CanvasHost';
import { PropertiesPanel } from './components/Panels/PropertiesPanel';
import { StatusBar } from './components/StatusBar/StatusBar';
import { ConfirmDeleteDialog } from './components/Dialogs/ConfirmDeleteDialog';
import { EditorEngine } from '@/src/engine/EditorEngine';
import { SelectionTool } from '@/src/engine/tools/SelectionTool';
import { SeatPlacementTool } from '@/src/engine/tools/SeatPlacementTool';
import { AreaTool } from '@/src/engine/tools/AreaTool';
import { TableTool } from '@/src/engine/tools/TableTool';
import { PanTool } from '@/src/engine/tools/PanTool';
import { GridTool } from '@/src/engine/tools/GridTool';
import { SeatPickerTool } from '@/src/engine/tools/SeatPickerTool';
import { bridgeEngineToStore } from '@/src/store/engineBridge';
import { DARK_DEFAULT_CURSOR } from '@/src/utils/cursors';
import { serializeLayout, deserializeLayout } from '@/src/domain/serialization';

function EditorInner({ engine }: { engine: EditorEngine }) {
  useKeyboardShortcuts(engine);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newMapConfirmOpen, setNewMapConfirmOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounter = useRef(0);

  const handleNewMap = () => {
    engine.resetState();
    setNewMapConfirmOpen(false);
  };

  const handleExport = useCallback(() => {
    const layout = engine.getLayout();
    const json = serializeLayout(layout);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${layout.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [engine]);

  const importFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith('.json')) {
      alert('Please select a valid .json file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const layout = deserializeLayout(reader.result as string);
        engine.loadLayout(layout);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Invalid JSON format');
      }
    };
    reader.onerror = () => {
      alert('Failed to read file');
    };
    reader.readAsText(file);
  }, [engine]);

  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    importFile(file);
    e.target.value = '';
  }, [importFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      importFile(file);
    }
  }, [importFile]);

  return (
    <EngineProvider value={engine}>
      <Box
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', position: 'relative' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box sx={{ flex: 1 }}>
            <Toolbar />
          </Box>
          <Tooltip title="New Map">
            <IconButton onClick={() => setNewMapConfirmOpen(true)} sx={{ mr: 0.5 }}>
              <NoteAddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Import JSON">
            <IconButton onClick={() => fileInputRef.current?.click()} sx={{ mr: 0.5 }}>
              <FileUploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export JSON">
            <IconButton onClick={handleExport} sx={{ mr: 1 }}>
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <CanvasHost />
          <PropertiesPanel />
        </Box>
        <StatusBar />
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          hidden
          onChange={handleFileImport}
        />
        <ConfirmDeleteDialog />

        <Dialog open={newMapConfirmOpen} onClose={() => setNewMapConfirmOpen(false)}>
          <DialogTitle>New Map</DialogTitle>
          <DialogContent>
            <DialogContentText>
              This will clear all elements and undo history. Are you sure you want to start a new map?
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setNewMapConfirmOpen(false)}>Cancel</Button>
            <Button variant="contained" color="error" onClick={handleNewMap}>
              New Map
            </Button>
          </DialogActions>
        </Dialog>

        {isDragOver && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.6)',
              pointerEvents: 'none',
            }}
          >
            <Box
              sx={{
                border: '3px dashed',
                borderColor: 'primary.main',
                borderRadius: 2,
                px: 4,
                py: 3,
                color: 'common.white',
                fontSize: '1.25rem',
                fontWeight: 500,
              }}
            >
              Drop JSON file to import
            </Box>
          </Box>
        )}
      </Box>
    </EngineProvider>
  );
}

export function EditorShell() {
  const engineRef = useRef<EditorEngine | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const engine = new EditorEngine();

    // Register tools
    engine.tools.register(new SelectionTool());
    engine.tools.register(new SeatPlacementTool());
    engine.tools.register(new AreaTool());
    engine.tools.register(new TableTool());
    engine.tools.register(new PanTool());
    engine.tools.register(new GridTool());
    engine.tools.register(new SeatPickerTool());

    // Set default tool
    engine.tools.setActiveTool('selection');

    // Bridge engine events to Zustand store
    const cleanup = bridgeEngineToStore(engine);

    // Initialize
    engine.initialize();

    // Apply dark default cursor globally (toolbar, panels, status bar, etc.)
    document.body.style.cursor = DARK_DEFAULT_CURSOR;

    engineRef.current = engine;
    setReady(true);

    return () => {
      cleanup();
      engine.dispose();
      document.body.style.cursor = '';
      engineRef.current = null;
    };
  }, []);

  if (!ready || !engineRef.current) {
    return (
      <ThemeProvider theme={editorTheme}>
        <CssBaseline />
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
          Loading editor...
        </Box>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider theme={editorTheme}>
      <CssBaseline />
      <EditorInner engine={engineRef.current} />
    </ThemeProvider>
  );
}
