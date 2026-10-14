/**
 * Card flow layout: one MUI `Card` per row in a CSS auto-fill grid. Display
 * only — the rows it gets are already filtered, sorted and paged. Imports
 * nothing from `@mui/x-data-grid`, so a cards-only host never loads it.
 */
import { Fragment, useMemo } from 'react';
import { Box, Card, CardContent, Chip, Typography, type CardProps } from '@mui/material';
import type { CollectionLabels, Column, ResolvedCard } from '../types';
import { displayValue, formatValue, rawValue, rowKeys } from '../utils/values';

const CARD_MIN_PX = 260; // a card never gets narrower; the row wraps instead
const EMPTY = '—';

/** The full value as a hover title, where the shown one is shortened. */
const fullTitle = (row: unknown, col: Column): string | undefined => {
  const full = formatValue(row, col.spec);
  return full !== displayValue(row, col) ? full : undefined;
};

const CardValue = ({ row, col, labels }: { row: unknown; col: Column; labels: CollectionLabels }) => {
  const { kind } = col.spec;
  const raw = rawValue(row, col.spec);
  const chips = kind === 'enumMulti' && Array.isArray(raw) ? raw.filter(x => x != null).map(String) : kind === 'enum' && raw != null ? [String(raw)] : [];
  if (chips.length) {
    return (
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
        {chips.map(c => (
          <Chip key={c} size="small" variant="outlined" label={c} />
        ))}
      </Box>
    );
  }
  return (
    <Typography variant="body2" noWrap title={fullTitle(row, col)}>
      {displayValue(row, col, labels) || EMPTY}
    </Typography>
  );
};

export interface CardsViewProps {
  rows: readonly unknown[];
  card: ResolvedCard;
  labels: CollectionLabels;
  cardProps?: CardProps;
}

/**
 * Render rows as a wrapping grid of cards.
 *
 * @param rows      the visible page
 * @param card      resolved title, subtitle and body fields
 * @param labels    yes/no wording for switches
 * @param cardProps spread onto every `Card`
 * @returns the card list
 */
export function CardsView({ rows, card, labels, cardProps }: CardsViewProps): React.ReactNode {
  const keys = useMemo(() => rowKeys(rows), [rows]);
  return (
    <Box
      role="list"
      sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_PX}px, 1fr))`, gap: 2 }}
    >
      {rows.map((row, i) => (
        <Card key={keys[i]} role="listitem" variant="outlined" {...cardProps}>
          <CardContent>
            <Typography variant="subtitle1" component="div" noWrap title={card.title && fullTitle(row, card.title)}>
              {(card.title && displayValue(row, card.title, labels)) || EMPTY}
            </Typography>
            {card.subtitle ? (
              <Typography variant="body2" color="text.secondary" noWrap title={fullTitle(row, card.subtitle)}>
                {displayValue(row, card.subtitle, labels) || EMPTY}
              </Typography>
            ) : null}
            <Box
              component="dl"
              sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 1.5, rowGap: 0.5, m: 0, mt: 1 }}
            >
              {card.fields.map(col => (
                <Fragment key={col.key}>
                  <Typography component="dt" variant="caption" color="text.secondary">
                    {col.label}
                  </Typography>
                  <Box component="dd" sx={{ m: 0, minWidth: 0 }}>
                    <CardValue row={row} col={col} labels={labels} />
                  </Box>
                </Fragment>
              ))}
            </Box>
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
