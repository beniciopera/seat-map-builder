'use client';
import { Box, Typography, TextField, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import { useEditorStore } from '@/src/store/useEditorStore';
import { useEngine } from '@/src/ui/hooks/useEngine';
import type { Seat, Row, Area, Table, SeatCategory, SeatOrderDirection, ElementId } from '@/src/domain/types';
import { UpdatePropertiesCommand } from '@/src/engine/commands/UpdatePropertiesCommand';
import { ChangeCategoryCommand } from '@/src/engine/commands/ChangeCategoryCommand';
import { ChangeTableSeatCountCommand } from '@/src/engine/commands/ChangeTableSeatCountCommand';
import { CompoundCommand } from '@/src/engine/commands/CompoundCommand';
import { categoryColor } from '@/src/utils/color';
import { MIN_SEATS_PER_TABLE, MAX_SEATS_PER_TABLE } from '@/src/domain/constraints';
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
  const activeToolId = useEditorStore((s) => s.activeToolId);
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

    // Detect common category: for rows/tables use contained seats' categories so "Mixed" matches Seat Picker
    const categories = new Set<string>();
    for (const el of elements) {
      if (el!.type === 'seat') {
        const seat = el as unknown as Seat;
        // Skip seats whose parent table or row is also in the selection
        if (seat.tableId && tableIds.has(seat.tableId)) continue;
        if (seat.rowId && rowIds.has(seat.rowId)) continue;
        categories.add(seat.category || 'planta1');
      } else if (el!.type === 'row') {
        const row = el as unknown as Row;
        if (row.seatIds.length === 0) {
          categories.add(row.category || 'planta1');
        } else {
          for (const seatId of row.seatIds) {
            const seat = engine.getElement(seatId);
            if (seat && seat.type === 'seat') categories.add((seat as Seat).category || 'planta1');
          }
        }
      } else if (el!.type === 'table') {
        const table = el as unknown as Table;
        if (table.seatIds.length === 0) {
          categories.add(table.category || 'planta1');
        } else {
          for (const seatId of table.seatIds) {
            const seat = engine.getElement(seatId);
            if (seat && seat.type === 'seat') categories.add((seat as Seat).category || 'planta1');
          }
        }
      }
    }
    const commonCategory = categories.size === 1 ? [...categories][0] : '';
    const uniqueCategories = [...categories] as SeatCategory[];

    // Detect if all top-level selected elements are tables
    const topLevelElements = elements.filter((el) => {
      if (el!.type === 'seat') {
        const seat = el as unknown as Seat;
        if (seat.tableId && tableIds.has(seat.tableId)) return false;
        if (seat.rowId && rowIds.has(seat.rowId)) return false;
      }
      return true;
    });
    const allTables = topLevelElements.length > 0 && topLevelElements.every((el) => el!.type === 'table');
    let commonSeatCount: number | null = null;
    let tableElements: Table[] = [];
    if (allTables) {
      tableElements = topLevelElements.map((el) => el as unknown as Table);
      const seatCounts = new Set(tableElements.map((t) => t.seatCount));
      commonSeatCount = seatCounts.size === 1 ? [...seatCounts][0] : null;
    }

    return { elements, commonCategory, uniqueCategories, allTables, commonSeatCount, tableElements };
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
          {multiSelectInfo.allTables && (
            <BulkSeatCountField
              commonSeatCount={multiSelectInfo.commonSeatCount}
              tables={multiSelectInfo.tableElements}
              engine={engine}
              onDone={() => setBulkVersion((v) => v + 1)}
            />
          )}
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

  const handleChange = (field: string, value: unknown, elementId?: ElementId) => {
    const id = elementId ?? selectedElementData.id;
    const el = engine.getElement(id);
    if (!el) return;
    const oldProps = { [field]: (el as unknown as Record<string, unknown>)[field] };
    const newProps = { [field]: value };
    const cmd = new UpdatePropertiesCommand(engine, id, oldProps, newProps);
    engine.history.execute(cmd);
  };

  return (
    <Box sx={{ p: 2, width: 260, borderLeft: '1px solid #e0e0e0', bgcolor: 'background.paper', overflow: 'auto' }}>
      <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 700, textTransform: 'capitalize' }}>
        {selectedElementData.type} Properties
      </Typography>

      {selectedElementData.type === 'seat' && (
        <SeatProperties data={selectedElementData as unknown as Seat} onChange={handleChange} isSeatPicker={activeToolId === 'seat-picker'} />
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

function SeatProperties({ data, onChange, isSeatPicker }: { data: Seat; onChange: (field: string, value: unknown) => void; isSeatPicker?: boolean }) {
  return (
    <>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel>Category</InputLabel>
        <Select value={data.category || 'planta1'} label="Category" onChange={(e) => onChange('category', e.target.value)}>
          {renderCategoryMenuItems()}
        </Select>
      </FormControl>
      {!isSeatPicker && (data.rowId != null || data.tableId != null) && (
        <FormControl fullWidth sx={{ mb: 2 }}>
          <InputLabel>Status</InputLabel>
          <Select value={data.status || 'available'} label="Status" onChange={(e) => onChange('status', e.target.value)}>
            <MenuItem value="available">Available</MenuItem>
            <MenuItem value="reserved">Reserved</MenuItem>
            <MenuItem value="blocked">Blocked</MenuItem>
            <MenuItem value="sold">Sold</MenuItem>
          </Select>
        </FormControl>
      )}
    </>
  );
}

function RowProperties({
  data,
  onChange,
  engine,
}: {
  data: Row;
  onChange: (field: string, value: unknown, elementId?: ElementId) => void;
  engine: ReturnType<typeof useEngine>;
}) {
  const [localLabel, setLocalLabel] = useState(data.label || '');
  const inputRef = useRef<HTMLInputElement>(null);
  const localLabelRef = useRef(localLabel);
  localLabelRef.current = localLabel;

  useEffect(() => {
    setLocalLabel(data.label || '');
  }, [data.label]);

  // When unmounting (e.g. user clicked map and selection changed), commit pending label for this row
  useEffect(() => {
    return () => {
      const trimmed = localLabelRef.current.trim();
      if (trimmed.length > 0 && trimmed !== (data.label || '')) {
        const el = engine.getElement(data.id);
        if (el) {
          const oldProps = { label: (el as Row).label };
          const newProps = { label: trimmed };
          const cmd = new UpdatePropertiesCommand(engine, data.id, oldProps, newProps);
          engine.history.execute(cmd);
        }
      }
    };
  }, [data.id, data.label, engine]);

  const lastValidLabel = data.label || 'A';

  const handleLabelBlur = () => {
    const trimmed = localLabel.trim();
    if (trimmed.length > 0) {
      onChange('label', trimmed);
    } else {
      setLocalLabel(lastValidLabel);
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

  // Derive category from contained seats so "Mixed" shows when seats have different categories
  const categoryFromSeats = useMemo(() => {
    if (!data.seatIds.length) {
      const single = data.category || 'planta1';
      return { commonCategory: single, uniqueCategories: [single] as SeatCategory[] };
    }
    const categories = new Set<string>();
    for (const seatId of data.seatIds) {
      const seat = engine.getElement(seatId);
      if (seat && seat.type === 'seat') categories.add((seat as Seat).category || 'planta1');
    }
    const uniqueCategories = [...categories] as SeatCategory[];
    const commonCategory = categories.size === 1 ? uniqueCategories[0] : '';
    return { commonCategory, uniqueCategories };
  }, [data.id, data.seatIds, data.category, engine]);

  return (
    <>
      <TextField
        label="Row Label"
        fullWidth
        inputRef={inputRef}
        value={localLabel}
        onChange={(e) => setLocalLabel(e.target.value)}
        onFocus={() => inputRef.current?.select()}
        onBlur={handleLabelBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleLabelBlur();
            inputRef.current?.blur();
          }
        }}
        helperText={localLabel.trim().length === 0 ? 'Label cannot be empty' : undefined}
        error={localLabel.trim().length === 0}
        sx={{ mb: 2 }}
      />
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel shrink>Seat order</InputLabel>
        <Select
          value={data.seatOrderDirection || 'left-to-right'}
          label="Seat order"
          onChange={(e) => onChange('seatOrderDirection', e.target.value as SeatOrderDirection)}
        >
          <MenuItem value="left-to-right">1 → 10</MenuItem>
          <MenuItem value="right-to-left">10 → 1</MenuItem>
        </Select>
      </FormControl>
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel shrink>Category</InputLabel>
        <Select
          value={categoryFromSeats.commonCategory}
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
                {categoryFromSeats.uniqueCategories.map((cat) => (
                  <Box key={cat} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: categoryColor(cat), mr: 0.5 }} />
                ))}
                <Typography variant="body2" sx={{ ml: 0.5, color: 'text.secondary' }}>
                  Mixed
                </Typography>
              </Box>
            );
          }}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          {renderCategoryMenuItems()}
        </Select>
      </FormControl>
    </>
  );
}

function AreaProperties({ data, onChange, engine }: { data: Area; onChange: (field: string, value: unknown, elementId?: ElementId) => void; engine: ReturnType<typeof useEngine> }) {
  const [localLabel, setLocalLabel] = useState(data.label);
  const [localColor, setLocalColor] = useState(data.color || '#2196F3');
  const colorBeforeDrag = useRef(data.color || '#2196F3');
  const pendingColorCmd = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const localLabelRef = useRef(localLabel);
  localLabelRef.current = localLabel;

  useEffect(() => {
    setLocalLabel(data.label);
  }, [data.label]);

  // When unmounting (e.g. user clicked map), commit pending area label
  useEffect(() => {
    return () => {
      const trimmed = localLabelRef.current.trim();
      if (trimmed.length > 0 && trimmed !== data.label) {
        const el = engine.getElement(data.id);
        if (el && el.type === 'area') {
          const oldProps = { label: (el as Area).label };
          const newProps = { label: trimmed };
          const cmd = new UpdatePropertiesCommand(engine, data.id, oldProps, newProps);
          engine.history.execute(cmd);
        }
      }
    };
  }, [data.id, data.label, engine]);

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
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleBlur();
            inputRef.current?.blur();
          }
        }}
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

function BulkSeatCountField({
  commonSeatCount,
  tables,
  engine,
  onDone,
}: {
  commonSeatCount: number | null;
  tables: Table[];
  engine: ReturnType<typeof useEngine>;
  onDone: () => void;
}) {
  const [localValue, setLocalValue] = useState(commonSeatCount != null ? String(commonSeatCount) : '');

  useEffect(() => {
    setLocalValue(commonSeatCount != null ? String(commonSeatCount) : '');
  }, [commonSeatCount]);

  const handleCommit = () => {
    const parsed = parseInt(localValue, 10);
    if (Number.isNaN(parsed)) {
      setLocalValue(commonSeatCount != null ? String(commonSeatCount) : '');
      return;
    }
    const clamped = Math.max(MIN_SEATS_PER_TABLE, Math.min(MAX_SEATS_PER_TABLE, parsed));
    setLocalValue(String(clamped));
    const commands = tables
      .filter((t) => t.seatCount !== clamped)
      .map((t) => new ChangeTableSeatCountCommand(engine, t.id, clamped));
    if (commands.length > 0) {
      const cmd = commands.length === 1
        ? commands[0]
        : new CompoundCommand('Change Table Seat Counts', commands);
      engine.history.execute(cmd);
      onDone();
    }
  };

  return (
    <TextField
      label="Seats"
      type="number"
      fullWidth
      value={localValue}
      placeholder={commonSeatCount == null ? 'Mixed' : undefined}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      inputProps={{ min: MIN_SEATS_PER_TABLE, max: MAX_SEATS_PER_TABLE }}
      sx={{ mb: 2 }}
    />
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
  const [localLabel, setLocalLabel] = useState(data.label || '');
  const [localSeatCount, setLocalSeatCount] = useState(String(data.seatCount || 0));
  const inputRef = useRef<HTMLInputElement>(null);
  const localLabelRef = useRef(localLabel);
  localLabelRef.current = localLabel;

  useEffect(() => {
    setLocalLabel(data.label || '');
  }, [data.label]);

  useEffect(() => {
    setLocalSeatCount(String(data.seatCount || 0));
  }, [data.seatCount]);

  // Commit pending valid label on unmount
  useEffect(() => {
    return () => {
      const trimmed = localLabelRef.current.trim();
      if (trimmed.length > 0 && trimmed !== (data.label || '')) {
        if (!engine.isTableLabelTaken(trimmed, data.id)) {
          const el = engine.getElement(data.id);
          if (el) {
            const oldProps = { label: (el as Table).label };
            const newProps = { label: trimmed };
            const cmd = new UpdatePropertiesCommand(engine, data.id, oldProps, newProps);
            engine.history.execute(cmd);
          }
        }
      }
    };
  }, [data.id, data.label, engine]);

  const isEmpty = localLabel.trim().length === 0;
  const isDuplicate = !isEmpty && engine.isTableLabelTaken(localLabel.trim(), data.id);

  const handleLabelBlur = () => {
    const trimmed = localLabel.trim();
    if (trimmed.length > 0 && !engine.isTableLabelTaken(trimmed, data.id)) {
      onChange('label', trimmed);
    } else {
      setLocalLabel(data.label || '');
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

  // Derive category from contained seats so "Mixed" shows when seats have different categories
  const categoryFromSeats = useMemo(() => {
    if (!data.seatIds?.length) {
      const single = data.category || 'planta1';
      return { commonCategory: single, uniqueCategories: [single] as SeatCategory[] };
    }
    const categories = new Set<string>();
    for (const seatId of data.seatIds) {
      const seat = engine.getElement(seatId);
      if (seat && seat.type === 'seat') categories.add((seat as Seat).category || 'planta1');
    }
    const uniqueCategories = [...categories] as SeatCategory[];
    const commonCategory = categories.size === 1 ? uniqueCategories[0] : '';
    return { commonCategory, uniqueCategories };
  }, [data.id, data.seatIds, data.category, engine]);

  const labelError = isEmpty
    ? 'Label cannot be empty'
    : isDuplicate
      ? 'Label already in use'
      : undefined;

  return (
    <>
      <TextField
        label="Label"
        fullWidth
        inputRef={inputRef}
        value={localLabel}
        onChange={(e) => setLocalLabel(e.target.value)}
        onFocus={() => inputRef.current?.select()}
        onBlur={handleLabelBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleLabelBlur();
            inputRef.current?.blur();
          }
        }}
        helperText={labelError}
        error={isEmpty || isDuplicate}
        sx={{ mb: 2 }}
      />
      <FormControl fullWidth sx={{ mb: 2 }}>
        <InputLabel shrink>Category</InputLabel>
        <Select
          value={categoryFromSeats.commonCategory}
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
                {categoryFromSeats.uniqueCategories.map((cat) => (
                  <Box key={cat} sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: categoryColor(cat), mr: 0.5 }} />
                ))}
                <Typography variant="body2" sx={{ ml: 0.5, color: 'text.secondary' }}>
                  Mixed
                </Typography>
              </Box>
            );
          }}
          onChange={(e) => handleCategoryChange(e.target.value)}
        >
          {renderCategoryMenuItems()}
        </Select>
      </FormControl>
      <TextField
        label="Seats"
        type="number"
        fullWidth
        value={localSeatCount}
        onChange={(e) => setLocalSeatCount(e.target.value)}
        onBlur={() => {
          const parsed = parseInt(localSeatCount, 10);
          if (Number.isNaN(parsed)) {
            setLocalSeatCount(String(data.seatCount || 0));
            return;
          }
          const clamped = Math.max(MIN_SEATS_PER_TABLE, Math.min(MAX_SEATS_PER_TABLE, parsed));
          setLocalSeatCount(String(clamped));
          if (clamped !== data.seatCount) {
            const cmd = new ChangeTableSeatCountCommand(engine, data.id, clamped);
            engine.history.execute(cmd);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
        }}
        inputProps={{ min: MIN_SEATS_PER_TABLE, max: MAX_SEATS_PER_TABLE }}
        sx={{ mb: 2 }}
      />
    </>
  );
}
