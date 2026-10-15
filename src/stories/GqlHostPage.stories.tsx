import { useCallback, useMemo, useState, type FC } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Box,
  GlobalStyles,
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
import {
  SaveSnackbar,
  SectionToc,
  VehicleForm,
  VehicleTypeForm,
  resolveSections,
  vehicleFields,
  vehicleTypeFields,
  type FieldSpec,
  type Layout,
  type LayoutVariant,
  type ControlSlotProps,
  type SaveToast,
  type SectionTocVariant,
  type VehicleTypeFormProps,
} from "../index";
import { vehicleSeed, vehicleTypeSeed } from "./initDataSets";
import { vehicleLayout, vehicleTypeLayout } from "./initLayouts";
import { installStoriesMock, setMockLatency } from "./mockEndpoint";

/*
 * Data-aware counterpart to the Dumb-Forms stories: mounts the real,
 * package-exported VehicleForm / VehicleTypeForm (they load + save over GraphQL)
 * against an in-browser mock endpoint. A toolbar row holds one record dropdown
 * per entity — VehicleType and Vehicle — sharing one detail pane: picking a
 * record (or "New …") in either activates that entity's form. Reproduces the
 * host-guide "complete host
 * page" (list → select → view/edit → save), and shows the parts the guide only
 * describes in prose: `SaveSnackbar` fed from onSaved/onError. The form's own
 * props (`mode`, `variant`, `patched`, `footerProps`, `skeletonProps`) are story args, so
 * they are driven from Storybook Controls rather than page chrome. A stacked
 * form with several sections gets a `SectionToc` wired to its `activeSection` /
 * `onActiveSectionChange`: a column beside it on wide screens, a dropdown under
 * the toolbar below `md` (`tocVariant`). Toolbar and TOC stay pinned while the
 * page scrolls, so the TOC's "you are here" stays in sight.
 * Discard is not the page's job — the form renders its own `EditFooter`, whose
 * Cancel restores the loaded entity without a remount.
 */

// Serve both seeds before any story renders (module scope beats effect ordering).
installStoriesMock();

const SELECT_WIDTH = 260,
  TOC_WIDTH = 200,
  FORM_MAX_WIDTH = 680;
const NEW_KEY = "new";
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
    tabs: { variant: "scrollable", scrollButtons: "auto", allowScrollButtonsMobile: true },
  };
};

/** Which entity the detail pane is showing. */
type entity = "vehicleType" | "vehicle";

/** A selected record; `netexId` omitted ⇒ a blank "new" form of that entity. */
type Selection = { entity: entity; netexId?: string };

/** The form props surfaced as story args. VehicleForm takes the same ones. */
type FormArgs = Pick<
  VehicleTypeFormProps,
  "mode" | "variant" | "patched" | "footerProps" | "skeletonProps"
>;

/** The data-aware form props this page drives — VehicleForm and VehicleTypeForm
 *  share one shape (layout is the base `Layout`, not entity-specific). */
type DataAwareForm = FC<
  FormArgs & {
    netexId?: string;
    slotProps?: ControlSlotProps;
    layout?: Layout;
    onSaved?: (netexId: string) => void;
    onError?: (generalErrors: string[]) => void;
    activeSection?: string;
    onActiveSectionChange?: (section: string) => void;
  }
>;

/** Minimal record shape the lists need from either entity. */
type Rec = { netexId: string; name?: { value?: string | null } | null };

/** Per-entity wiring: its form component, layout, seed, and picker labels. */
const ENTITY: Record<
  entity,
  {
    Form: DataAwareForm;
    fields: Record<string, FieldSpec>;
    layout: Layout;
    seed: Record<string, Rec>;
    label: string;
    newLabel: string;
  }
> = {
  vehicleType: {
    Form: VehicleTypeForm,
    fields: vehicleTypeFields,
    layout: vehicleTypeLayout,
    seed: vehicleTypeSeed,
    label: "VehicleType",
    newLabel: "New vehicle type",
  },
  vehicle: {
    Form: VehicleForm,
    fields: vehicleFields,
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

/** Story-adjustable props, surfaced as Storybook Controls: the form's own props
 *  passed straight through, plus three the story owns. */
interface GqlHostPageProps extends FormArgs {
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
}: GqlHostPageProps) => {
  // The host picks the TOC's look — it knows the room it gives it; SectionToc
  // measures nothing.
  const narrow = useMediaQuery(useTheme().breakpoints.down("md"));
  const toc = tocVariant === "auto" ? (narrow ? "dropdown" : "list") : tocVariant;
  // Toolbar + (narrow) TOC dropdown stay pinned, so the TOC's scroll feedback
  // stays in sight; the list column and scrolled-to sections sit below it.
  const [headerRef, headerHeight] = useHeight();
  const slotProps = useMemo(() => tabSlotProps(variant, tabStyle), [variant, tabStyle]);
  const [selection, setSelection] = useState<Selection | null>(DEFAULT_SELECTION);
  const [toast, setToast] = useState<SaveToast | null>(null);
  // One piece of state for both directions: the form reports the section being
  // read, the TOC requests one, and the form ignores its own reports coming back.
  const [section, setSection] = useState<string>();

  const selectRecord = (entity: entity, netexId?: string) => {
    setSelection({ entity, netexId });
    setSection(undefined); // sections belong to a record's form, not to the page
  };

  const active = selection ? ENTITY[selection.entity] : null;
  const Form = active?.Form;
  // One layout for both the form and the TOC, so they list the same sections.
  const layout = active?.layout;
  // Same call the form makes, so the list is what the form renders — and only
  // a stacked form with several sections has anything to navigate.
  const tocSections = useMemo(() => {
    const labels = active
      ? resolveSections(active.fields, layout, patched).map((s) => s.label)
      : [];
    return variant === "stacked" && labels.length > 1 ? labels : [];
  }, [active, layout, variant, patched]);

  return (
    <Paper
      elevation={0}
      sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "grey.100" }}
    >
      {/* The page's scroller is <html>: give scrollIntoView the header's height
          so a section picked in either TOC lands below it, not under it. */}
      <GlobalStyles styles={{ html: { scrollPaddingTop: headerHeight } }} />
      <Box ref={headerRef} sx={{ position: "sticky", top: 0, zIndex: "appBar" }}>
        {/* Top: one record picker per entity; the active one shows the selection. */}
        <Box
          sx={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 2,
            px: 2,
            py: 1.5,
            borderBottom: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
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
        {/* Narrow: the TOC as a dropdown under the toolbar, aligned with the form;
            its value keeps saying which section is in view. */}
        {toc === "dropdown" && tocSections.length > 0 && (
          <Box
            sx={{
              px: { xs: 2, sm: 4 },
              py: 1.5,
              bgcolor: "grey.100",
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <SectionToc
              variant="dropdown"
              sections={tocSections}
              active={section ?? tocSections[0]}
              onSelect={setSection}
              sx={{ maxWidth: FORM_MAX_WIDTH }}
            />
          </Box>
        )}
      </Box>

      <Box sx={{ display: "flex", flex: 1 }}>
        {/* Left: only when the stacked form has sections to navigate. */}
        {toc === "list" && tocSections.length > 0 && (
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
              <SectionToc
                sections={tocSections}
                active={section ?? tocSections[0]}
                onSelect={setSection}
              />
            </Box>
          </Box>
        )}

        {/* Right: the selected entity's data-aware form + host chrome. */}
        <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 4 } }}>
          {selection && active && Form ? (
            <>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {selection.netexId ?? active.newLabel}
              </Typography>

              <Paper
                variant="outlined"
                sx={{ p: { xs: 2, sm: 3 }, maxWidth: FORM_MAX_WIDTH }}
              >
                <Form
                  // New key ⇒ remount, for switching entity/record only. Discarding
                  // edits no longer needs one: the footer's Cancel restores the
                  // hook's baseline in place, with no second round trip.
                  key={`${selection.entity}:${selection.netexId ?? NEW_KEY}`}
                  netexId={selection.netexId}
                  mode={mode}
                  variant={variant}
                  slotProps={slotProps}
                  patched={patched}
                  layout={layout}
                  footerProps={footerProps}
                  skeletonProps={skeletonProps}
                  activeSection={section}
                  onActiveSectionChange={setSection}
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
            </>
          ) : (
            <Typography color="text.secondary">
              Select a record to view or edit.
            </Typography>
          )}
        </Box>
      </Box>

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
  },
  argTypes: {
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
      description: "Form `footerProps` (`labels`, `slotProps`, `sx`) for the Save/Cancel band.",
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
  },
};
export default meta;
type Story = StoryObj<typeof GqlHostPage>;

export const Fullpage: Story = {};
