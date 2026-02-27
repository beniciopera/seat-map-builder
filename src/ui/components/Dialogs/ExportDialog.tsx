'use client';
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
} from '@mui/material';
import { useEngine } from '@/src/ui/hooks/useEngine';
import { serializeLayout } from '@/src/domain/serialization';

export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const engine = useEngine();
  const [copied, setCopied] = useState(false);

  const layout = engine.getLayout();
  const json = serializeLayout(layout);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = useCallback(() => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${layout.name.replace(/\s+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [json, layout.name]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Export Map Layout</DialogTitle>
      <DialogContent>
        <TextField
          multiline
          fullWidth
          minRows={10}
          maxRows={20}
          value={json}
          InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="outlined" onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </Button>
        <Button variant="contained" onClick={handleDownload}>
          Download JSON
        </Button>
      </DialogActions>
    </Dialog>
  );
}
