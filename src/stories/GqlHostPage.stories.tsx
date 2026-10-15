import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
  type KeyboardEvent,
  type Ref,
} from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Box,
  GlobalStyles,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import StorageIcon from "@mui/icons-material/Storage";
import {
  EditFooter,
  SaveSnackbar,
  SectionToc,
  VehicleForm,
  VehicleTypeForm,
  useFormSession,
  type EditFooterProps,
  type FormSession,
  type Layout,
  type LayoutVariant,
  type ControlSlotProps,
  type KindWidths,
  type SaveToast,
  type SectionTocVariant,
  type BusInputResult,
  type Vehicle,
  type VehicleType,
  type VehicleTypeFormProps,
  toBusInput,
} from "../index";
import { vehicleSeed, vehicleTypeSeed } from "./initDataSets";
import { BusView, type BusViewMode } from "./BusView";
import type { BusMotion } from "./busMotion";
import { vehicleLayout, vehicleTypeLayout } from "./initLayouts";
import { installStoriesMock, setMockLatency } from "./mockEndpoint";
import { captionSlots, formLookArgs, formLookArgTypes, widthsOf, type FormLookArgs } from "./formControls";

/*
 * Data-aware counterpart to the Dumb-Forms stories: mounts the real,
 * package-exported VehicleForm / VehicleTypeForm (they load + save over GraphQL)
 * against an in-browser mock endpoint. A toolbar row holds one record dropdown
 * per entity — VehicleType and Vehicle — sharing one detail pane: picking a
 * record (or "New …") in either activates that entity's form. Reproduces the
 * host-guide "complete host
 * page" (list → select → view/edit → save), and shows the parts the guide only
 * describes in prose: `SaveSnackbar` fed from onSaved/onError. The form's own
 * props (`mode`, `variant`, `patched`, `skeletonProps`) are story args, so
 * they are driven from Storybook Controls rather than page chrome. A stacked
 * form with several sections gets a `SectionToc`: a column beside it on wide screens, a dropdown under
 * the toolbar below `md` (`tocVariant`). Toolbar and TOC stay pinned while the
 * page scrolls, so the TOC's "you are here" stays in sight. The toolbar
 * collapses (`toolbar`): on wide screens to a small bar in the gutter right of
 * the form, which covers nothing; below `md` to one slim pinned row holding the
 * toggle and the TOC dropdown (or the record name when there is no TOC).
 * The page places the form's chrome from `useFormSession()`: the TOC from `session.toc` and an `EditFooter` band across the page from `session.footer`, whose Cancel restores the loaded entity without a remount.
 */

// Serve both seeds before any story renders (module scope beats effect ordering).
installStoriesMock();

const SELECT_WIDTH = 260,
  TOC_WIDTH = 200,
  FORM_MAX_WIDTH = 680;
const NEW_KEY = "new";
/** The picker region the toolbar toggle discloses (`aria-controls`). */
const PICKERS_ID = "fullpage-record-pickers";
/** Gap between the pinned header and the collapsed bar floating below it, px. */
const FLOAT_GAP_PX = 16,
  FLOAT_MAX_WIDTH = 220;
/** Theme spacing above the 3D column: the form's heading (h6, 32px) plus its
 *  margin, so the two panels start level. */
const BUS_COLUMN_TOP = 6;
/** Slow enough that the skeleton and the arrival fade are actually watchable. */
const DEFAULT_READ_DELAY_MS = 600;

/**
 * How a `tabs` form draws its tab bar:
 * - `one-line` → scrollable tabs on one row, `>` chevrons for overflow.
 * - `pills`    → wrapping filled-pill tabs (hathor's VehicleTypeForm style).
 */
type TabStyle = "one-line" | "pills";

/** `slotProps` reproducing hathor's wrapping pill tabs: `standard` variant (so
 *  the row can wrap) + a flex-wrap container + filled-pill tab styling. */
const PILL_TABS_SX = {
  minHeight: 0,
  "& .MuiTabs-indicator": { display: "none" },
  "& .MuiTabs-flexContainer": { flexWrap: "wrap", gap: 0.75 },
  "& .MuiTab-root": {
    minHeight: 30,
    px: 1.25,
    py: 0.25,
    borderRadius: 1,
    textTransform: "none",
    bgcolor: "action.hover",
    color: "text.secondary",
  },
  "& .MuiTab-root.Mui-selected": {
    bgcolor: "primary.main",
    color: "primary.contrastText",
  },
} as const;

/** Tabs `slotProps` for a {@link TabStyle}; a stacked form has no tab bar. */
const tabSlotProps = (variant: LayoutVariant, tabStyle: TabStyle): ControlSlotProps => {
  if (variant !== "tabs") return {};
  if (tabStyle === "pills") return { tabs: { variant: "standard", sx: PILL_TABS_SX } };
  return {
    tabs: {
      variant: "scrollable",
      scrollButtons: "auto",
      allowScrollButtonsMobile: true,
    },
  };
};

/** Which entity the detail pane is showing. */
type entity = "vehicleType" | "vehicle";

/** A selected record; `netexId` omitted ⇒ a blank "new" form of that entity. */
type Selection = { entity: entity; netexId?: string };

/** The form props surfaced as story args. VehicleForm takes the same ones. */
type FormArgs = Pick<VehicleTypeFormProps, "mode" | "variant" | "patched" | "skeletonProps">;

/** The data-aware form props this page drives — VehicleForm and VehicleTypeForm
 *  share one shape (layout is the base `Layout`, not entity-specific). */
type DataAwareForm = FC<
  FormArgs & {
    netexId?: string;
    slotProps?: ControlSlotProps;
    widths?: KindWidths;
    layout?: Layout;
    onSaved?: (netexId: string) => void;
    onError?: (generalErrors: string[]) => void;
    onChange?: (value: Rec | undefined) => void;
    session?: FormSession;
  }
>;

/** Minimal record shape the lists need from either entity. */
type Rec = { netexId: string; name?: { value?: string | null } | null };

/** Per-entity wiring: its form component, layout, seed, and picker labels. */
const ENTITY: Record<
  entity,
  {
    Form: DataAwareForm;
    layout: Layout;
    seed: Record<string, Rec>;
    label: string;
    newLabel: string;
  }
> = {
  vehicleType: {
    Form: VehicleTypeForm,
    layout: vehicleTypeLayout,
    seed: vehicleTypeSeed,
    label: "VehicleType",
    newLabel: "New vehicle type",
  },
  vehicle: {
    Form: VehicleForm,
    layout: vehicleLayout,
    seed: vehicleSeed,
    label: "Vehicle",
    newLabel: "New vehicle",
  },
};

const ENTITY_ORDER: entity[] = ["vehicleType", "vehicle"];

/** What the page opens on: the first record of the first entity, derived so it
 *  follows a reordered `ENTITY_ORDER` or a reseeded dataset. */
const DEFAULT_SELECTION: Selection = {
  entity: ENTITY_ORDER[0],
  netexId: Object.values(ENTITY[ENTITY_ORDER[0]].seed)[0]?.netexId,
};

/** A picker's options: the seed's records, plus the current selection when the
 *  static mock doesn't hold it (a saved "new" record comes back as an id the
 *  seed never had), so the select never holds an out-of-range value. */
const recordIds = (seed: Record<string, Rec>, current: string): string[] => {
  const ids = Object.values(seed).map((r) => r.netexId);
  return current && current !== NEW_KEY && !ids.includes(current) ? [...ids, current] : ids;
};

/**
 * Live border-box height of the element the returned ref lands on — the pinned
 * header wraps onto a second row on narrow screens, so offsets below it can't
 * be a constant. React 19 runs the ref's returned cleanup on detach.
 *
 * @returns a callback ref and the current height in px (0 until measured)
 */
const useHeight = (): [(el: HTMLElement | null) => (() => void) | undefined, number] => {
  const [height, setHeight] = useState(0);
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setHeight(e.borderBoxSize[0].blockSize));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, height];
};

/** Whether the record pickers show (`expanded`) or fold into a toggle bar. */
type ToolbarState = "expanded" | "collapsed";

/**
 * Disclosure button for the record pickers, named by the action it takes.
 * Folded, it is the floated bar's only way back to the mock data, so it shows
 * a database icon there; open, the chevron that folds the pickers away.
 *
 * @param props.expanded whether the pickers currently show
 * @param props.onToggle flips the state
 * @param props.buttonRef lands on the button, so focus can return to it
 * @returns the toggle button
 */
const ToolbarToggle = ({
  expanded,
  onToggle,
  buttonRef,
}: {
  expanded: boolean;
  onToggle: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}) => (
  <IconButton
    ref={buttonRef}
    size="small"
    aria-expanded={expanded}
    aria-controls={PICKERS_ID}
    aria-label={expanded ? "Hide record pickers" : "Show record pickers"}
    title={expanded ? "Hide record pickers" : "Show record pickers"}
    onClick={onToggle}
  >
    {expanded ? <ExpandLessIcon /> : <StorageIcon />}
  </IconButton>
);

/** The active record as the collapsed bar names it: entity caption + name. */
const RecordName = ({ caption, name }: { caption: string; name: string }) => (
  <Box sx={{ minWidth: 0, flex: 1 }}>
    <Typography variant="overline" color="text.secondary" component="div" sx={{ lineHeight: 1.5 }}>
      {caption}
    </Typography>
    <Typography variant="body2" noWrap title={name}>
      {name}
    </Typography>
  </Box>
);

/** Story-adjustable props, surfaced as Storybook Controls: the form's own props
 *  passed straight through, plus four the story owns. */
interface GqlHostPageProps extends FormArgs, FormLookArgs {
  /** Spread onto the page's own `EditFooter` — the form no longer renders one.
   *  Its state comes from the session and always wins. */
  footerProps?: Pick<EditFooterProps, "labels" | "slotProps" | "sx">;
  /** Tab bar style when `variant` is `tabs`. Single-section Vehicle renders
   *  flat regardless. */
  tabStyle?: TabStyle;
  /** TOC presentation for a stacked form: `auto` picks the dropdown below the
   *  `md` breakpoint and the list above it. */
  tocVariant?: SectionTocVariant | "auto";
  /** Mock read latency. The forms render their own load states, so this is the
   *  only way to see the shaped skeleton and the arrival fade — at `0` the
   *  response resolves in the same tick and neither paints.
   *
   *  Consumed by the meta's `beforeEach`, not by this component: it configures
   *  the mock endpoint, which is story infrastructure rather than page state. */
  readDelayMs?: number;
  /** Initial toolbar state; the page's toggle takes it from there. Changing
   *  the control resets it. */
  toolbar?: ToolbarState;
  /** Initial 3D preview mode (#60); the column's own toggle takes it from there. */
  busView?: BusViewMode;
  /** Initial camera of the live 3D view: the reader's, or the ∞ flight. */
  busMotion?: BusMotion;
}

/**
 * Single host screen with a toolbar of record pickers (VehicleType + Vehicle)
 * feeding one detail pane. Selecting an item swaps the pane to that entity's
 * data-aware form; the pane owns the host concerns —
 * new-vs-existing via `netexId`, record switch via remount `key`, and reacting
 * to saves.
 */
const GqlHostPage = ({
  mode = "edit",
  variant = "stacked",
  tabStyle = "one-line",
  tocVariant = "auto",
  patched = "mark",
  footerProps,
  skeletonProps,
  toolbar = "collapsed",
  busView = "3d",
  busMotion = "animate",
  ...look
}: GqlHostPageProps) => {
  // The host picks the TOC's look — it knows the room it gives it; SectionToc
  // measures nothing.
  const narrow = useMediaQuery(useTheme().breakpoints.down("md"));
  const toc = tocVariant === "auto" ? (narrow ? "dropdown" : "list") : tocVariant;
  // Toolbar + (narrow) TOC dropdown stay pinned, so the TOC's scroll feedback
  // stays in sight; the list column and scrolled-to sections sit below it.
  const [headerRef, headerHeight] = useHeight();
  const { captions } = look;
  const slotProps = useMemo(
    () => ({ ...captionSlots(captions), ...tabSlotProps(variant, tabStyle) }),
    [captions, variant, tabStyle],
  );
  // Read at render only (no effect keys on it), so a fresh object is fine.
  const widths = widthsOf(look);
  const [selection, setSelection] = useState<Selection | null>(DEFAULT_SELECTION);
  // The open record as the form holds it — load, edits and refetch — so the
  // preview follows unsaved edits. Cleared on a record switch.
  const [liveValue, setLiveValue] = useState<Rec | undefined>(undefined);
  const [busMode, setBusMode] = useState<BusViewMode>(busView);
  useEffect(() => setBusMode(busView), [busView]);
  // Page state, so the camera mode survives a record switch (BusView remounts).
  // Under reduced motion the page never starts a flight by itself; the reader
  // still can, and then its eases are cuts.
  const [motion, setMotion] = useState<BusMotion>(() =>
    matchMedia("(prefers-reduced-motion: reduce)").matches ? "orbit" : busMotion,
  );
  const firstMotion = useRef(true);
  useEffect(() => {
    if (firstMotion.current) firstMotion.current = false;
    else setMotion(busMotion); // a changed control is an explicit choice
  }, [busMotion]);
  // From lg up the preview is a column of its own; below, it sits under the form.
  const busColumn = useMediaQuery(useTheme().breakpoints.up("lg"));
  const [toast, setToast] = useState<SaveToast | null>(null);
  // The form's chrome is ours to place: the TOC (column or pinned dropdown)
  // and the Save/Cancel band across the whole page, outside every column.
  const session = useFormSession();
  // Page state, so it survives a record switch (that remounts the form only).
  // The arg seeds it, and a changed arg re-seeds it (adjust-on-prop-change).
  const [expanded, setExpanded] = useState(toolbar === "expanded");
  const [seededFrom, setSeededFrom] = useState(toolbar);
  if (toolbar !== seededFrom) {
    setSeededFrom(toolbar);
    setExpanded(toolbar === "expanded");
  }
  // Disclosure focus: into the pickers on expand, back to the toggle on
  // collapse — only after the user toggled, never for an arg change.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pickersRef = useRef<HTMLElement>(null);
  const moveFocus = useRef(false);
  const toggleToolbar = (next: boolean) => {
    moveFocus.current = true;
    setExpanded(next);
  };
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    const target = expanded
      ? pickersRef.current?.querySelector<HTMLElement>('[role="combobox"]')
      : toggleRef.current;
    target?.focus();
  }, [expanded]);
  // Escape collapses from inside the toolbar — but not from an open select's
  // menu: it is portalled, so its keydown bubbles here through React while
  // sitting outside the toolbar's DOM, and Escape there only closes the menu.
  const collapseOnEscape = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape" && e.currentTarget.contains(e.target as Node)) toggleToolbar(false);
  };

  const selectRecord = (entity: entity, netexId?: string) => {
    setLiveValue(undefined);
    setSelection({ entity, netexId });
  };

  const active = selection ? ENTITY[selection.entity] : null;
  const Form = active?.Form;
  // The form publishes its own TOC sections from this layout.
  const layout = active?.layout;
  const recordName =
    selection && active
      ? selection.netexId
        ? (active.seed[selection.netexId]?.name?.value ?? selection.netexId)
        : active.newLabel
      : "No record";
  const tocDropdown = toc === "dropdown" && session.toc.sections.length > 0;
  const recordKey = selection ? `${selection.entity}:${selection.netexId ?? NEW_KEY}` : "";
  // A Vehicle is drawn over the type it references, served from the same seed
  // the mock answers with.
  const busType =
    selection?.entity === "vehicle"
      ? vehicleTypeSeed[(liveValue as Vehicle | undefined)?.transportType?.netexId ?? ""]
      : (liveValue as VehicleType | undefined);
  const busResult: BusInputResult | null = !selection
    ? null
    : selection.entity === "vehicle" && !busType
      ? { ok: false, missing: ["transportType"] }
      : toBusInput(busType ?? {}, selection.entity === "vehicle" ? (liveValue as Vehicle) : undefined);
  const preview = (
    <BusView
      key={recordKey}
      result={busResult}
      lengthM={busType?.length}
      missingWhere={
        selection?.entity === "vehicle" && busType
          ? `on this Vehicle or its VehicleType ${busType.netexId}`
          : undefined
      }
      mode={busMode}
      onModeChange={setBusMode}
      motion={motion}
      onMotionChange={setMotion}
    />
  );
  const toggle = (
    <ToolbarToggle
      expanded={expanded}
      onToggle={() => toggleToolbar(!expanded)}
      buttonRef={toggleRef}
    />
  );

  return (
    <Paper
      elevation={0}
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        bgcolor: "grey.100",
      }}
    >
      {/* The page's scroller is <html>: give scrollIntoView the header's height
          so a section picked in either TOC lands below it, not under it. */}
      <GlobalStyles styles={{ html: { scrollPaddingTop: headerHeight } }} />
      <Box ref={headerRef} sx={{ position: "sticky", top: 0, zIndex: "appBar" }}>
        {/* Top: one record picker per entity; the active one shows the selection.
            Collapsed, the row stays mounted but hidden, so the toggle's
            aria-controls always names an element. */}
        <Box
          onKeyDown={collapseOnEscape}
          sx={{
            display: expanded ? "flex" : "none",
            alignItems: "center",
            gap: 2,
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <Box
            ref={pickersRef}
            id={PICKERS_ID}
            role="group"
            aria-label="Record pickers"
            sx={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 2,
              flex: 1,
            }}
          >
            <Typography variant="overline" color="text.secondary">
              Select form and mock data
            </Typography>
            {ENTITY_ORDER.map((entity) => {
              const cfg = ENTITY[entity];
              const current = selection?.entity === entity ? (selection.netexId ?? NEW_KEY) : "";
              const name = (id: string) => cfg.seed[id]?.name?.value ?? id;
              return (
                <TextField
                  key={entity}
                  select
                  size="small"
                  label={cfg.label}
                  value={current}
                  onChange={(e) =>
                    selectRecord(entity, e.target.value === NEW_KEY ? undefined : e.target.value)
                  }
                  slotProps={{
                    select: {
                      renderValue: (v) => (v === NEW_KEY ? cfg.newLabel : name(v as string)),
                    },
                  }}
                  sx={{ width: SELECT_WIDTH }}
                >
                  <MenuItem value={NEW_KEY}>
                    <ListItemIcon>
                      <AddIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={cfg.newLabel} />
                  </MenuItem>
                  {recordIds(cfg.seed, current).map((id) => (
                    <MenuItem key={id} value={id}>
                      <ListItemText primary={name(id)} secondary={id} />
                    </MenuItem>
                  ))}
                </TextField>
              );
            })}
          </Box>
          {expanded && toggle}
        </Box>
        {/* Narrow + collapsed: one slim row — the toggle, then the TOC dropdown
            (kept pinned: it is the "you are here"), else the record's name. */}
        {!expanded && narrow && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: { xs: 2, sm: 4 },
              py: 1,
              bgcolor: tocDropdown ? "grey.100" : "background.paper",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            {toggle}
            {tocDropdown ? (
              <SectionToc
                {...session.toc}
                variant="dropdown"
                sx={{ flex: 1, minWidth: 0, maxWidth: FORM_MAX_WIDTH }}
              />
            ) : (
              <RecordName caption={active?.label ?? "Record"} name={recordName} />
            )}
          </Box>
        )}
        {/* The TOC as a dropdown under the toolbar, aligned with the form; its
            value keeps saying which section is in view. */}
        {tocDropdown && (expanded || !narrow) && (
          <Box
            sx={{
              px: { xs: 2, sm: 4 },
              py: 1.5,
              bgcolor: "grey.100",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <SectionToc {...session.toc} variant="dropdown" sx={{ maxWidth: FORM_MAX_WIDTH }} />
          </Box>
        )}
      </Box>

      <Box sx={{ display: "flex", flex: 1 }}>
        {/* Left: only when the stacked form has sections to navigate. */}
        {toc === "list" && session.toc.sections.length > 0 && (
          <Box
            sx={{
              width: TOC_WIDTH,
              flexShrink: 0,
              borderRight: 1,
              borderColor: "divider",
              bgcolor: "background.paper",
            }}
          >
            {/* The page scrolls, not the column, so the content is pinned inside
                it — below the pinned header. */}
            <Box sx={{ position: "sticky", top: headerHeight, p: 2 }}>
              <Typography variant="overline" color="text.secondary">
                Sections
              </Typography>
              <SectionToc {...session.toc} />
            </Box>
          </Box>
        )}

        {/* Right: the selected entity's data-aware form + host chrome. */}
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            p: { xs: 2, sm: 4 },
            display: "flex",
            alignItems: "flex-start",
            gap: 2,
          }}
        >
          <Box
            sx={
              busColumn
                ? { flex: `0 1 ${FORM_MAX_WIDTH}px`, minWidth: 0 }
                : { flex: 1, minWidth: 0 }
            }
          >
            {selection && active && Form ? (
              <>
                <Typography variant="h6" sx={{ mb: 2 }}>
                  {selection.netexId ?? active.newLabel}
                </Typography>

                <Paper variant="outlined" sx={{ p: { xs: 2, sm: 3 }, maxWidth: FORM_MAX_WIDTH }}>
                  <Form
                    // New key ⇒ remount, for switching entity/record only. Discarding
                    // edits no longer needs one: the footer's Cancel restores the
                    // hook's baseline in place, with no second round trip.
                    key={recordKey}
                    netexId={selection.netexId}
                    mode={mode}
                    variant={variant}
                    slotProps={slotProps}
                    patched={patched}
                    widths={widths}
                    layout={layout}
                    skeletonProps={skeletonProps}
                    session={session}
                    onChange={setLiveValue}
                    onSaved={(id) => {
                      setSelection({ entity: selection.entity, netexId: id });
                      setToast({ msg: `Saved ${id}`, severity: "success" });
                    }}
                    onError={(msgs) =>
                      setToast({
                        msg: msgs.join("\n") || "Save failed",
                        severity: "error",
                      })
                    }
                  />
                </Paper>
                {!busColumn && <Box sx={{ mt: 3, maxWidth: FORM_MAX_WIDTH }}>{preview}</Box>}
              </>
            ) : (
              <Typography color="text.secondary">Select a record to view or edit.</Typography>
            )}
          </Box>
          {/* Third column, from lg up: the bus, in whatever width is left. Pinned
              below the header, level with the form's panel. */}
          {busColumn && (
            <Box
              sx={{
                flex: 1,
                minWidth: 0,
                position: "sticky",
                top: headerHeight + FLOAT_GAP_PX,
                mt: BUS_COLUMN_TOP,
              }}
            >
              {preview}
            </Box>
          )}
          {/* Wide + collapsed: the toolbar floats in the gutter right of the
              form (capped at FORM_MAX_WIDTH), pinned below the header. Its own
              flex item, so it takes room instead of covering the form. */}
          {!expanded && !narrow && (
            <Paper
              elevation={2}
              sx={{
                position: "sticky",
                top: headerHeight + FLOAT_GAP_PX,
                flexShrink: 0,
                maxWidth: FLOAT_MAX_WIDTH,
                display: "flex",
                alignItems: "center",
                gap: 1,
                pl: 1.5,
                pr: 0.5,
                py: 0.5,
              }}
            >
              <RecordName caption={active?.label ?? "Record"} name={recordName} />
              {toggle}
            </Paper>
          )}
        </Box>
      </Box>

      {/* Outside the columns, so it spans the page; sticky to the bottom of the
          viewport by EditFooter's own default. Session state wins over args. */}
      {mode === "edit" && <EditFooter {...footerProps} {...session.footer} />}
      <SaveSnackbar toast={toast} onClose={() => setToast(null)} />
    </Paper>
  );
};

const meta: Meta<typeof GqlHostPage> = {
  title: "HostPages/Fullpage",
  component: GqlHostPage,
  parameters: { layout: "fullscreen" },
  // Configure the mock *before* the story renders. Not in the component body
  // (mutating module state during render is impure — StrictMode runs it twice)
  // and not in a `useEffect` either: the forms fire their load from a passive
  // effect, and on mount React runs child effects before parent ones, so a
  // parent effect would land one request too late and the first load would
  // always be instant — exactly the case this control exists to slow down.
  beforeEach: ({ args }) => {
    setMockLatency({ read: args.readDelayMs ?? DEFAULT_READ_DELAY_MS });
  },
  args: {
    mode: "edit",
    variant: "stacked",
    tabStyle: "one-line",
    tocVariant: "auto",
    patched: "mark",
    // The footer's English defaults, spelled out so the control shows what to edit.
    footerProps: {
      labels: {
        save: "Save",
        cancel: "Cancel",
        clean: "All changes saved",
        dirty: "Unsaved changes",
        saving: "Saving…",
      },
    },
    skeletonProps: { ariaLabel: "Loading form" },
    readDelayMs: DEFAULT_READ_DELAY_MS,
    toolbar: "collapsed",
    busView: "3d",
    busMotion: "animate",
    ...formLookArgs,
  },
  argTypes: {
    ...formLookArgTypes,
    mode: {
      control: "inline-radio",
      options: ["view", "edit"],
      description: "Form `mode`. `view` disables every input and drops the Save/Cancel footer.",
    },
    variant: {
      control: "inline-radio",
      options: ["stacked", "tabs"],
      description:
        "Form `variant` for multi-section forms (VehicleType): stacked gets a table of contents beside it. Vehicle is single-section, so unaffected.",
    },
    tabStyle: {
      control: "inline-radio",
      options: ["one-line", "pills"],
      if: { arg: "variant", eq: "tabs" },
      description:
        "Story-only: the tab bar's `slotProps`. one-line = scrollable tab row, pills = wrapping pill tabs.",
    },
    tocVariant: {
      control: "inline-radio",
      options: ["auto", "list", "dropdown"],
      if: { arg: "variant", eq: "stacked" },
      description:
        "Story-only: `SectionToc` `variant`. auto = dropdown pinned above the form below the md breakpoint, list column beside it above; list / dropdown force one.",
    },
    patched: {
      control: "inline-radio",
      options: ["mark", "plain", "hide"],
      description:
        "Form `patched`: how fields from the schema patch overlay (not saved yet) show. mark = trailing *, plain = no *, hide = left out (values still round-trip). Only VehicleType has any.",
    },
    footerProps: {
      control: "object",
      description:
        "`EditFooter` props the page passes (`labels`, `slotProps`, `sx`) for the Save/Cancel band.",
    },
    skeletonProps: {
      control: "object",
      description:
        "Form `skeletonProps` (`ariaLabel`, `sx`) for the loading skeleton. Raise readDelayMs to see it.",
    },
    readDelayMs: {
      control: { type: "range", min: 0, max: 3000, step: 100 },
      description:
        "Mock read latency. Raise it to watch the shaped skeleton and the arrival fade; 0 resolves in the same tick, so neither is visible. Pick a record in either dropdown to re-trigger a load.",
    },
    busView: {
      control: "inline-radio",
      options: ["3d", "bitmap"],
      description:
        "Story-only: initial mode of the 3D preview column (#60); its own toggle takes it from there. bitmap = a PNG from mkStageShot, 3d = the live three.js canvas from mkStage.",
    },
    busMotion: {
      control: "inline-radio",
      options: ["animate", "orbit"],
      if: { arg: "busView", eq: "3d" },
      description:
        "Story-only: initial camera of the live 3D view. animate = flies an ∞ around the bus, easing in from and back out to the resting view; orbit = yours to drag. The control inside the canvas switches; grabbing the canvas while it flies hands it over on the spot.",
    },
    toolbar: {
      control: "inline-radio",
      options: ["expanded", "collapsed"],
      description:
        "Story-only: initial toolbar state (default collapsed); the toggle in the page flips it. collapsed = the record pickers fold into a small floated bar right of the form (wide) or a slim pinned row with the TOC dropdown (below md), and the toggle shows a database icon; expanded = the full pickers row.",
    },
  },
};
export default meta;
type Story = StoryObj<typeof GqlHostPage>;

export const Fullpage: Story = {};
