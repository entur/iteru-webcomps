import { useState, type FC, type ReactNode } from 'react';
import { Box, Stack, Tab, Tabs, Typography } from '@mui/material';
import type { EntityDetailsFormProps, FieldSpec } from '../types';
import { getPath, setPath } from '../utils/paths';
import {
  hasPatched,
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
    errors,
    disabled: disabledProp,
    activeSection,
    onActiveSectionChange,
  }) => {
    const [active, setActive] = useState(0);
    // Empty sections are dropped by `resolveSections` itself, so the skeleton
    // and the form always agree on how many there are.
    const sections = resolveSections(fields, layout);
    const current = Math.min(active, Math.max(0, sections.length - 1));
    // Only the stacked variant is a scroll surface; flat and tabs have no
    // section to scroll to, so the spy stays off for them.
    const sectionRef = useSectionSpy({
      labels: sections.map(s => s.label),
      enabled: variant === 'stacked' && sections.length > 1,
      active: activeSection,
      onActiveChange: onActiveSectionChange,
    });

    const marks = hasPatched(fields, sections);
    // One row per field: the control, then — in a form with any patched field —
    // a fixed column that holds the `*` or stays empty, so every control keeps
    // the same width whether or not it is marked.
    const row = (key: string, control: ReactNode): ReactNode => (
      <Box key={key} sx={{ mb: 2, display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>{control}</Box>
        {marks && (
          <Box
            sx={{ width: PATCH_MARK_COL_PX, flexShrink: 0, textAlign: 'right', color: 'text.secondary' }}
          >
            {fields[key].patched && (
              <span title={PATCH_HINT} aria-label={PATCH_HINT} data-patch-mark>
                *
              </span>
            )}
          </Box>
        )}
      </Box>
    );

    const field = (
      { key, label, cols, options }: ResolvedField,
      _i: number,
      arr: ResolvedField[]
    ): ReactNode => {
      const spec = fields[key];

      if (spec.kind === 'grid') {
        return row(
          key,
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
      return row(key, control);
    };

    if (sections.length < 2) {
      return <Box sx={{ width: '100%', minWidth: 0 }}>{sections[0]?.fields.map(field)}</Box>;
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
              {s.fields.map(field)}
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
        {sections[current]?.fields.map(field)}
      </Box>
    );
  };
  Form.displayName = 'EntityDetailsForm';
  return Form;
}
