import { useState, type FC, type ReactNode } from 'react';
import { Box, Grid, Stack, Tab, Tabs, Typography } from '@mui/material';
import type { EntityDetailsFormProps, FieldSpec } from '../types';
import { getPath, setPath } from '../utils/paths';
import {
  gridSize,
  marked,
  PATCH_MARK_COL_PX,
  resolveSections,
  type ResolvedField,
} from '../utils/sections';
import { useSectionSpy } from '../hooks/useSectionSpy';
import { renderControl } from './controls';
import { ObjectGrid } from '../../ObjectGrid';

/** Theme spacing kept above a section scrolled into view by `activeSection`. */
const SECTION_SCROLL_MARGIN = 2;
/** Shown on hover and read out for a `patched` field's `*` (English default; no
 *  i18n runtime here). */
const PATCH_HINT = 'Not saved — not yet in the backend schema';
/** The `*` reads as a flag, not as punctuation beside the input. */
const PATCH_MARK_SX = { fontWeight: 'fontWeightBold', fontSize: '1.25rem', lineHeight: 1, color: 'error.main' } as const;
/** Theme spacing between controls sharing a row, and below each row. */
const COL_GAP = 2, ROW_GAP = 2;

/**
 * Build a presentational (dumb) entity form bound to a generated `FIELDS`
 * registry. Zero data fetching, zero state management — the host provides
 * `value`, `onChange`, and optional `errors` / `disabled`.
 */
export function createAbstractEntityDetailsForm<E>(
  fields: Record<string, FieldSpec>
): FC<EntityDetailsFormProps<E>> {
  const Form: FC<EntityDetailsFormProps<E>> = ({
    value,
    onChange,
    mode,
    layout,
    variant = 'tabs',
    slotProps,
    patched = 'mark',
    widths,
    errors,
    disabled: disabledProp,
    activeSection,
    onActiveSectionChange,
  }) => {
    const [active, setActive] = useState(0);
    // Empty sections are dropped by `resolveSections` itself, so the skeleton
    // and the form always agree on how many there are.
    const sections = resolveSections(fields, layout, patched, widths);
    const current = Math.min(active, Math.max(0, sections.length - 1));
    // Only the stacked variant is a scroll surface; flat and tabs have no
    // section to scroll to, so the spy stays off for them.
    const sectionRef = useSectionSpy({
      labels: sections.map(s => s.label),
      enabled: variant === 'stacked' && sections.length > 1,
      active: activeSection,
      onActiveChange: onActiveSectionChange,
    });

    // One grid cell per field, its share of the row by `width`: the control,
    // then — on a marked control only — a fixed cell holding the `*`, so the
    // mark sits after its own input, not at the end of the row.
    const row = ({ key, width }: ResolvedField, control: ReactNode): ReactNode => (
      <Grid
        key={key}
        size={gridSize(width)}
        data-nmr-width={width}
        sx={{ mb: ROW_GAP, display: 'flex', alignItems: 'center', minWidth: 0 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>{control}</Box>
        {marked(fields[key], patched) && (
          <Box sx={{ width: PATCH_MARK_COL_PX, flexShrink: 0, textAlign: 'right', ...PATCH_MARK_SX }}>
            <span title={PATCH_HINT} aria-label={PATCH_HINT} data-patch-mark>
              *
            </span>
          </Box>
        )}
      </Grid>
    );

    const field = (f: ResolvedField, _i: number, arr: ResolvedField[]): ReactNode => {
      const { key, label, cols, options } = f;
      const spec = fields[key];

      if (spec.kind === 'grid') {
        return row(
          f,
          <ObjectGrid
            rows={getPath(value, spec.path)}
            label={label}
            showLabel={arr.length > 1}
            cols={cols}
            dataGrid={slotProps?.grid?.dataGrid}
          />
        );
      }

      const disabled = disabledProp || mode === 'view' || !!spec.serverManaged || !!spec.locked;
      const control = renderControl({
        spec,
        label,
        value: getPath(value, spec.path),
        disabled,
        onChange: next => onChange(setPath(value, spec.path, next) as E),
        options,
        slotProps,
        error: errors?.[key],
      });
      return row(f, control);
    };

    // A section's fields fill rows left → right; a full-width one wraps alone.
    const rows = (fs: ResolvedField[]): ReactNode => (
      <Grid container columnSpacing={COL_GAP}>
        {fs.map(field)}
      </Grid>
    );

    if (sections.length < 2) {
      return <Box sx={{ width: '100%', minWidth: 0 }}>{rows(sections[0]?.fields ?? [])}</Box>;
    }

    if (variant === 'stacked') {
      return (
        <Stack spacing={3} sx={{ minWidth: 0 }}>
          {sections.map(s => (
            <Box
              key={s.label}
              ref={sectionRef(s.label)}
              data-section={s.label}
              sx={{ minWidth: 0, scrollMarginTop: t => t.spacing(SECTION_SCROLL_MARGIN) }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {s.label}
              </Typography>
              {rows(s.fields)}
            </Box>
          ))}
        </Stack>
      );
    }

    return (
      <Box sx={{ minWidth: 0 }}>
        <Tabs
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          {...slotProps?.tabs}
          value={current}
          onChange={(_e, v: number) => setActive(v)}
          sx={{ mb: 2, ...slotProps?.tabs?.sx }}
        >
          {sections.map(s => (
            <Tab key={s.label} label={s.label} />
          ))}
        </Tabs>
        {rows(sections[current]?.fields ?? [])}
      </Box>
    );
  };
  Form.displayName = 'EntityDetailsForm';
  return Form;
}
