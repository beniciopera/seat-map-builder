'use client';
import { Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { useEditorStore } from '@/src/store/useEditorStore';
import { useEngine } from '@/src/ui/hooks/useEngine';
import type { Seat, Row, Area, Table, SeatCategory, ElementId } from '@/src/domain/types';
import { UpdatePropertiesCommand } from '@/src/engine/commands/UpdatePropertiesCommand';
import { ChangeCategoryCommand } from '@/src/engine/commands/ChangeCategoryCommand';
import { categoryColor } from '@/src/utils/color';
import { useEffect, useMemo, useRef, useState } from 'react';

const CATEGORY_OPTIONS: { value: SeatCategory; label: string }[] = [
  { value: 'planta1', label: 'Planta 1' },
  { value: 'planta2', label: 'Planta 2' },
  { value: 'vip', label: 'VIP' },
];

function renderCategoryMenuItems() {
  return CATEGORY_OPTIONS.map((opt) => (
    <MenuItem key={opt.value} value={opt.value}>
      <Box
        sx={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          bgcolor: categoryColor(opt.value),
          display: 'inline-block',
          mr: 1,
          verticalAlign: 'middle',
        }}
      />
      {opt.label}
    </MenuItem>
  ));
}

export function PropertiesPanel() {
  const engine = useEngine();
  const selectedElementData = useEditorStore((s) => s.selectedElementData);
  const selectionCount = useEditorStore((s) => s.selectionCount);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const [bulkVersion, setBulkVersion] = useState(0);

  // For multi-selection: check if all elements are seats/rows/tables
  const multiSelectInfo = useMemo(() => {
    if (selectedElementData || selectionCount <= 1) return null;

    const elements = selectedIds.map((id) => engine.getElement(id)).filter(Boolean);
    const allSeatsRowsOrTables = elements.length > 0 && elements.every((el) => el!.type === 'seat' || el!.type === 'row' || el!.type === 'table');

    if (!allSeatsRowsOrTables) return null;

    // Collect table IDs so we can skip their child seats in category detection
    const tableIds = new Set<string>();
    const rowIds = new Set<string>();
    for (const el of elements) {
      if (el!.type === 'table') tableIds.add(el!.id);
      if (el!.type === 'row') rowIds.add(el!.id);
    }

    // Detect common category (read from parent groups, not child seats)
    const categories = new Set<string>();
    for (const el of elements) {
      if (el!.type === 'seat') {
        const seat = el as unknown as Seat;
        // Skip seats whose parent table or row is also in the selection
        if (seat.tableId && tableIds.has(seat.tableId)) continue;
        if (seat.rowId && rowIds.has(seat.rowId)) continue;
        categories.add(seat.category || 'planta1');
      } else if (el!.type === 'row') {
        categories.add((el as unknown as Row).category || 'planta1');
      } else if (el!.type === 'table') {
        categories.add((el as unknown as Table).category || 'planta1');
      }
    }
    const commonCategory = categories.size === 1 ? [...categories][0] : '';
    const uniqueCategories = [...categories] as SeatCategory[];

    return { elements, commonCategory, uniqueCategories };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedElementData, selectionCount, selectedIds, engine, bulkVersion]);

  if (!selectedElementData) {
    // Multi-selection with bulk category editing
    if (selectionCount > 1 && multiSelectInfo) {
      const handleBulkCategoryChange = (newCategory: string) => {
        const cmd = new ChangeCategoryCommand(
          engine,
          selectedIds as ElementId[],
          newCategory as SeatCategory,
        );
        engine.history.execute(cmd);
        setBulkVersion((v) => v + 1);
      };

      return (
        <Box sx={{ p: 2, width: 260, borderLeft: '1px solid #e0e0e0', bgcolor: 'background.paper' }}>
          <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2 }}>
            {selectionCount} elements selected
          </Typography>
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel shrink>Category</InputLabel>
            <Select
              value={multiSelectInfo.commonCategory}
              label="Category"
              displayEmpty
              renderValue={(value) => {
                if (value) {
                  const opt = CATEGORY_OPTIONS.find((o) => o.value === value);
                  return (
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: categoryColor(value as SeatCategory), mr: 1 }} />
                      {opt?.label}
                    </Box>
                  );
                }
                return (
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {multiSelectInfo.uniqueCategories.map((cat) => (
                      <Box key={cat} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: categoryColor(cat), mr: 0.5 }} />
                    ))}
                    <Typography variant="body2" sx={{ ml: 0.5, color: 'text.secondary' }}>
                      Mixed Categories
                    </Typography>
                  </Box>
                );
              }}
              onChange={(e) => handleBulkCategoryChange(e.target.value)}
            >
              {renderCategoryMenuItems()}
            </Select>
          </FormControl>
        </Box>
      );
    }

    return (
      <Box sx={{ p: 2, width: 260, borderLeft: '1px solid #e0e0e0', bgcolor: 'background.paper' }}>
        <Typography variant="subtitle2" color="text.secondary">
          {selectionCount > 1
            ? `${selectionCount} elements selected`
            : 'No selection'}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          Click an element to view and edit its properties.
        </Typography>
      </Box>
    );
  }

  const handleChange = (field: string, value: unknown) => {
    const el = engine.getElement(selectedElementData.id);
    if (!el) return;
    const oldProps = { [field]: (el as unknown as Record<string, unknown>)[field] };
    const newProps = { [field]: value };
    const cmd = new UpdatePropertiesCommand(engine, selectedElementData.id, oldProps, newProps);
    engine.history.execute(cmd);
  };

  return (
    <Box sx={{ p: 2, width: 260, borderLeft: '1px solid #e0e0e0', bgcolor: 'background.paper', overflow: 'auto' }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, textTransform: 'capitalize' }}>
        {selectedElementData.type} Properties
      </Typography>

      {selectedElementData.type === 'seat' && (
        <SeatProperties data={selectedElementData as unknown as Seat} onChange={handleChange} />
      )}
      {selectedElementData.type === 'row' && (
        <RowProperties data={selectedElementData as unknown as Row} onChange={handleChange} engine={engine} />
      )}
      {selectedElementData.type === 'area' && (
        <AreaProperties data={selectedElementData as unknown as Area} onChange={handleChange} engine={engine} />
      )}
      {selectedElementData.type === 'table' && (
        <TableProperties data={selectedElementData as unknown as Table} onChange={handleChange} engine={engine} />
      )}
    </Box>
  );
}

function SeatProperties({ data, onChange }: { data: Seat; onChange: (field: string, value: unknown) => void }) {
  return (
    <>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Category</InputLabel>
        <Select value={data.category || 'planta1'} label="Category" onChange={(e) => onChange('category', e.target.value)}>
          {renderCategoryMenuItems()}
        </Select>
      </FormControl>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Status</InputLabel>
        <Select value={data.status || 'available'} label="Status" onChange={(e) => onChange('status', e.target.value)}>
          <MenuItem value="available">Available</MenuItem>
          <MenuItem value="reserved">Reserved</MenuItem>
          <MenuItem value="blocked">Blocked</MenuItem>
          <MenuItem value="sold">Sold</MenuItem>
        </Select>
      </FormControl>
    </>
  );
}

function RowProperties({
  data,
  onChange,
  engine,
}: {
  data: Row;
  onChange: (field: string, value: unknown) => void;
  engine: ReturnType<typeof useEngine>;
}) {
  const handleLabelChange = (newLabel: string) => {
    onChange('label', newLabel);
    // Propagate to child seats and notify renderer
    const updatedSeats = engine.rowGrouping.propagateLabel(data.id, newLabel);
    if (updatedSeats.length > 0) {
      engine.events.emit('elements:updated', { elements: updatedSeats });
    }
  };

  const handleCategoryChange = (newCategory: string) => {
    const cmd = new ChangeCategoryCommand(
      engine,
      [data.id],
      newCategory as SeatCategory,
    );
    engine.history.execute(cmd);
  };

  return (
    <>
      <TextField
        label="Row Label"
        fullWidth
        value={data.label || ''}
        onChange={(e) => handleLabelChange(e.target.value)}
        sx={{ mb: 2 }}
      />
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Category</InputLabel>
        <Select value={data.category || 'planta1'} label="Category" onChange={(e) => handleCategoryChange(e.target.value)}>
          {renderCategoryMenuItems()}
        </Select>
      </FormControl>
      <TextField
        label="Price"
        type="number"
        fullWidth
        value={data.price ?? 0}
        onChange={(e) => onChange('price', Number(e.target.value))}
        inputProps={{ min: 0, step: 0.01 }}
        sx={{ mb: 2 }}
      />
    </>
  );
}

function AreaProperties({ data, onChange, engine }: { data: Area; onChange: (field: string, value: unknown) => void; engine: ReturnType<typeof useEngine> }) {
  const [localLabel, setLocalLabel] = useState(data.label);
  const [localColor, setLocalColor] = useState(data.color || '#2196F3');
  const colorBeforeDrag = useRef(data.color || '#2196F3');
  const pendingColorCmd = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalLabel(data.label);
  }, [data.label]);

  useEffect(() => {
    setLocalColor(data.color || '#2196F3');
    colorBeforeDrag.current = data.color || '#2196F3';
    pendingColorCmd.current = false;
  }, [data.color]);

  const handleBlur = () => {
    const trimmed = localLabel.trim();
    if (trimmed.length > 0) {
      onChange('label', trimmed);
    } else {
      setLocalLabel(data.label);
    }
  };

  const handleColorInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setLocalColor(newColor);

    if (!pendingColorCmd.current) {
      // First change: revert state so execute() applies cleanly, then push command
      const el = engine.state.get(data.id);
      if (el) {
        const reverted = { ...el, color: colorBeforeDrag.current } as Area;
        engine.state.set(data.id, reverted);
      }
      const cmd = new UpdatePropertiesCommand(
        engine,
        data.id,
        { color: colorBeforeDrag.current } as Partial<Area>,
        { color: newColor } as Partial<Area>,
      );
      engine.history.execute(cmd);
      pendingColorCmd.current = true;
    } else {
      // Subsequent changes: replace the command on the stack and apply directly
      const cmd = new UpdatePropertiesCommand(
        engine,
        data.id,
        { color: colorBeforeDrag.current } as Partial<Area>,
        { color: newColor } as Partial<Area>,
      );
      engine.history.replaceLast(cmd);
      const el = engine.state.get(data.id);
      if (el) {
        const merged = { ...el, color: newColor } as Area;
        engine.state.set(data.id, merged);
        engine.events.emit('elements:updated', { elements: [merged] });
        engine.events.emit('render:request', {});
      }
    }
  };

  return (
    <>
      <TextField
        label="Label"
        fullWidth
        inputRef={inputRef}
        placeholder="Enter area name..."
        value={localLabel}
        onChange={(e) => setLocalLabel(e.target.value)}
        onFocus={() => inputRef.current?.select()}
        onBlur={handleBlur}
        helperText={localLabel.trim().length === 0 ? 'Label cannot be empty' : undefined}
        error={localLabel.trim().length === 0}
        sx={{ mb: 2 }}
      />
      <TextField
        label="Color"
        type="color"
        fullWidth
        value={localColor}
        onChange={handleColorInput}
        sx={{ mb: 2 }}
      />
    </>
  );
}

function TableProperties({
  data,
  onChange,
  engine,
}: {
  data: Table;
  onChange: (field: string, value: unknown) => void;
  engine: ReturnType<typeof useEngine>;
}) {
  const handleLabelChange = (newLabel: string) => {
    onChange('label', newLabel);
  };

  const handleCategoryChange = (newCategory: string) => {
    const cmd = new ChangeCategoryCommand(
      engine,
      [data.id],
      newCategory as SeatCategory,
    );
    engine.history.execute(cmd);
  };

  return (
    <>
      <TextField
        label="Label"
        fullWidth
        value={data.label || ''}
        onChange={(e) => handleLabelChange(e.target.value)}
        sx={{ mb: 2 }}
      />
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Category</InputLabel>
        <Select value={data.category || 'planta1'} label="Category" onChange={(e) => handleCategoryChange(e.target.value)}>
          {renderCategoryMenuItems()}
        </Select>
      </FormControl>
      <Typography variant="body2" color="text.secondary">
        Seats: {data.seatCount || 0}
      </Typography>
    </>
  );
}
