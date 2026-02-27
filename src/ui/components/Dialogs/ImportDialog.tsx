'use client';
import { useState, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Tabs,
  Tab,
  Box,
  Alert,
} from '@mui/material';
import { useEngine } from '@/src/ui/hooks/useEngine';
import { deserializeLayout } from '@/src/domain/serialization';

export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useEngine();
  const [tab, setTab] = useState(0);
  const [pastedJson, setPastedJson] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileContentRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      fileContentRef.current = reader.result as string;
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    const json = tab === 0 ? fileContentRef.current : pastedJson;
    if (!json || json.trim() === '') {
      setError(tab === 0 ? 'Please select a file first' : 'Please paste JSON content');
      return;
    }
    try {
      const layout = deserializeLayout(json);
      engine.loadLayout(layout);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid JSON format');
    }
  };

  const handleClose = () => {
    setPastedJson('');
    setError(null);
    setFileName(null);
    fileContentRef.current = null;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Import Map Layout</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setError(null); }} sx={{ mb: 2 }}>
          <Tab label="Upload File" />
          <Tab label="Paste JSON" />
        </Tabs>

        {tab === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Button variant="outlined" component="label">
              {fileName ?? 'Choose JSON File'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                hidden
                onChange={handleFileChange}
              />
            </Button>
          </Box>
        )}

        {tab === 1 && (
          <TextField
            multiline
            fullWidth
            minRows={10}
            maxRows={20}
            placeholder="Paste your JSON here..."
            value={pastedJson}
            onChange={(e) => { setPastedJson(e.target.value); setError(null); }}
            InputProps={{ sx: { fontFamily: 'monospace', fontSize: 12 } }}
          />
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleImport}>
          Import
        </Button>
      </DialogActions>
    </Dialog>
  );
}
