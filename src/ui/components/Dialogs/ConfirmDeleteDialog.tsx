'use client';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';
import { useEffect, useState, useCallback } from 'react';
import { useEngine } from '@/src/ui/hooks/useEngine';
import { DeleteElementsCommand } from '@/src/engine/commands/DeleteElementsCommand';
import type { ElementId } from '@/src/domain/types';

export function ConfirmDeleteDialog() {
  const engine = useEngine();
  const [open, setOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<ElementId[]>([]);

  useEffect(() => {
    const unsub = engine.events.on('delete:confirm', ({ elementIds }) => {
      setPendingIds(elementIds);
      setOpen(true);
    });
    return unsub;
  }, [engine]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setPendingIds([]);
  }, []);

  const handleConfirm = useCallback(() => {
    if (pendingIds.length > 0) {
      const cmd = new DeleteElementsCommand(engine, pendingIds);
      engine.history.execute(cmd);
    }
    handleClose();
  }, [engine, pendingIds, handleClose]);

  const count = pendingIds.length;

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogTitle>Confirm Delete</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Are you sure you want to delete {count === 1 ? 'this element' : `these ${count} elements`}?
          This action can be undone with Ctrl+Z.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>Cancel</Button>
        <Button onClick={handleConfirm} color="error" variant="contained" autoFocus>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
