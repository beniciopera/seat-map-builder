'use client';
import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  Collapse,
  IconButton,
  TextField,
  Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useEditorStore } from '@/src/store/useEditorStore';
import { useEngine } from '@/src/ui/hooks/useEngine';
import type { Category } from '@/src/domain/categories';
import { generateCategoryId } from '@/src/domain/categories';
import { AddCategoryCommand } from '@/src/engine/commands/AddCategoryCommand';
import { DeleteCategoryCommand } from '@/src/engine/commands/DeleteCategoryCommand';
import { categoryColor } from '@/src/utils/color';

export function CategoryManager() {
  const engine = useEngine();
  const categories = useEditorStore((s) => s.categories);
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#9E9E9E');
  const [nameError, setNameError] = useState('');

  const handleStartAdd = () => {
    setAdding(true);
    setNewName('');
    setNewColor('#9E9E9E');
    setNameError('');
  };

  const handleCancelAdd = () => {
    setAdding(false);
    setNewName('');
    setNameError('');
  };

  const handleSubmitAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      setNameError('Name is required');
      return;
    }
    if (engine.isCategoryNameTaken(trimmed)) {
      setNameError('Name already in use');
      return;
    }
    const category: Category = {
      id: generateCategoryId(),
      name: trimmed,
      color: newColor,
      isDefault: false,
    };
    const cmd = new AddCategoryCommand(engine, category);
    engine.history.execute(cmd);
    setAdding(false);
    setNewName('');
    setNewColor('#9E9E9E');
    setNameError('');
  };

  const handleDelete = (category: Category) => {
    if (category.isDefault) return;
    if (engine.isCategoryInUse(category.id)) return;
    const cmd = new DeleteCategoryCommand(engine, category);
    engine.history.execute(cmd);
  };

  return (
    <Box sx={{ borderBottom: '1px solid #e0e0e0', bgcolor: 'background.paper' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2,
          py: 1,
          cursor: 'pointer',
        }}
        onClick={() => setExpanded((e) => !e)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
          <Typography variant="subtitle2" fontWeight={600}>
            Categories
          </Typography>
        </Box>
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ px: 2, pb: 2, minWidth: 0 }}>
          {categories.map((cat) => {
            const inUse = engine.isCategoryInUse(cat.id);
            const canDelete = !cat.isDefault && !inUse;
            return (
              <Box
                key={cat.id}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  py: 0.5,
                }}
              >
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    bgcolor: categoryColor(cat.id),
                    border: '1px solid rgba(0,0,0,0.2)',
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {cat.name}
                </Typography>
                {cat.isDefault ? (
                  <Typography variant="caption" color="text.secondary">
                    Default
                  </Typography>
                ) : (
                  <Tooltip
                    title={inUse ? 'Category is in use by seats, rows, or tables' : 'Delete category'}
                  >
                    <span>
                      <IconButton
                        size="small"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(cat);
                        }}
                        disabled={!canDelete}
                        aria-label="Delete category"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
              </Box>
            );
          })}
          {adding ? (
            <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <TextField
                size="small"
                placeholder="Category name"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setNameError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmitAdd();
                  }
                }}
                error={!!nameError}
                helperText={nameError}
                fullWidth
                autoFocus
              />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  size="small"
                  type="color"
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  sx={{ width: 48, minWidth: 48, '& .MuiInputBase-input': { p: 0.5, cursor: 'pointer' } }}
                />
                <Button size="small" variant="contained" onClick={handleSubmitAdd}>
                  Add
                </Button>
                <Button size="small" onClick={handleCancelAdd}>
                  Cancel
                </Button>
              </Box>
            </Box>
          ) : (
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={handleStartAdd}
              sx={{ mt: 1 }}
            >
              Add Category
            </Button>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
