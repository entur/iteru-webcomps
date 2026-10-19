/**
 * Card flow layout: one MUI `Card` per row in a CSS auto-fill grid. Display
 * only — the rows it gets are already filtered, sorted, paged and keyed.
 * Imports nothing from `@mui/x-data-grid`, so a cards-only host never loads it.
 */
import { Fragment, type ReactNode } from 'react';
import { alpha, Box, Card, CardContent, Chip, Typography, type CardProps, type TypographyProps } from '@mui/material';
import type { BigCardBgs, CollectionLabels, Column, KeyedRow, ResolvedCard } from '../types';
import { displayValue, EMPTY_TEXT, fullTitle, valueList } from '../utils/values';

// A card never gets narrower than its size's minimum (or the whole row, on a
// screen narrower than that); the row wraps instead.
const CARD_MIN_PX = { sm: 260, big: 320 } as const;
// The picture's shape at the card's width: the 3D preview's box. A big card's
// picture area too, unless a height is reserved for it.
const MEDIA_ASPECT = '16 / 10';
// The heading over a big card's picture sits at its bottom edge — on the 3D
// shot's light ground plane — over a fade rising from the edge (of the
// picture's background, else paper), opaque enough at the text to read over
// any picture.
const SCRIM_ALPHA = 0.85;
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

/** `sm`: text only. `big`: wider, with a picture area above the text and
 *  the title and subtitle laid over the picture's bottom edge. */
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
  /** `big` only: the picture area's height in px (`EntityCollectionProps`). */
  reservedHeightForImg?: number;
  /** `big` only: `[top, bottom]` backgrounds (`EntityCollectionProps`). */
  bigCardBgs?: BigCardBgs;
  cardProps?: CardProps;
}

type HeadingProps = { row: unknown; card: ResolvedCard; labels: CollectionLabels };

/** A card's first two lines: the title (a dash when there is none) and the subtitle. */
const CardHeading = ({ row, card, labels }: HeadingProps) => (
  <>
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
  </>
);

/**
 * The top of a big card: the picture area, always there so every card has the
 * same shape whether or not the host fills it, with the card's heading laid
 * over its bottom edge. The heading comes first in reading order; an unfilled
 * picture is hidden from assistive tech, the heading never is. The picture
 * stands on the area's bottom edge: a reserved height (which overrides the
 * area's own 16:10) cuts its top. `bg` is behind the picture and tints the
 * heading's fade.
 */
const CardMediaArea = ({
  media,
  reservedHeightForImg,
  bg,
  ...heading
}: HeadingProps & { media?: ReactNode; reservedHeightForImg?: number; bg?: string }) => (
  <Box
    sx={{
      position: 'relative',
      // Explicit, or a reserved height would size the width from the ratio.
      width: '100%',
      aspectRatio: MEDIA_ASPECT,
      height: reservedHeightForImg,
      // So media can place things in the part that shows (`cqh`), not in the
      // whole picture, whose top a reserved height cuts.
      containerType: 'size',
      bgcolor: bg ?? 'transparent',
      borderBottom: 1,
      borderColor: 'divider',
      overflow: 'hidden',
    }}
  >
    <Box
      data-card-heading=""
      sx={{
        position: 'absolute',
        insetInline: 0,
        bottom: 0,
        zIndex: 1,
        px: 2,
        pt: 2,
        pb: 1,
        background: t => {
          // color-mix, not alpha(): `bg` is any CSS colour, var() included.
          const end = bg
            ? `color-mix(in srgb, ${bg} ${SCRIM_ALPHA * 100}%, transparent)`
            : alpha(t.palette.background.paper, SCRIM_ALPHA);
          return `linear-gradient(transparent, ${end})`;
        },
      }}
    >
      <CardHeading {...heading} />
    </Box>
    <Box
      data-card-media=""
      aria-hidden={media == null || media === false ? true : undefined}
      sx={{
        position: 'absolute',
        insetInline: 0,
        bottom: 0,
        aspectRatio: MEDIA_ASPECT,
        '& > img': { display: 'block', width: '100%', height: '100%', objectFit: 'contain' },
      }}
    >
      {media}
    </Box>
  </Box>
);

/**
 * Render rows as a wrapping grid of cards.
 *
 * @param rows      the visible page, keyed
 * @param card      resolved title, subtitle and body fields
 * @param labels    yes/no wording for switches
 * @param size      `sm` (default) or `big`: wider, the heading over a picture on top
 * @param media     `big` only: fills a row's picture area
 * @param reservedHeightForImg `big` only: the picture area's height in px
 * @param bigCardBgs `big` only: `[top, bottom]` backgrounds; omit → transparent
 * @param cardProps spread onto every `Card`
 * @returns the card list
 */
export function CardsView({
  rows,
  card,
  labels,
  size = 'sm',
  media,
  reservedHeightForImg,
  bigCardBgs,
  cardProps,
}: CardsViewProps): React.ReactNode {
  const big = size === 'big';
  const [top, bottom] = bigCardBgs ?? [];
  // A big card is transparent: its picture area and its text paint their own.
  const cardSx = [big && { bgcolor: 'transparent' }, ...(Array.isArray(cardProps?.sx) ? cardProps.sx : [cardProps?.sx])];
  return (
    <Box
      role="list"
      data-card-size={size}
      sx={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(min(${CARD_MIN_PX[size]}px, 100%), 1fr))`, gap: 2 }}
    >
      {rows.map(({ key, entity: row }) => (
        <Card key={key} role="listitem" variant="outlined" {...cardProps} sx={cardSx}>
          {big ? (
            <CardMediaArea
              row={row}
              card={card}
              labels={labels}
              media={media?.(row)}
              reservedHeightForImg={reservedHeightForImg}
              bg={top}
            />
          ) : null}
          <CardContent sx={big ? { bgcolor: bottom ?? 'transparent' } : undefined}>
            {big ? null : <CardHeading row={row} card={card} labels={labels} />}
            <Box
              component="dl"
              sx={{
                display: 'grid',
                gridTemplateColumns: 'auto minmax(0, 1fr)',
                columnGap: 1.5,
                rowGap: 0.5,
                m: 0,
                mt: big ? 0 : 1,
              }}
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
