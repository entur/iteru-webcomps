/**
 * Card flow layout: one MUI `Card` per row in a CSS auto-fill grid. Display
 * only — the rows it gets are already filtered, sorted, paged and keyed.
 * Imports nothing from `@mui/x-data-grid`, so a cards-only host never loads it.
 */
import { Fragment, type ReactNode } from 'react';
import { Box, Card, CardContent, Chip, Typography, type CardProps, type TypographyProps } from '@mui/material';
import type { CollectionLabels, Column, KeyedRow, ResolvedCard } from '../types';
import { displayValue, EMPTY_TEXT, fullTitle, valueList } from '../utils/values';

// A card never gets narrower than its size's minimum (or the whole row, on a
// screen narrower than that); the row wraps instead.
const CARD_MIN_PX = { sm: 260, big: 320 } as const;
// The picture area a big card leaves at its top: the 3D preview's box shape.
const MEDIA_ASPECT = '16 / 10';
const CHIP_KINDS: readonly Column['spec']['kind'][] = ['enum', 'enumMulti'];

/** One value as text: the shown form as a card reads it, the full one on hover, a dash when empty. */
const ValueText = ({
  row,
  col,
  labels,
  ...typography
}: { row: unknown; col: Column; labels: CollectionLabels } & TypographyProps) => (
  <Typography noWrap title={fullTitle(row, col)} {...typography}>
    {col.cardText(displayValue(row, col, labels), row) || EMPTY_TEXT}
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

/** `sm`: text only. `big`: wider, with a picture area above the text. */
export type CardSize = keyof typeof CARD_MIN_PX;

export interface CardsViewProps {
  /** The visible page, keyed (`keyRows`). */
  rows: readonly KeyedRow[];
  card: ResolvedCard;
  labels: CollectionLabels;
  /** Default `sm`. */
  size?: CardSize;
  /** `big` only: what fills a row's picture area; blank when omitted. */
  media?: (row: unknown) => ReactNode;
  cardProps?: CardProps;
}

/** The picture area at the top of a big card: always there, so every card has
 *  the same shape whether or not the host fills it. */
const CardMediaArea = ({ children }: { children?: ReactNode }) => (
  <Box
    data-card-media=""
    aria-hidden={children == null || children === false ? true : undefined}
    sx={{
      aspectRatio: MEDIA_ASPECT,
      bgcolor: 'action.hover',
      borderBottom: 1,
      borderColor: 'divider',
      overflow: 'hidden',
      '& > img': { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
    }}
  >
    {children}
  </Box>
);

/**
 * Render rows as a wrapping grid of cards.
 *
 * @param rows      the visible page, keyed
 * @param card      resolved title, subtitle and body fields
 * @param labels    yes/no wording for switches
 * @param size      `sm` (default) or `big`: wider, with a picture area on top
 * @param media     `big` only: fills a row's picture area
 * @param cardProps spread onto every `Card`
 * @returns the card list
 */
export function CardsView({ rows, card, labels, size = 'sm', media, cardProps }: CardsViewProps): React.ReactNode {
  return (
    <Box
      role="list"
      data-card-size={size}
      sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_MIN_PX[size]}px, 100%), 1fr))`, gap: 2 }}
    >
      {rows.map(({ key, entity: row }) => (
        <Card key={key} role="listitem" variant="outlined" {...cardProps}>
          {size === 'big' ? <CardMediaArea>{media?.(row)}</CardMediaArea> : null}
          <CardContent>
            {card.title ? (
              <ValueText row={row} col={card.title} labels={labels} variant="subtitle1" component="div" />
            ) : (
              <Typography variant="subtitle1" component="div">
                {EMPTY_TEXT}
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
