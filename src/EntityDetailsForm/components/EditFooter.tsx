/**
 * Sticky Save/Cancel footer for an edit session.
 *
 * Purely presentational: it owns no state and performs no save. The data-aware
 * wrappers hand it `dirty`/`saving` and the hook's `handleSave`/`reset`; a host
 * driving the presentational form directly supplies its own equivalents.
 *
 * Dormant while clean, lit when there is something to act on — the signal that
 * distinguishes "nothing to lose" from "unsaved work" without the host having
 * to read the form's internals.
 */
import { Box, Button, Stack, Typography, type ButtonProps } from '@mui/material';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';

// Status dot geometry + the halo it pulses out to while dirty.
const DOT_PX = 8, PULSE_SCALE = 2.8, PULSE_MS = 1600;
// Keyframe names are global in Emotion — prefix to avoid colliding with a host's.
const PULSE_KEYFRAMES = 'nmrEditFooterPulse';
// Tint strength for the dirty footer band.
const DIRTY_TINT = 0.08;

/** Every user-visible string, so a host can localize without an i18n dep here. */
export interface EditFooterLabels {
  save?: string;
  cancel?: string;
  /** Status shown while the form matches the server. */
  clean?: string;
  /** Status shown while the form has unsaved edits. */
  dirty?: string;
  /** Status shown while a save is in flight. */
  saving?: string;
}

const DEFAULT_LABELS: Required<EditFooterLabels> = {
  save: 'Save',
  cancel: 'Cancel',
  clean: 'All changes saved',
  dirty: 'Unsaved changes',
  saving: 'Saving…',
};

/** Per-button MUI overrides. The controlled props — `disabled`, `onClick` and
 *  the label — are applied after these, so the inert-while-clean contract holds
 *  whatever a host passes. */
export interface EditFooterSlotProps {
  save?: ButtonProps;
  cancel?: ButtonProps;
}

export interface EditFooterProps {
  /** Whether the form diverges from the entity the server last returned. */
  dirty: boolean;
  /** A save is in flight — locks both actions. */
  saving?: boolean;
  /** Lock both actions regardless of `dirty` (e.g. the form is still loading). */
  disabled?: boolean;
  onSave: () => void;
  /** Discard edits. Fired only when there is something to discard. */
  onCancel: () => void;
  labels?: EditFooterLabels;
  /** Per-button MUI overrides (variant, colour, size…). */
  slotProps?: EditFooterSlotProps;
  /** Applied after every default, so a host can restyle the band — including
   *  `backgroundImage: 'none'` to drop the dirty tint. The default is sticky to
   *  the bottom of the scroll container. */
  sx?: SxProps<Theme>;
}

/**
 * Render the action footer for an edit session.
 *
 * @param props see {@link EditFooterProps}
 * @returns a status line paired with Cancel/Save, both inert unless `dirty`
 */
export function EditFooter({
  dirty,
  saving = false,
  disabled = false,
  onSave,
  onCancel,
  labels,
  slotProps,
  sx,
}: EditFooterProps) {
  const l = { ...DEFAULT_LABELS, ...labels };
  // Nothing to save and nothing to discard when clean; while saving, a discard
  // would restore a baseline the in-flight request is about to replace.
  const inert = !dirty || saving || disabled;
  const status = saving ? l.saving : dirty ? l.dirty : l.clean;

  return (
    <Box
      sx={[
        {
          position: 'sticky',
          bottom: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          borderTop: 1,
          borderColor: dirty ? 'warning.main' : 'divider',
          // The band is sticky, so its own colour has to be opaque or the form
          // scrolls through it. The dirty tint therefore rides on top as a flat
          // gradient — the same trick MUI uses for dark-mode elevation overlays
          // — instead of being an `alpha()` colour that replaces the surface.
          backgroundColor: 'background.paper',
          backgroundImage: theme => {
            if (!dirty) return 'none';
            const tint = alpha(theme.palette.warning.main, DIRTY_TINT);
            return `linear-gradient(${tint}, ${tint})`;
          },
          boxShadow: dirty ? '0 -10px 28px -20px rgba(0,0,0,0.55)' : 'none',
          transition: theme =>
            theme.transitions.create(['background-color', 'border-color', 'box-shadow'], {
              duration: theme.transitions.duration.short,
            }),
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {/* `role=status` so the dirty/saving transition is announced, not just drawn. */}
      <Stack direction="row" alignItems="center" spacing={1} role="status">
        <Box sx={{ position: 'relative', width: DOT_PX, height: DOT_PX, display: 'inline-flex' }}>
          <Box
            sx={{
              width: DOT_PX,
              height: DOT_PX,
              borderRadius: '50%',
              bgcolor: dirty ? 'warning.main' : 'success.light',
              transition: theme => theme.transitions.create('background-color'),
            }}
          />
          {dirty && !saving && (
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                bgcolor: 'warning.main',
                animation: `${PULSE_KEYFRAMES} ${PULSE_MS}ms ease-out infinite`,
                [`@keyframes ${PULSE_KEYFRAMES}`]: {
                  '0%': { transform: 'scale(1)', opacity: 0.6 },
                  '70%, 100%': { transform: `scale(${PULSE_SCALE})`, opacity: 0 },
                },
                '@media (prefers-reduced-motion: reduce)': { animation: 'none', opacity: 0 },
              }}
            />
          )}
        </Box>
        <Typography
          variant="caption"
          sx={{ color: dirty ? 'warning.dark' : 'text.secondary', fontWeight: 500 }}
        >
          {status}
        </Typography>
      </Stack>

      <Stack direction="row" spacing={1}>
        <Button
          variant="outlined"
          color="inherit"
          size="small"
          {...slotProps?.cancel}
          disabled={inert}
          onClick={onCancel}
        >
          {l.cancel}
        </Button>
        <Button
          variant="contained"
          size="small"
          {...slotProps?.save}
          disabled={inert}
          onClick={onSave}
        >
          {l.save}
        </Button>
      </Stack>
    </Box>
  );
}
