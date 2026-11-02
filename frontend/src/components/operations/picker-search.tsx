import { InputAdornment, TextField } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

/** The search box shared by step 3's equipment picker and step 4's transport list, so the two read as one control. */
export function PickerSearch({ value, onChange, placeholder, label }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <TextField
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={e => { onChange(e.target.value); }}
      sx={{
        flex: '1 1 200px', maxWidth: 400,
        '& .MuiInputBase-root': { height: 30, background: 'var(--shf-graphite-700)', color: 'var(--shf-paper)', fontFamily: 'var(--font-body)', fontSize: 13 },
        '& .MuiOutlinedInput-notchedOutline': { borderColor: 'var(--shf-graphite-600)' },
      }}
      slotProps={{
        htmlInput: { 'aria-label': label },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon sx={{ color: 'var(--shf-graphite-400)', fontSize: 18 }} />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
