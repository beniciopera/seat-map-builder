'use client';
import { Box, Typography } from '@mui/material';
import { useEditorStore } from '@/src/store/useEditorStore';

export function StatusBar() {
  const zoom = useEditorStore((s) => s.zoom);
  const counts = useEditorStore((s) => s.elementCounts);
  const toolState = useEditorStore((s) => s.toolState);
  const activeToolId = useEditorStore((s) => s.activeToolId);

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        px: 2,
        py: 0.5,
        borderTop: '1px solid #e0e0e0',
        bgcolor: 'background.paper',
        minHeight: 28,
      }}
    >
      <Box sx={{ display: 'flex', gap: 3 }}>
        <Typography variant="caption" color="text.secondary">
          {activeToolId} ({toolState})
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 3 }}>
        <Typography variant="caption" color="text.secondary">
          Seats: {counts.seats}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Rows: {counts.rows}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Areas: {counts.areas}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Tables: {counts.tables}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Total: {counts.total}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: 'tabular-nums' }}>
          {Math.round(zoom * 100)}%
        </Typography>
      </Box>
    </Box>
  );
}
