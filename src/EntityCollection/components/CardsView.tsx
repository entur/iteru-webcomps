/**
 * Card flow layout: one MUI `Card` per row in a CSS auto-fill grid. Display
 * only — the rows it gets are already filtered, sorted, paged and keyed.
 * Imports nothing from `@mui/x-data-grid`, so a cards-only host never loads it.
 */
import { Fragment } from 'react';
import { Box, Card, CardContent, Chip, Typography, type CardProps, type TypographyProps } from '@mui/material';
import type { CollectionLabels, Column, KeyedRow, ResolvedCard } from '../types';
import { displayValue, fullTitle, valueList } from '../utils/values';

const CARD_MIN_PX = 260; // a card never gets narrower; the row wraps instead
const EMPTY = '—';
const CHIP_KINDS: readonly Column['spec']['kind'][] = ['enum', 'enumMulti'];

/** One value as text: the shown form, the full one on hover, a dash when empty. */
const ValueText = ({
  row,
  col,
  labels,
  ...typography
}: { row: unknown; col: Column; labels: CollectionLabels } & TypographyProps) => (
  <Typography noWrap title={fullTitle(row, col)} {...typography}>
    {displayValue(row, col, labels) || EMPTY}
  </Typography>
);

const CardValue = ({ row, col, labels }: { row: unknown; col: Column; labels: CollectionLabels }) => {
  const chips = CHIP_KINDS.includes(col.spec.kind) ? valueList(row, col.spec) : [];
  return chips.length ? (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
      {chips.map(c => (
        <Chip key={c} size="small" variant="outlined" label={c} />
      ))}
    </Box>
  ) : (
    <ValueText row={row} col={col} labels={labels} variant="body2" />
  );
};

export interface CardsViewProps {
  /** The visible page, keyed (`keyRows`). */
  rows: readonly KeyedRow[];
  card: ResolvedCard;
  labels: CollectionLabels;
  cardProps?: CardProps;
}

/**
 * Render rows as a wrapping grid of cards.
 *
 * @param rows      the visible page, keyed
 * @param card      resolved title, subtitle and body fields
 * @param labels    yes/no wording for switches
 * @param cardProps spread onto every `Card`
 * @returns the card list
 */
export function CardsView({ rows, card, labels, cardProps }: CardsViewProps): React.ReactNode {
  return (
    <Box
      role="list"
      sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${CARD_MIN_PX}px, 1fr))`, gap: 2 }}
    >
      {rows.map(({ key, entity: row }) => (
        <Card key={key} role="listitem" variant="outlined" {...cardProps}>
          <CardContent>
            {card.title ? (
              <ValueText row={row} col={card.title} labels={labels} variant="subtitle1" component="div" />
            ) : (
              <Typography variant="subtitle1" component="div">
                {EMPTY}
              </Typography>
            )}
            {card.subtitle ? (
              <ValueText row={row} col={card.subtitle} labels={labels} variant="body2" color="text.secondary" />
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
