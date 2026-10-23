import type { ReactNode } from 'react';
import { Autocomplete, Box, FormControlLabel, FormHelperText, MenuItem, Switch, TextField } from '@mui/material';
import type { TextFieldProps } from '@mui/material';
import type { ControlSlotProps, FieldSpec, RefOption } from '../types';
import { fromLocalInput, toLocalInput } from '../utils/datetime';

/** A MultilingualString-ish shape: only `.value` is edited; `.lang` is preserved. */
type Mls = { lang?: string | null; value?: string | null } | null | undefined;

/** Pin the input label above the field even when empty, so rows align whether
 *  or not a field carries a value (MUI otherwise rests it inside until populated). */
const SHRINK_LABEL = { inputLabel: { shrink: true } } as const;

/** Native `date`/`datetime-local` inputs have a UA intrinsic min-width that
 *  `fullWidth` doesn't override, so they overflow narrow rails (<~360px). Zero
 *  it out and let the TextField's full width drive the size. */
const NATIVE_INPUT_SX = { '& input': { minWidth: 0 } } as const;

/** Merge consumer TextField `slotProps` over `SHRINK_LABEL`, one slot-key deep so
 *  `inputLabel.shrink` survives unless the consumer explicitly overrides it. */
const mergeSlots = (extra?: TextFieldProps['slotProps']): TextFieldProps['slotProps'] =>
  !extra
    ? SHRINK_LABEL
    : { ...extra, inputLabel: { ...SHRINK_LABEL.inputLabel, ...extra.inputLabel } };

const numVal = (n: unknown): number | '' => (n == null ? '' : (n as number));
const numOr = (s: string): number | undefined => (s === '' ? undefined : Number(s));
const textOr = (s: string): string | undefined => (s === '' ? undefined : s);
/** Slice a stored ISO string down to a native date input's `YYYY-MM-DD`. */
const isoSlice = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '');
const mergeName = (cur: Mls, text: string): Mls =>
  text === '' ? undefined : { ...cur, value: text };
/** A stored code missing from the host's list is offered as its own option
 *  (label = the raw code), so the select can show it and a save can't blank it. */
const withStored = (opts: RefOption[], cur: unknown): RefOption[] =>
  typeof cur === 'string' && cur !== '' && !opts.some(o => o.value === cur)
    ? [{ value: cur, label: cur }, ...opts]
    : opts;

/**
 * The line under a control — a validation error while one stands, else the
 * layout entry's help text — and the id that ties it to the control. MUI's
 * TextField derives the same `${id}-helper-text` id for its own helper line,
 * so every kind is described the same way.
 *
 * @param id    the control's id
 * @param error server validation error, if any
 * @param help  the layout entry's help text, if any
 * @returns the text to show and its id, both `undefined` when there is none
 */
export const helperLine = (
  id: string,
  error?: string,
  help?: string
): { note?: string; noteId?: string } => {
  const note = error ?? help;
  return note ? { note, noteId: `${id}-helper-text` } : {};
};

export interface ControlProps {
  spec: FieldSpec;
  /** DOM id for the control; its helper line's id is derived from it. */
  id: string;
  label: string;
  value: unknown;
  disabled: boolean;
  /** Emit the next raw value for this field's path (`undefined` clears it). */
  onChange: (next: unknown) => void;
  /** Option-dataset closure (the layout entry's `options`). `reference`: present
   *  → an Autocomplete, omit → a free-text id field. `text`: present → a select
   *  over the host's code values, omit → free text. Ignored by other kinds. */
  options?: () => RefOption[];
  /** Form-level per-kind MUI overrides. The slice for this field's `spec.kind`
   *  is applied to its control (see `ControlSlotProps`). */
  slotProps?: ControlSlotProps;
  /** Server validation error for this field (if any). Replaces `help` while set. */
  error?: string;
  /** The layout entry's help text, shown below the control. */
  help?: string;
}

/**
 * Render the MUI control for one field, dispatched by `spec.kind`. Read-only
 * (`disabled`) when the form is in view mode or the field is `serverManaged`.
 *
 * @param spec     Field descriptor (kind, options).
 * @param label    Resolved label (override or humanized default).
 * @param value    Raw value at the field's path.
 * @param disabled Whether the control is locked.
 * @param onChange Receives the next raw value.
 * @returns The control node.
 */
export function renderControl({
  spec,
  id,
  label,
  value,
  disabled,
  onChange,
  options,
  slotProps,
  error,
  help,
}: ControlProps): ReactNode {
  const { note, noteId } = helperLine(id, error, help);
  // Shared TextField props. `slotProps` is set per-kind below (each TextField
  // kind merges its own override over `SHRINK_LABEL`); the bare default keeps
  // the label shrunk when no override is supplied. With an `id`, TextField
  // points the input's `aria-describedby` at its helper line by itself.
  const common = {
    id,
    label,
    disabled,
    size: 'small' as const,
    fullWidth: true,
    slotProps: SHRINK_LABEL as TextFieldProps['slotProps'],
    error: !!error,
    helperText: note ?? '',
  };

  switch (spec.kind) {
    case 'number':
      return (
        <TextField
          {...common}
          slotProps={mergeSlots(slotProps?.number)}
          type="number"
          value={numVal(value)}
          onChange={e => onChange(numOr(e.target.value))}
        />
      );

    case 'text': {
      // A host-supplied code list turns free text into a select (e.g. euroClass
      // over sobek's EMISSION_STANDARD code values). The field stays a String.
      const codes = options?.();
      if (codes)
        return (
          <TextField
            {...common}
            slotProps={mergeSlots(slotProps?.text)}
            select
            value={(value as string | null | undefined) ?? ''}
            onChange={e => onChange(textOr(e.target.value))}
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {withStored(codes, value).map(o => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
        );
      return (
        <TextField
          {...common}
          slotProps={mergeSlots(slotProps?.text)}
          value={(value as string | null | undefined) ?? ''}
          onChange={e => onChange(textOr(e.target.value))}
        />
      );
    }

    case 'date':
      return (
        <TextField
          {...common}
          sx={NATIVE_INPUT_SX}
          slotProps={mergeSlots(slotProps?.date)}
          type="date"
          value={isoSlice(value)}
          onChange={e => onChange(textOr(e.target.value))}
        />
      );

    case 'datetime':
      // Native datetime-local holds no offset: it shows the stored instant in
      // local time, and an edit goes back out as a UTC `…Z` timestamp
      // (`utils/datetime`), so restoring the shown time restores the instant.
      return (
        <TextField
          {...common}
          sx={NATIVE_INPUT_SX}
          slotProps={mergeSlots(slotProps?.datetime)}
          type="datetime-local"
          value={toLocalInput(value)}
          onChange={e => onChange(fromLocalInput(e.target.value))}
        />
      );

    case 'name':
      return (
        <TextField
          {...common}
          slotProps={mergeSlots(slotProps?.name)}
          value={(value as Mls)?.value ?? ''}
          onChange={e => onChange(mergeName(value as Mls, e.target.value))}
        />
      );

    case 'switch': {
      // No TextField here, so the helper line and its `aria-describedby` are
      // wired by hand, onto the native checkbox the switch focuses.
      const own = slotProps?.switch?.slotProps?.input;
      return (
        <Box>
          <FormControlLabel
            control={
              // Consumer Switch props spread first so the controlled
              // `checked`/`disabled`/`onChange` below always win.
              <Switch
                {...slotProps?.switch}
                id={id}
                slotProps={{
                  ...slotProps?.switch?.slotProps,
                  input: { ...(typeof own === 'object' ? own : {}), 'aria-describedby': noteId },
                }}
                checked={!!value}
                disabled={disabled}
                onChange={e => onChange(e.target.checked)}
              />
            }
            label={label}
          />
          {note && (
            <FormHelperText id={noteId} error={!!error}>
              {note}
            </FormHelperText>
          )}
        </Box>
      );
    }

    case 'enum':
      return (
        <TextField
          {...common}
          slotProps={mergeSlots(slotProps?.enum)}
          select
          value={(value as string | null | undefined) ?? ''}
          onChange={e => onChange(e.target.value || undefined)}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {(spec.options ?? []).map(o => (
            <MenuItem key={o} value={o}>
              {o}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'enumMulti':
      return (
        <Autocomplete
          multiple
          id={id}
          size="small"
          disabled={disabled}
          options={[...(spec.options ?? [])]}
          value={((value as string[] | null | undefined) ?? []).filter(Boolean)}
          onChange={(_e, v) => onChange(v.length ? v : undefined)}
          slotProps={slotProps?.enumMulti}
          renderInput={params => (
            <TextField
              {...params}
              label={label}
              slotProps={SHRINK_LABEL}
              error={!!error}
              helperText={note ?? ''}
            />
          )}
        />
      );

    case 'reference': {
      const opts = options?.();
      if (!opts)
        return (
          <TextField
            {...common}
            value={(value as string | null | undefined) ?? ''}
            onChange={e => onChange(textOr(e.target.value))}
          />
        );
      const selected = opts.find(o => o.value === value) ?? null;
      return (
        <Autocomplete
          id={id}
          size="small"
          disabled={disabled}
          options={opts}
          getOptionLabel={o => o.label}
          isOptionEqualToValue={(o, v) => o.value === v.value}
          value={selected}
          onChange={(_e, o) => onChange(o ? o.value : undefined)}
          renderInput={params => (
            <TextField
              {...params}
              label={label}
              slotProps={SHRINK_LABEL}
              error={!!error}
              helperText={note ?? ''}
            />
          )}
        />
      );
    }

    default:
      return null;
  }
}
