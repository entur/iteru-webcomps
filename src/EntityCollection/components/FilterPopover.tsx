/**
 * The shared filter: a Filters button, a popover with one control per field
 * sobek can filter on, the remaining fields listed disabled, and the active
 * conditions as removable chips. Stateless — it edits `filters` through
 * `onChange` and works the same above either view.
 */
import { useState } from 'react';
import {
  Autocomplete,
  Button,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListSubheader,
  Popover,
  Stack,
  TextField,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import type { CollectionLabels, CollectionQuery, Column, FilterFields, FilterValue } from '../types';
import { asList, asText } from '../utils/filters';

const POPOVER_W = 320, BLOCKED_MAX_H = 220;

type Filters = CollectionQuery['filters'];

/** `filters` with `key` set, or removed when the new value is `undefined`. */
const withFilter = (filters: Filters, key: string, value: FilterValue | undefined): Filters => {
  const { [key]: _dropped, ...rest } = filters;
  return value === undefined ? rest : { ...rest, [key]: value };
};

const chipText = (value: FilterValue): string =>
  typeof value === 'string' ? value.trim() : asList(value).join(', ');

export interface FilterPopoverProps {
  columns: readonly Column[];
  filterFields: FilterFields;
  filters: Filters;
  onChange: (filters: Filters) => void;
  labels: CollectionLabels;
}

/**
 * Render the filter button, its popover and the active-filter chips.
 *
 * @param columns      resolved columns (the fields on offer)
 * @param filterFields the entity's generated `<Entity>FilterFields`
 * @param filters      current conditions
 * @param onChange     receives the whole next `filters` object
 * @param labels       UI strings
 * @returns the filter controls
 */
export function FilterPopover({ columns, filterFields, filters, onChange, labels }: FilterPopoverProps): React.ReactNode {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = columns.filter(c => filterFields[c.key]);
  const blocked = columns.filter(c => !filterFields[c.key]);
  const active = open.filter(c => chipText(filters[c.key] ?? '') !== '');

  return (
    <>
      <Button size="small" startIcon={<FilterListIcon />} onClick={e => setAnchor(e.currentTarget)}>
        {labels.filters}
      </Button>
      {active.map(c => (
        <Chip
          key={c.key}
          size="small"
          label={`${c.label}: ${chipText(filters[c.key])}`}
          onDelete={() => onChange(withFilter(filters, c.key, undefined))}
        />
      ))}
      <Popover
        open={!!anchor}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        slotProps={{ paper: { role: 'dialog', 'aria-label': labels.filters, sx: { width: POPOVER_W } } }}
      >
        <Stack spacing={2} sx={{ p: 2 }}>
          {open.map(c =>
            filterFields[c.key].op === 'contains' ? (
              <TextField
                key={c.key}
                size="small"
                label={c.label}
                value={asText(filters[c.key])}
                onChange={e => onChange(withFilter(filters, c.key, e.target.value))}
              />
            ) : (
              <Autocomplete
                key={c.key}
                multiple
                size="small"
                freeSolo={!c.spec.options}
                options={[...(c.spec.options ?? [])]}
                value={asList(filters[c.key])}
                onChange={(_e, next) => onChange(withFilter(filters, c.key, next))}
                renderInput={params => <TextField {...params} label={c.label} />}
              />
            )
          )}
        </Stack>
        {blocked.length ? (
          <>
            <Divider />
            <List dense disablePadding sx={{ maxHeight: BLOCKED_MAX_H, overflowY: 'auto' }}>
              <ListSubheader>{labels.notFilterable}</ListSubheader>
              {blocked.map(c => (
                <ListItem key={c.key} aria-disabled="true" sx={{ color: 'text.disabled' }}>
                  <ListItemText primary={c.label} />
                </ListItem>
              ))}
            </List>
          </>
        ) : null}
      </Popover>
    </>
  );
}
