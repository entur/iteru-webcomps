/**
 * Search and filter as one query field. The active filters sit as chips at the
 * start of the search box, the typed text follows them, and the filter button
 * closes the field — so the field reads in the order the query runs: these
 * filters, then this search within what they left. That ordering is what the
 * old "(from cached filter)" caption had to spell out.
 *
 * At most `MAX_TOKENS` chips show; the rest fold into a "+N" chip that opens
 * the panel, so filters never push the rest of the toolbar onto a new line.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { Badge, Box, Button, Chip, IconButton, InputAdornment, TextField, Tooltip } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import type { CollectionLabels, CollectionQuery, Column, FilterFields } from '../types';
import { activeFilterColumns, chipText, FilterPanel, withFilter } from './FilterPopover';

const MAX_TOKENS = 2; // chips shown before the rest fold into "+N"
const TOKEN_VALUE_MAX = 14; // characters of a chip's value before it is cut
const FIELD_W = 280, FIELD_W_FILTERED = 620; // the field widens while it carries chips
const INPUT_MIN_CH = 10; // typed text keeps this much room beside the chips
/** A compact count that stays inside the field's border. */
const BADGE_SX = { '& .MuiBadge-badge': { fontSize: '0.65rem', height: 16, minWidth: 16, px: 0.5 } } as const;
const ELLIPSIS = '…';

const shorten = (text: string): string =>
  text.length > TOKEN_VALUE_MAX ? `${text.slice(0, TOKEN_VALUE_MAX - 1)}${ELLIPSIS}` : text;

export interface QueryFieldProps {
  /** Render the text input (`'search'` tool). */
  search: boolean;
  /** Render the filter button, chips and panel (`'filter'` tool). */
  filter: boolean;
  columns: readonly Column[];
  filterFields: FilterFields;
  query: CollectionQuery;
  onQuery: (patch: Partial<CollectionQuery>) => void;
  labels: CollectionLabels;
}

/**
 * Render the query field: search input with filter chips and the filter
 * button inside it. With search trimmed, the button and chips stand alone on
 * the same line; with filtering trimmed, a plain search box.
 *
 * @param search       show the text input
 * @param filter       show the filter button, chips and panel
 * @param columns      resolved columns
 * @param filterFields the entity's generated `<Entity>FilterFields`
 * @param query        current query
 * @param onQuery      receives search / filters patches
 * @param labels       UI strings
 * @returns the field, or `null` when both tools are trimmed
 */
export function QueryField({ search, filter, columns, filterFields, query, onQuery, labels }: QueryFieldProps): React.ReactNode {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  if (!search && !filter) return null;

  const active = filter ? activeFilterColumns(columns, filterFields, query.filters) : [];
  const shown = active.slice(0, MAX_TOKENS);
  const folded = active.length - shown.length;
  const openPanel = (): void => setOpen(true);
  const remove = (key: string): void => onQuery({ filters: withFilter(query.filters, key, undefined) });

  const tokens = active.length ? (
    <Box role="group" aria-label={labels.activeFilters} sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
      {shown.map(c => {
        const text = chipText(query.filters[c.key]);
        return (
          <Chip
            key={c.key}
            size="small"
            label={`${c.label}: ${shorten(text)}`}
            title={`${c.label}: ${text}`}
            onDelete={() => remove(c.key)}
          />
        );
      })}
      {folded ? <Chip size="small" variant="outlined" label={`+${folded}`} aria-label={labels.moreFilters(folded)} onClick={openPanel} /> : null}
    </Box>
  ) : null;

  const trigger = filter ? (
    <Tooltip title={labels.filters}>
      <IconButton
        size="small"
        aria-label={labels.filters}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openPanel}
      >
        <Badge badgeContent={active.length} color="primary" overlap="circular" sx={BADGE_SX}>
          <FilterListIcon fontSize="small" />
        </Badge>
      </IconButton>
    </Tooltip>
  ) : null;

  const panel = filter ? (
    <FilterPanel
      anchor={open ? anchorRef.current : null}
      onClose={() => setOpen(false)}
      columns={columns}
      filterFields={filterFields}
      filters={query.filters}
      onChange={filters => onQuery({ filters })}
      labels={labels}
    />
  ) : null;

  // Backspace in an empty field takes the last filter back, as token fields do.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    const last = active[active.length - 1];
    if (e.key === 'Backspace' && !query.search && last) remove(last.key);
  };

  if (!search) {
    return (
      <Box data-query-field ref={anchorRef} sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 40 }}>
        <Button
          size="small"
          startIcon={
            <Badge badgeContent={active.length} color="primary">
              <FilterListIcon />
            </Badge>
          }
          aria-label={labels.filters}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={openPanel}
        >
          {labels.filters}
        </Button>
        {tokens}
        {panel}
      </Box>
    );
  }

  return (
    <Box data-query-field sx={{ width: active.length ? FIELD_W_FILTERED : FIELD_W, maxWidth: '100%' }}>
      <TextField
        ref={anchorRef}
        fullWidth
        size="small"
        placeholder={labels.searchPlaceholder}
        value={query.search}
        onChange={e => onQuery({ search: e.target.value })}
        onKeyDown={onKeyDown}
        slotProps={{
          htmlInput: { 'aria-label': labels.search, style: { minWidth: `${INPUT_MIN_CH}ch` } },
          input: {
            startAdornment: (
              <InputAdornment position="start" sx={{ gap: 1, maxHeight: 'none', mr: 0.5 }}>
                <SearchIcon fontSize="small" color="action" />
                {tokens}
              </InputAdornment>
            ),
            endAdornment: trigger ? <InputAdornment position="end">{trigger}</InputAdornment> : undefined,
          },
        }}
      />
      {panel}
    </Box>
  );
}
