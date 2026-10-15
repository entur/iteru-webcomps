/**
 * Shaped loading placeholder for an entity form, plus the fade that replaces it.
 *
 * Purely presentational. The shape is *derived* — `resolveSections` gives the
 * same sections and fields the real form will draw, and each placeholder is
 * sized and placed by its field's `kind` and width. So the skeleton cannot drift from the form it
 * stands in for: a new entity, an edited `layout` or a changed `variant`
 * reshapes both from one call, with no row counts to keep in sync.
 *
 * The data-aware wrappers render this while a record loads; a host driving the
 * presentational form directly can render it during its own fetch.
 */
import type { ReactNode } from 'react';
import { Box, Grid, Skeleton, Stack } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import type { FieldKind, FieldSpec, KindWidths, Layout, LayoutVariant, PatchedDisplay } from '../types';
import { gridSize, marked, PATCH_MARK_COL_PX, resolveSections } from '../utils/sections';

// Placeholder geometry. Row heights track the controls they stand in for, so
// the layout does not jump when the real inputs land.
const ROW_H = 56, SWITCH_H = 30, MULTI_H = 72, GRID_H = 180;
const TAB_H = 30, TAB_W = 84, HEADING_H = 18, HEADING_W = 140;
const ROW_GAP = 2, COL_GAP = 2, SECTION_GAP = 3, TAB_GAP = 1, BAR_GAP = 2;
// Arrival fade. Keyframe names are global in Emotion — prefix as EditFooter does.
const FADE_MS = 220, FADE_KEYFRAMES = 'nmrFormArrive', FADE_OFFSET_PX = 4;
const REDUCED = '@media (prefers-reduced-motion: reduce)';
const DEFAULT_ARIA_LABEL = 'Loading form';

/** Placeholder height per control family — a switch is a chip, a grid is a
 *  table, and the rest are single-line inputs. */
const KIND_H: Record<FieldKind, number> = {
  text: ROW_H,
  number: ROW_H,
  name: ROW_H,
  enum: ROW_H,
  date: ROW_H,
  datetime: ROW_H,
  reference: ROW_H,
  enumMulti: MULTI_H,
  switch: SWITCH_H,
  grid: GRID_H,
};

export interface FormSkeletonProps {
  /** The entity's generated `FIELDS` registry — the shape source. */
  fields: Record<string, FieldSpec>;
  /** Same whitelist the form will receive; omitted → every registry field. */
  layout?: Layout;
  /** Same presentation the form will use, for ≥2 sections. */
  variant?: LayoutVariant;
  /** Same patched-field display the form will use: `hide` drops their rows,
   *  anything but `mark` drops the mark column. */
  patched?: PatchedDisplay;
  /** Same per-kind widths the form will use, so each placeholder takes the
   *  share of the row its control will. */
  widths?: KindWidths;
  /** Announced by screen readers. English default — localization is the host's
   *  job, this library carries no i18n runtime. */
  ariaLabel?: string;
  /** Applied after every default, so a host can restyle the block. */
  sx?: SxProps<Theme>;
}

/**
 * The half of {@link FormSkeletonProps} a host may set when the skeleton is
 * rendered for it — by a data-aware wrapper, which derives the rest from the
 * entity registry and the props already passed to the form.
 */
export type FormSkeletonHostProps = Omit<FormSkeletonProps, 'fields' | 'layout' | 'variant' | 'patched' | 'widths'>;

/**
 * Draw the placeholder standing in for an entity form mid-load.
 *
 * @param props see {@link FormSkeletonProps}
 * @returns a busy live region shaped like the form that is about to replace it
 */
export function FormSkeleton({
  fields,
  layout,
  variant = 'tabs',
  patched = 'mark',
  widths,
  ariaLabel = DEFAULT_ARIA_LABEL,
  sx,
}: FormSkeletonProps) {
  const sections = resolveSections(fields, layout, patched, widths);
  // Mirror the form: a tab bar shows one panel at a time, stacked shows all.
  const tabbed = sections.length > 1 && variant === 'tabs';
  const shown = tabbed ? sections.slice(0, 1) : sections;

  return (
    <Box
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      sx={[
        {
          width: '100%',
          minWidth: 0,
          // MUI's wave ships no reduced-motion guard of its own.
          [REDUCED]: { '& .MuiSkeleton-root': { animation: 'none' } },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {tabbed && (
        <Stack direction="row" spacing={TAB_GAP} sx={{ mb: BAR_GAP }}>
          {sections.map(s => (
            <Skeleton
              key={s.label}
              data-nmr-skeleton="tab"
              variant="rounded"
              animation="wave"
              width={TAB_W}
              height={TAB_H}
            />
          ))}
        </Stack>
      )}

      <Stack spacing={SECTION_GAP} sx={{ minWidth: 0 }}>
        {shown.map(s => (
          <Box key={s.label} sx={{ minWidth: 0 }}>
            {/* Tabs name their own section; stacked panels need the heading. */}
            {!tabbed && s.label && (
              <Skeleton
                data-nmr-skeleton="heading"
                variant="text"
                animation="wave"
                width={HEADING_W}
                height={HEADING_H}
                sx={{ mb: 1 }}
              />
            )}
            <Grid container columnSpacing={COL_GAP}>
              {s.fields.map(f => (
                <Grid key={f.key} size={gridSize(f.width)} data-nmr-width={f.width} sx={{ minWidth: 0 }}>
                  <Skeleton
                    data-nmr-skeleton="field"
                    data-nmr-kind={fields[f.key].kind}
                    variant="rounded"
                    animation="wave"
                    height={KIND_H[fields[f.key].kind]}
                    // A marked control ends in the form's `*` cell; leave that
                    // width free so the arriving control is exactly as wide.
                    sx={{ mb: ROW_GAP, mr: `${marked(fields[f.key], patched) ? PATCH_MARK_COL_PX : 0}px` }}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

export interface FormArrivalProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
}

/**
 * Fade in a form that has just arrived, replacing {@link FormSkeleton}.
 *
 * Mounts fresh when the load settles, so the animation marks the arrival rather
 * than every render. Suppressed under `prefers-reduced-motion`.
 *
 * @param props children to reveal, plus optional `sx`
 * @returns the children wrapped in a one-shot fade
 */
export function FormArrival({ children, sx }: FormArrivalProps) {
  return (
    <Box
      sx={[
        {
          animation: `${FADE_KEYFRAMES} ${FADE_MS}ms ease-out`,
          [`@keyframes ${FADE_KEYFRAMES}`]: {
            from: { opacity: 0, transform: `translateY(${FADE_OFFSET_PX}px)` },
            to: { opacity: 1, transform: 'none' },
          },
          [REDUCED]: { animation: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
