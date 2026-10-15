import { useMemo, useState, type FC } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Box,
  FormControlLabel,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Typography,
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
 * describes in prose: `SaveSnackbar` fed from onSaved/onError. The form is
 * always in edit mode. A column sits beside the form: with
 * `tabStyle: none` it holds a `SectionToc` wired to the stacked form's
 * `activeSection` / `onActiveSectionChange`, and always a story-only "Tune"
 * panel whose switch reveals the patched ("future") fields, hidden by default.
 * Discard is not the page's job — the form renders its own `EditFooter`, whose
 * Cancel restores the loaded entity without a remount.
 */

// Serve both seeds before any story renders (module scope beats effect ordering).
installStoriesMock();

const SELECT_WIDTH = 260,
  TUNE_WIDTH = 200;
const NEW_KEY = "new";
/** Slow enough that the skeleton and the arrival fade are actually watchable. */
const DEFAULT_READ_DELAY_MS = 600;

/**
 * How a multi-section form presents its sections (mirrors DumbAppMock):
 * - `none`     → no tab bar (stacked sections).
 * - `one-line` → scrollable tabs on one row, `>` chevrons for overflow.
 * - `pills`    → wrapping filled-pill tabs (hathor's VehicleTypeForm style).
 */
type TabStyle = "none" | "one-line" | "pills";

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

/** Derive a form's `variant` + Tabs `slotProps` from a {@link TabStyle}. */
const deriveTabs = (
  tabStyle: TabStyle,
): { variant: LayoutVariant; slotProps: ControlSlotProps } => {
  if (tabStyle === "none") return { variant: "stacked", slotProps: {} };
  if (tabStyle === "pills")
    return { variant: "tabs", slotProps: { tabs: { variant: "standard", sx: PILL_TABS_SX } } };
  return {
    variant: "tabs",
    slotProps: {
      tabs: { variant: "scrollable", scrollButtons: "auto", allowScrollButtonsMobile: true },
    },
  };
};

/** Drop the `patched` fields from a layout. A layout is a whitelist and an
 *  omitted field still round-trips, so hiding them here loses nothing. */
const withoutPatched = (layout: Layout, fields: Record<string, FieldSpec>): Layout =>
  Object.fromEntries(
    Object.entries(layout).map(([label, items]) => [
      label,
      items.filter((item) => !fields[typeof item === "string" ? item : item.field]?.patched),
    ]),
  );

/** Which entity the detail pane is showing. */
type entity = "vehicleType" | "vehicle";

/** A selected record; `netexId` omitted ⇒ a blank "new" form of that entity. */
type Selection = { entity: entity; netexId?: string };

/** The data-aware form props this page drives — VehicleForm and VehicleTypeForm
 *  share one shape (layout is the base `Layout`, not entity-specific). */
type DataAwareForm = FC<{
  netexId?: string;
  mode?: "view" | "edit";
  variant?: LayoutVariant;
  slotProps?: ControlSlotProps;
  layout?: Layout;
  onSaved?: (netexId: string) => void;
  onError?: (generalErrors: string[]) => void;
  activeSection?: string;
  onActiveSectionChange?: (section: string) => void;
}>;

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

/** Story-adjustable props, surfaced as Storybook Controls. */
interface GqlHostPageProps {
  /** How multi-section forms (VehicleType) present sections. Single-section
   *  Vehicle renders flat regardless. */
  tabStyle?: TabStyle;
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
 * data-aware form, always in edit mode; the pane owns the host concerns —
 * new-vs-existing via `netexId`, record switch via remount `key`, and reacting
 * to saves.
 */
const GqlHostPage = ({ tabStyle = "none" }: GqlHostPageProps) => {
  const { variant, slotProps } = useMemo(() => deriveTabs(tabStyle), [tabStyle]);
  const [selection, setSelection] = useState<Selection | null>(DEFAULT_SELECTION);
  const [toast, setToast] = useState<SaveToast | null>(null);
  // Page-level, so the choice survives a record switch.
  const [showFuture, setShowFuture] = useState(false);
  // One piece of state for both directions: the form reports the section being
  // read, the TOC requests one, and the form ignores its own reports coming back.
  const [section, setSection] = useState<string>();

  const selectRecord = (entity: entity, netexId?: string) => {
    setSelection({ entity, netexId });
    setSection(undefined); // sections belong to a record's form, not to the page
  };

  const active = selection ? ENTITY[selection.entity] : null;
  const Form = active?.Form;
  const hasFuture = !!active && Object.values(active.fields).some((f) => f.patched);
  // One layout for both the form and the TOC, so they hide the same fields.
  const layout = useMemo(
    () =>
      !active || showFuture ? active?.layout : withoutPatched(active.layout, active.fields),
    [active, showFuture],
  );
  // Same call the form makes, so the list is what the form renders — and only
  // a stacked form with several sections has anything to navigate.
  const tocSections = useMemo(() => {
    const labels = active ? resolveSections(active.fields, layout).map((s) => s.label) : [];
    return variant === "stacked" && labels.length > 1 ? labels : [];
  }, [active, layout, variant]);

  return (
    <Paper
      elevation={0}
      sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "grey.100" }}
    >
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

      <Box sx={{ display: "flex", flex: 1 }}>
        {/* Left: always there for the Tune panel; the table of contents joins
            it above when the stacked form has sections to navigate. */}
        <Box
          sx={{
            width: TUNE_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {/* The page scrolls, not the column, so the content is pinned inside it. */}
          <Box sx={{ position: "sticky", top: 0, p: 2 }}>
            {tocSections.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="overline" color="text.secondary">
                  Sections
                </Typography>
                <SectionToc
                  sections={tocSections}
                  active={section ?? tocSections[0]}
                  onSelect={setSection}
                />
              </Box>
            )}
            <Typography variant="overline" color="text.secondary" component="div">
              Tune
            </Typography>
            <FormControlLabel
              // Nothing to reveal on an entity with no patched fields.
              disabled={!hasFuture}
              control={
                <Switch
                  size="small"
                  checked={showFuture}
                  onChange={(e) => setShowFuture(e.target.checked)}
                />
              }
              label="Show future fields (*)"
              slotProps={{ typography: { variant: "body2" } }}
              sx={{ ml: 0, gap: 0.5 }}
            />
          </Box>
        </Box>

        {/* Right: the selected entity's data-aware form + host chrome. */}
        <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 4 } }}>
          {selection && active && Form ? (
            <>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {selection.netexId ?? active.newLabel}
              </Typography>

              <Paper
                variant="outlined"
                sx={{ p: { xs: 2, sm: 3 }, maxWidth: 680 }}
              >
                <Form
                  // New key ⇒ remount, for switching entity/record only. Discarding
                  // edits no longer needs one: the footer's Cancel restores the
                  // hook's baseline in place, with no second round trip.
                  key={`${selection.entity}:${selection.netexId ?? NEW_KEY}`}
                  netexId={selection.netexId}
                  mode="edit"
                  variant={variant}
                  slotProps={slotProps}
                  layout={layout}
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
  args: { tabStyle: "none", readDelayMs: DEFAULT_READ_DELAY_MS },
  argTypes: {
    tabStyle: {
      control: "inline-radio",
      options: ["none", "one-line", "pills"],
      description:
        "How multi-section forms (VehicleType) present sections: none = stacked (no tabs) with a table of contents above the Tune panel, one-line = scrollable tab row, pills = wrapping pill tabs. Vehicle is single-section, so unaffected.",
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
