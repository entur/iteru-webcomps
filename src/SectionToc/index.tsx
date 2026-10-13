/**
 * Table of contents for a sectioned view: one entry per section, the active one
 * marked. Presentational and standalone — it holds no state, observes no
 * scrolling and knows nothing about the form. The host owns `active` and wires
 * it to whatever scrolls (a stacked form's `activeSection` /
 * `onActiveSectionChange`, typically).
 */
import type { FC } from 'react';
import { Box, List, ListItemButton, ListItemText } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

/** Width of the rail marking the active entry; the idle rail is the same width,
 *  so selecting an entry never shifts its text. */
const RAIL_PX = 2;
const DEFAULT_LABEL = 'Sections';

export interface SectionTocProps {
  /** Section names, in the order they appear on the page. */
  sections: readonly string[];
  /** The section currently in view. Omitted or unknown → nothing is marked. */
  active?: string;
  /** Fired with the section the reader picked. */
  onSelect: (section: string) => void;
  /** Accessible name of the `<nav>` landmark (English default, no i18n runtime). */
  label?: string;
  /** Applied to the `<nav>` root, after the defaults. */
  sx?: SxProps<Theme>;
}

const ITEM_SX = {
  py: 0.25,
  borderLeft: `${RAIL_PX}px solid`,
  borderColor: 'divider',
  color: 'text.secondary',
  '&.Mui-selected': {
    borderColor: 'primary.main',
    color: 'text.primary',
    backgroundColor: 'transparent',
  },
  '&.Mui-selected:hover': { backgroundColor: 'action.hover' },
} as const;

/**
 * Render a list of sections as in-page navigation.
 *
 * @param props.sections section names, in page order
 * @param props.active the section currently in view
 * @param props.onSelect called with the picked section
 * @param props.label accessible name of the landmark; default `'Sections'`
 * @param props.sx styling for the `<nav>` root
 * @returns the navigation landmark, or `null` when there are no sections
 */
export const SectionToc: FC<SectionTocProps> = ({
  sections,
  active,
  onSelect,
  label = DEFAULT_LABEL,
  sx,
}) =>
  sections.length === 0 ? null : (
    <Box component="nav" aria-label={label} sx={sx}>
      <List dense disablePadding>
        {sections.map(section => (
          <ListItemButton
            key={section}
            selected={section === active}
            // "location", not "page": the entries are places within one view.
            aria-current={section === active ? 'location' : undefined}
            onClick={() => onSelect(section)}
            sx={ITEM_SX}
          >
            <ListItemText primary={section} slotProps={{ primary: { variant: 'body2', noWrap: true } }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
SectionToc.displayName = 'SectionToc';
