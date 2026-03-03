'use client';
import {
  AppBar,
  Toolbar as MuiToolbar,
  ToggleButtonGroup,
  ToggleButton,
  IconButton,
  Divider,
  Typography,
  Box,
  Tooltip,
  SvgIcon,
} from '@mui/material';
import NearMeIcon from '@mui/icons-material/NearMe';
import EventSeatIcon from '@mui/icons-material/EventSeat';
import CropFreeIcon from '@mui/icons-material/CropFree';
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant';
import PanToolIcon from '@mui/icons-material/PanTool';
import BrushIcon from '@mui/icons-material/Brush';
import GridViewIcon from '@mui/icons-material/GridView';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { useEngine } from '@/src/ui/hooks/useEngine';
import { useEditorStore } from '@/src/store/useEditorStore';
import { ViewportController } from '@/src/renderer/viewport/ViewportController';

function SeatPickerIcon(props: React.ComponentProps<typeof SvgIcon>) {
  return (
    <SvgIcon {...props} viewBox="0 0 128 128">
      <g stroke="#2b2b2b" strokeWidth="4" fill="none" strokeLinecap="round">
        <circle cx="38" cy="78" r="18" />
        <path d="M88 22 a18 18 0 1 1 -1 0.1" />
        <circle cx="64" cy="58" r="20" />
      </g>
      <circle cx="64" cy="58" r="13" fill="#2b2b2b" />
      <path d="M72 64 L108 92 L92 94 L98 110 L88 114 L82 98 L70 108 Z" fill="#2b2b2b" />
    </SvgIcon>
  );
}

export function Toolbar() {
  const engine = useEngine();
  const activeToolId = useEditorStore((s) => s.activeToolId);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const zoom = useEditorStore((s) => s.zoom);

  const handleToolChange = (_: unknown, newTool: string | null) => {
    if (newTool) {
      engine.tools.setActiveTool(newTool);
    }
  };

  return (
    <AppBar position="static" color="default" elevation={1} sx={{ zIndex: 10 }}>
      <MuiToolbar variant="dense" sx={{ gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, mr: 2 }}>
          SeatMap Builder
        </Typography>

        <ToggleButtonGroup
          value={activeToolId}
          exclusive
          onChange={handleToolChange}
          size="small"
        >
          <ToggleButton value="selection">
            <Tooltip title="Select (V)"><NearMeIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="seat-placement">
            <Tooltip title="Place Seats (S)"><EventSeatIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="grid">
            <Tooltip title="Grid Generator (G)"><GridViewIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="table">
            <Tooltip title="Place Table (T)"><TableRestaurantIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="area">
            <Tooltip title="Draw Area (A)"><CropFreeIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="vector-brush">
            <Tooltip title="Vector Brush (B)"><BrushIcon fontSize="small" /></Tooltip>
          </ToggleButton>
          <ToggleButton value="seat-picker">
            <Tooltip title="Seat Picker (P)"><SeatPickerIcon sx={{ fontSize: 28 }} /></Tooltip>
          </ToggleButton>
          <ToggleButton value="pan">
            <Tooltip title="Pan (H / Space+Drag)"><PanToolIcon fontSize="small" /></Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton disabled={!canUndo} onClick={() => engine.history.undo()}>
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Y)">
          <span>
            <IconButton disabled={!canRedo} onClick={() => engine.history.redo()}>
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Tooltip title="Zoom Out">
            <IconButton onClick={() => {
              const vc = new ViewportController(engine);
              vc.zoomOut();
            }}>
              <ZoomOutIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Typography variant="body2" sx={{ minWidth: 48, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <Tooltip title="Zoom In">
            <IconButton onClick={() => {
              const vc = new ViewportController(engine);
              vc.zoomIn();
            }}>
              <ZoomInIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit to Content">
            <IconButton onClick={() => {
              const vc = new ViewportController(engine);
              vc.fitToContent();
            }}>
              <FitScreenIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </MuiToolbar>
    </AppBar>
  );
}
