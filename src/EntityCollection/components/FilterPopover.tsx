/**
 * The shared filter panel: a popover with one control per field sobek can
 * filter on, and the remaining fields listed disabled. Controlled and
 * stateless — the trigger (and the active-filter chips) live in `QueryField`;
 * this edits `filters` through `onChange` and works the same above either view.
 */
import { Autocomplete, Divider, List, ListItem, ListItemText, ListSubheader, Popover, Stack, TextField } from '@mui/material';
import type { CollectionLabels, CollectionQuery, Column, FilterFields, FilterValue } from '../types';
import { asList, asText } from '../utils/filters';

const POPOVER_W = 320, BLOCKED_MAX_H = 220;

export type Filters = CollectionQuery['filters'];

/**
 * `filters` with `key` set, or removed when the new value is `undefined`.
 *
 * @param filters current conditions
 * @param key     field key
 * @param value   new condition; `undefined` removes it
 * @returns the next conditions
 */
export const withFilter = (filters: Filters, key: string, value: FilterValue | undefined): Filters => {
  const { [key]: _dropped, ...rest } = filters;
  return value === undefined ? rest : { ...rest, [key]: value };
};

/**
 * A condition as display text: trimmed text, or a comma-joined list.
 *
 * @param value the condition
 * @returns display text; empty for an empty condition
 */
export const chipText = (value: FilterValue): string =>
  typeof value === 'string' ? value.trim() : asList(value).join(', ');

/**
 * The columns carrying a non-empty condition, in column order.
 *
 * @param columns      resolved columns
 * @param filterFields the entity's generated `<Entity>FilterFields`
 * @param filters      current conditions
 * @returns the filtered-on columns
 */
export const activeFilterColumns = (columns: readonly Column[], filterFields: FilterFields, filters: Filters): Column[] =>
  columns.filter(c => filterFields[c.key] && chipText(filters[c.key] ?? '') !== '');

export interface FilterPanelProps {
  /** Element the panel opens from; `null` keeps it closed. */
  anchor: HTMLElement | null;
  onClose: () => void;
  columns: readonly Column[];
  filterFields: FilterFields;
  filters: Filters;
  onChange: (filters: Filters) => void;
  labels: CollectionLabels;
}

/**
 * Render the filter panel.
 *
 * @param anchor       element to open from; `null` = closed
 * @param onClose      close request (outside click, Escape)
 * @param columns      resolved columns (the fields on offer)
 * @param filterFields the entity's generated `<Entity>FilterFields`
 * @param filters      current conditions
 * @param onChange     receives the whole next `filters` object
 * @param labels       UI strings
 * @returns the popover
 */
export function FilterPanel({ anchor, onClose, columns, filterFields, filters, onChange, labels }: FilterPanelProps): React.ReactNode {
  const open = columns.filter(c => filterFields[c.key]);
  const blocked = columns.filter(c => !filterFields[c.key]);

  return (
    <Popover
      open={!!anchor}
      anchorEl={anchor}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      slotProps={{ paper: { role: 'dialog', 'aria-label': labels.filters, sx: { width: POPOVER_W, mt: 0.5 } } }}
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
  );
}
