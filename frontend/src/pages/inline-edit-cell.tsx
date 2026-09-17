import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Box,
  TextField,
  CircularProgress,
  Menu,
  MenuItem,
  Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import { EMPTY_VALUE } from '@/utils';

const HOVER_ICON_SX = {
  fontSize: 12,
  opacity: 0,
  color: 'text.disabled',
  transition: 'opacity .1s',
  flexShrink: 0,
} as const;

const CELL_SX = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  cursor: 'pointer',
  maxWidth: '100%',
  '&:hover .inline-edit-icon': { opacity: 1 },
} as const;

interface InlineTextCellProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  renderDisplay?: (value: string) => ReactNode;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  maxLength?: number;
  /** Constrains display width and shows a tooltip with the full value on hover. */
  maxWidth?: number | string;
  /** When true, render the display only; no click-to-edit affordance. */
  readOnly?: boolean;
  'aria-label'?: string;
}

export function InlineTextCell({
  value,
  onSave,
  renderDisplay,
  placeholder,
  allowEmpty = true,
  emptyLabel = EMPTY_VALUE,
  maxLength,
  maxWidth,
  readOnly = false,
  'aria-label': ariaLabel,
}: InlineTextCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const startEdit = () => {
    if (pending) return;
    setDraft(value);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(value);
    setEditing(false);
  };

  const commitEdit = async () => {
    const trimmed = draft.trim();
    if (!allowEmpty && !trimmed) {
      cancelEdit();
      return;
    }
    if (trimmed === value.trim()) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      setDraft(value);
      setEditing(false);
    } finally {
      setPending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void commitEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  };

  if (readOnly) {
    if (!value) {
      return <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{emptyLabel}</Box>;
    }
    const node = renderDisplay ? renderDisplay(value) : value;
    if (maxWidth) {
      return (
        <Tooltip title={value} placement="top" enterDelay={400}>
          <Box component="span" sx={{ display: 'inline-block', maxWidth, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>
            {node}
          </Box>
        </Tooltip>
      );
    }
    return <>{node}</>;
  }

  if (editing) {
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
        <TextField
          inputRef={inputRef}
          value={draft}
          size="small"
          variant="standard"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => void commitEdit()}
          disabled={pending}
          placeholder={placeholder}
          slotProps={{ htmlInput: { maxLength, 'aria-label': ariaLabel } }}
          sx={{ minWidth: 80, '& .MuiInput-input': { py: 0.25, fontSize: 13 } }}
        />
        {pending && <CircularProgress size={12} thickness={5} />}
      </Box>
    );
  }

  const display = value
    ? (renderDisplay ? renderDisplay(value) : value)
    : <Box component="span" sx={{ color: 'text.disabled', fontStyle: 'italic' }}>{emptyLabel}</Box>;

  const displaySpan = (
    <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', ...(maxWidth ? { maxWidth } : {}) }}>
      {display}
    </Box>
  );

  return (
    <Box
      role="button"
      tabIndex={0}
      aria-label={ariaLabel ?? 'edit field'}
      onClick={startEdit}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(); } }}
      sx={CELL_SX}
    >
      {maxWidth && value ? (
        <Tooltip title={value} placement="top" enterDelay={400}>
          {displaySpan}
        </Tooltip>
      ) : displaySpan}
      {pending ? (
        <CircularProgress size={12} thickness={5} />
      ) : (
        <EditIcon className="inline-edit-icon" sx={HOVER_ICON_SX} />
      )}
    </Box>
  );
}

export interface InlineSelectOption {
  value: string;
  label: string;
  renderOption?: ReactNode;
}

interface InlineSelectCellProps {
  value: string;
  options: InlineSelectOption[];
  onSave: (value: string) => Promise<void>;
  renderDisplay: (value: string) => ReactNode;
  /** When true, render the display only; no click-to-open menu. */
  readOnly?: boolean;
  'aria-label'?: string;
}

export function InlineSelectCell({
  value,
  options,
  onSave,
  renderDisplay,
  readOnly = false,
  'aria-label': ariaLabel,
}: InlineSelectCellProps) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [pending, setPending] = useState(false);

  const handleSelect = async (newValue: string) => {
    setAnchor(null);
    if (newValue === value) return;
    setPending(true);
    try {
      await onSave(newValue);
    } catch {
      // parent surfaces toast; revert is implicit via refetch
    } finally {
      setPending(false);
    }
  };

  if (readOnly) {
    return <>{renderDisplay(value)}</>;
  }

  return (
    <>
      <Box
        role="button"
        tabIndex={0}
        aria-label={ariaLabel ?? 'edit field'}
        onClick={(e) => !pending && setAnchor(e.currentTarget)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !pending) {
            e.preventDefault();
            setAnchor(e.currentTarget);
          }
        }}
        sx={CELL_SX}
      >
        {pending ? <CircularProgress size={12} thickness={5} /> : renderDisplay(value)}
        <EditIcon className="inline-edit-icon" sx={HOVER_ICON_SX} />
      </Box>
      <Menu
        anchorEl={anchor}
        open={!!anchor}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { minWidth: 160 } } }}
      >
        {options.map((opt) => (
          <MenuItem
            key={opt.value}
            selected={opt.value === value}
            onClick={() => void handleSelect(opt.value)}
          >
            {opt.renderOption ?? opt.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
