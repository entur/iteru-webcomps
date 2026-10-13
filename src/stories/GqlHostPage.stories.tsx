import { useMemo, useState, type FC } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Box,
  Button,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  ListSubheader,
  Paper,
  Stack,
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
 * against an in-browser mock endpoint. Two stacked record lists — Vehicle types
 * and Vehicles — share one detail pane: clicking an item in either list
 * activates that entity's form. Reproduces the host-guide "complete host
 * page" (list → select → view/edit → save), and shows the parts the guide only
 * describes in prose: `SaveSnackbar` fed from onSaved/onError, and
 * `onDirtyChange` gating the exit from edit mode. With `tabStyle: none` a third
 * column appears between the lists and the form: a `SectionToc` wired to the
 * stacked form's `activeSection` / `onActiveSectionChange`. Discard is not the page's job
 * any more — the form renders its own `EditFooter`, whose Cancel restores the
 * loaded entity without the remount this page used to do.
 */

// Serve both seeds before any story renders (module scope beats effect ordering).
installStoriesMock();

const LIST_WIDTH = 260,
  TOC_WIDTH = 180;
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
  onDirtyChange?: (dirty: boolean) => void;
  activeSection?: string;
  onActiveSectionChange?: (section: string) => void;
}>;

/** Minimal record shape the lists need from either entity. */
type Rec = { netexId: string; name?: { value?: string | null } | null };

/** Per-entity wiring: its form component, layout, seed, and list labels. */
const ENTITY: Record<
  entity,
  {
    Form: DataAwareForm;
    fields: Record<string, FieldSpec>;
    layout: Layout;
    seed: Record<string, Rec>;
    heading: string;
    newLabel: string;
  }
> = {
  vehicleType: {
    Form: VehicleTypeForm,
    fields: vehicleTypeFields,
    layout: vehicleTypeLayout,
    seed: vehicleTypeSeed,
    heading: "Vehicle types",
    newLabel: "New vehicle type",
  },
  vehicle: {
    Form: VehicleForm,
    fields: vehicleFields,
    layout: vehicleLayout,
    seed: vehicleSeed,
    heading: "Vehicles",
    newLabel: "New vehicle",
  },
};

const ENTITY_ORDER: entity[] = ["vehicleType", "vehicle"];

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
 * Single host screen with two stacked record lists (Vehicle types + Vehicles)
 * feeding one detail pane. Selecting an item swaps the pane to that entity's
 * data-aware form; the pane owns the four host concerns — stable auth headers,
 * new-vs-edit via `netexId`, discard via remount `key`, and reacting to saves.
 */
const GqlHostPage = ({ tabStyle = "one-line" }: GqlHostPageProps) => {
  const { variant, slotProps } = useMemo(() => deriveTabs(tabStyle), [tabStyle]);
  const [selection, setSelection] = useState<Selection | null>({
    entity: "vehicle",
    netexId: "VEH:Vehicle:701",
  });
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [toast, setToast] = useState<SaveToast | null>(null);
  // Reported by the form itself — the host no longer diffs anything to know
  // whether leaving edit mode would lose work.
  const [dirty, setDirty] = useState(false);
  // One piece of state for both directions: the form reports the section being
  // read, the TOC requests one, and the form ignores its own reports coming back.
  const [section, setSection] = useState<string>();

  const selectRecord = (entity: entity, netexId?: string) => {
    setSelection({ entity, netexId });
    setSection(undefined); // sections belong to a record's form, not to the page
    setDirty(false); // the new record's form reports its own state on mount
    setMode(netexId ? "view" : "edit"); // existing → view; new → straight to edit
  };

  const active = selection ? ENTITY[selection.entity] : null;
  const Form = active?.Form;
  // Same call the form makes, so the list is what the form renders — and only
  // a stacked form with several sections has anything to navigate.
  const tocSections = useMemo(() => {
    const labels = active ? resolveSections(active.fields, active.layout).map((s) => s.label) : [];
    return variant === "stacked" && labels.length > 1 ? labels : [];
  }, [active, variant]);

  return (
    <Paper
      elevation={0}
      sx={{ display: "flex", minHeight: "100vh", bgcolor: "grey.100" }}
    >
      {/* Left: two stacked record lists, one per entity. */}
      <Box
        sx={{
          width: LIST_WIDTH,
          flexShrink: 0,
          borderRight: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
          overflowY: "auto",
        }}
      >
        {ENTITY_ORDER.map((entity) => {
          const cfg = ENTITY[entity];
          return (
            <Box key={entity}>
              <List
                dense
                subheader={
                  // 2-col header: title (left) + new-button (right).
                  <ListSubheader
                    disableSticky
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      pr: 1,
                    }}
                  >
                    {cfg.heading}
                    <IconButton
                      size="small"
                      edge="end"
                      aria-label={cfg.newLabel}
                      title={cfg.newLabel}
                      onClick={() => selectRecord(entity)}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  </ListSubheader>
                }
              >
                {Object.values(cfg.seed).map((r) => (
                  <ListItemButton
                    key={r.netexId}
                    selected={
                      selection?.entity === entity &&
                      selection?.netexId === r.netexId
                    }
                    onClick={() => selectRecord(entity, r.netexId)}
                  >
                    <ListItemText
                      primary={r.name?.value ?? r.netexId}
                      secondary={r.netexId}
                    />
                  </ListItemButton>
                ))}
              </List>
              <Divider />
            </Box>
          );
        })}
      </Box>

      {/* Middle: table of contents for the stacked form, when there is one. */}
      {tocSections.length > 0 && (
        <Box
          sx={{
            width: TOC_WIDTH,
            flexShrink: 0,
            borderRight: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {/* The page scrolls, not the column, so the list is pinned inside it. */}
          <Box sx={{ position: "sticky", top: 0, p: 2 }}>
            <Typography variant="overline" color="text.secondary">
              On this page
            </Typography>
            <SectionToc
              sections={tocSections}
              active={section ?? tocSections[0]}
              onSelect={setSection}
              label="On this page"
            />
          </Box>
        </Box>
      )}

      {/* Right: the selected entity's data-aware form + host chrome. */}
      <Box sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 4 } }}>
        {selection && active && Form ? (
          <>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 2 }}
            >
              <Typography variant="h6">
                {selection.netexId ?? active.newLabel}
              </Typography>
              {mode === "view" ? (
                <Button variant="outlined" onClick={() => setMode("edit")}>
                  Edit
                </Button>
              ) : (
                // Discard now lives in the form's own footer, so the page only
                // has to refuse the exit while there is something to lose. The
                // hint sits on a wrapper: MUI gives `.Mui-disabled` a
                // `pointer-events: none` (ButtonBase), so a `title` on the
                // button itself would never surface — exactly when it is needed.
                <span
                  title={dirty ? "Save or cancel your changes first" : undefined}
                >
                  <Button
                    color="inherit"
                    disabled={dirty}
                    onClick={() => setMode("view")}
                  >
                    Done
                  </Button>
                </span>
              )}
            </Stack>

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
                mode={mode}
                variant={variant}
                slotProps={slotProps}
                layout={active.layout}
                onDirtyChange={setDirty}
                activeSection={section}
                onActiveSectionChange={setSection}
                onSaved={(id) => {
                  setSelection({ entity: selection.entity, netexId: id });
                  setMode("view");
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

      <SaveSnackbar toast={toast} onClose={() => setToast(null)} />
    </Paper>
  );
};

const meta: Meta<typeof GqlHostPage> = {
  title: "compositions/GqlHostPages",
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
  args: { tabStyle: "one-line", readDelayMs: DEFAULT_READ_DELAY_MS },
  argTypes: {
    tabStyle: {
      control: "inline-radio",
      options: ["none", "one-line", "pills"],
      description:
        "How multi-section forms (VehicleType) present sections: none = stacked (no tabs) with a table-of-contents column beside the lists, one-line = scrollable tab row, pills = wrapping pill tabs. Vehicle is single-section, so unaffected.",
    },
    readDelayMs: {
      control: { type: "range", min: 0, max: 3000, step: 100 },
      description:
        "Mock read latency. Raise it to watch the shaped skeleton and the arrival fade; 0 resolves in the same tick, so neither is visible. Select a record in either list to re-trigger a load.",
    },
  },
};
export default meta;
type Story = StoryObj<typeof GqlHostPage>;

export const HostPage01: Story = {};
