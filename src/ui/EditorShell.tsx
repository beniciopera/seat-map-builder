'use client';
import { useRef, useEffect, useState } from 'react';
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
import { ExportDialog } from './components/Dialogs/ExportDialog';
import { ImportDialog } from './components/Dialogs/ImportDialog';
import { ConfirmDeleteDialog } from './components/Dialogs/ConfirmDeleteDialog';
import { EditorEngine } from '@/src/engine/EditorEngine';
import { SelectionTool } from '@/src/engine/tools/SelectionTool';
import { SeatPlacementTool } from '@/src/engine/tools/SeatPlacementTool';
import { AreaTool } from '@/src/engine/tools/AreaTool';
import { TableTool } from '@/src/engine/tools/TableTool';
import { PanTool } from '@/src/engine/tools/PanTool';
import { GridTool } from '@/src/engine/tools/GridTool';
import { bridgeEngineToStore } from '@/src/store/engineBridge';

function EditorInner({ engine }: { engine: EditorEngine }) {
  useKeyboardShortcuts(engine);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newMapConfirmOpen, setNewMapConfirmOpen] = useState(false);

  const handleNewMap = () => {
    engine.resetState();
    setNewMapConfirmOpen(false);
  };

  return (
    <EngineProvider value={engine}>
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw' }}>
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
            <IconButton onClick={() => setImportOpen(true)} sx={{ mr: 0.5 }}>
              <FileUploadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Export JSON">
            <IconButton onClick={() => setExportOpen(true)} sx={{ mr: 1 }}>
              <FileDownloadIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <CanvasHost />
          <PropertiesPanel />
        </Box>
        <StatusBar />
        <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
        <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
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

    // Set default tool
    engine.tools.setActiveTool('selection');

    // Bridge engine events to Zustand store
    const cleanup = bridgeEngineToStore(engine);

    // Initialize
    engine.initialize();

    engineRef.current = engine;
    setReady(true);

    return () => {
      cleanup();
      engine.dispose();
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
