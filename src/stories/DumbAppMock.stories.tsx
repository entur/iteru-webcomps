import { useState, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  Box,
  Button,
  Card,
  CardContent,
  Drawer,
  IconButton,
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import {
  createAbstractEntityDetailsForm,
  EditFooter,
  vehicleFields,
  vehicleTypeFields,
  type Vehicle,
  type VehicleType,
} from "../index";
import { vehicleSample, vehicleTypeSample } from "./initDataSets";
import { vehicleLayout, vehicleTypeLayout } from "./initLayouts";

// Presentational (controlled) form instances — this mock owns the value/onChange
// and save UX itself. The library exports only the factory; the client names its
// own instances.
const DumbVehicleForm = createAbstractEntityDetailsForm<Vehicle>(vehicleFields);
const DumbVehicleTypeForm =
  createAbstractEntityDetailsForm<VehicleType>(vehicleTypeFields);

// Width of the form Drawer (right anchor).
const DRAWER_WIDTH = 480;

/** Which entity flavour the Drawer is showing (null = closed). */
type Flavour = "type" | "vehicle" | null;

/**
 * How section tabs are presented:
 * - `none`      → no tabs at all (stacked sections).
 * - `one-line`  → scrollable tabs on a single line, swipe/wheel to reach overflow.
 * - `pills`     → wrapping pill/segmented tabs (hathor's VehicleTypeForm style):
 *                 no underline indicator, filled active pill, tabs wrap onto a
 *                 second line when the rail is too narrow.
 */
type TabStyle = "none" | "one-line" | "pills";

/**
 * Tabs `slotProps` reproducing hathor's wrapping pill tabs. Needs the
 * `standard` variant (scrollable forces a single non-wrapping row) plus a
 * flex-wrap container and filled-pill tab styling.
 */
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

/* ------------------------------------------------------------------ *\
   Dirty tracking (client-side — the lib is pure: controlled, no save)
\* ------------------------------------------------------------------ */

/** Snapshot deep-equality. Entity values keep a stable key order (samples +
 *  immutable `setPath` updates preserve insertion order), so a JSON compare is
 *  a sufficient dirty check for a story — no deep-equal dependency needed. */
const eq = (a: unknown, b: unknown): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Pair a controlled `value` with a committed baseline so the host can tell when
 * a form is dirty. The form factory stays save-agnostic; this is the client's
 * job, demonstrated here.
 *
 * @param initial Seed value, also the first baseline.
 * @returns `{ value, setValue, dirty, save, cancel }` — `save` adopts the live
 *          value as the new baseline; `cancel` reverts edits back to it.
 */
function useEditable<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [baseline, setBaseline] = useState<T>(initial);
  return {
    value,
    setValue,
    dirty: !eq(value, baseline),
    save: () => setBaseline(value),
    cancel: () => setValue(baseline),
  };
}

/* ------------------------------------------------------------------ *\
   Tab-style selector (shared by the mock cards)
\* ------------------------------------------------------------------ */

/**
 * Track a tab style and derive the form's section `variant` + Tabs `slotProps`:
 * `none` stacks (no tabs); `one-line` scrolls on one row with `>` chevrons;
 * `pills` wraps into hathor's filled pills.
 *
 * @param initial Starting style (default `none`).
 * @returns `{ tabStyle, setTabStyle, variant, slotProps }`.
 */
function useTabStyle(initial: TabStyle = "none") {
  const [tabStyle, setTabStyle] = useState<TabStyle>(initial);
  const variant = tabStyle === "none" ? "stacked" : "tabs";
  const slotProps =
    tabStyle === "pills"
      ? { tabs: { variant: "standard" as const, sx: PILL_TABS_SX } }
      : {
          tabs: {
            variant: "scrollable" as const,
            scrollButtons: "auto" as const,
            allowScrollButtonsMobile: true,
          },
        };
  return { tabStyle, setTabStyle, variant, slotProps } as const;
}

/** Captioned none|one-line|pills toggle, as placed in the mock cards. */
const TabStyleToggle = ({
  value,
  onChange,
}: {
  value: TabStyle;
  onChange: (v: TabStyle) => void;
}) => (
  <Stack spacing={0.5}>
    <Typography variant="caption" color="text.secondary">
      tabs style
    </Typography>
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(_e, v: TabStyle | null) => v && onChange(v)}
    >
      <ToggleButton value="none">none</ToggleButton>
      <ToggleButton value="one-line">one-line</ToggleButton>
      <ToggleButton value="pills">pills</ToggleButton>
    </ToggleButtonGroup>
  </Stack>
);

/* ------------------------------------------------------------------ *\
   Shared mock chrome
\* ------------------------------------------------------------------ */

/** Human label per Drawer flavour. */
const FLAVOUR_LABEL: Record<NonNullable<Flavour>, string> = {
  type: "Vehicle Type",
  vehicle: "Vehicle",
};

/**
 * Shared mock surface: the responsive Paper grid with a left-biased Card column
 * (golden-ish 25% on `md`+, single centered column below it), plus the
 * right-anchored Drawer. Each story passes its card body as `children` and its
 * form Drawer as `drawer`.
 *
 * @param children Card body (controls + launch buttons).
 * @param drawer   The `<Drawer>` element, rendered as a sibling of the Card.
 */
const MockShell = ({
  children,
  drawer,
}: {
  children: ReactNode;
  drawer: ReactNode;
}) => (
  <Paper
    elevation={0}
    sx={{
      display: "grid",
      // Gutters 1fr left : 3fr right around the centered card column → card
      // center lands at ~25% of the Paper width. Collapse to a single centered
      // column on small screens so the gutters don't crush the card.
      gridTemplateColumns: { xs: "1fr", md: "1fr auto 3fr" },
      justifyItems: { xs: "center", md: "stretch" },
      alignItems: "start",
      gap: { xs: 3, md: 8 },
      minHeight: "100vh",
      p: { xs: 2, sm: 4, md: 8 },
      bgcolor: "grey.100",
    }}
  >
    <Card sx={{ gridColumn: { xs: "1", md: 2 }, maxWidth: 360, width: "100%" }}>
      <CardContent
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
        }}
      >
        {children}
      </CardContent>
    </Card>
    {drawer}
  </Paper>
);

/**
 * Save-or-cancel variant: the Drawer becomes a full-height shell — titled
 * header · scrolling form · the library's `EditFooter`, dormant until the form
 * is dirty. Dirtiness is tracked per entity via `useEditable`: the form factory
 * knows nothing of save, so on this presentational path the host still owns the
 * baseline (the data-aware wrappers get theirs from `useEntityForm`).
 */
const SaveOrCancelMock = () => {
  const [open, setOpen] = useState<Flavour>(null);
  const type = useEditable<VehicleType>(vehicleTypeSample);
  const vehicle = useEditable<Vehicle>(vehicleSample);
  const { tabStyle, setTabStyle, variant, slotProps } = useTabStyle();
  // The editable bound to whichever flavour the Drawer is showing.
  const active = open ? { type, vehicle }[open] : null;
  const dirty = active?.dirty ?? false;
  const close = () => setOpen(null);

  return (
    <MockShell
      drawer={
        <Drawer anchor="right" open={open !== null} onClose={close}>
          <Box
            sx={{
              width: { xs: "100vw", sm: DRAWER_WIDTH },
              maxWidth: "100vw",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              boxSizing: "border-box",
            }}
          >
            {/* Header: entity title + close X. */}
            <Box
              sx={{
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                px: { xs: 2, sm: 3 },
                py: 1.5,
                borderBottom: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {open && FLAVOUR_LABEL[open]}
              </Typography>
              <IconButton aria-label="Close" onClick={close} size="small">
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>

            {/* Scrolling form body — the only part that overflows. `minHeight: 0`
              lets this flex child shrink below its content height on short
              viewports so its own scroll kicks in and the footer stays pinned
              (without it, a tall form pushes the footer out of the drawer). */}
            <Box
              sx={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                px: { xs: 2, sm: 3 },
                py: 2,
              }}
            >
              {open === "type" && (
                <DumbVehicleTypeForm
                  mode="edit"
                  variant={variant}
                  slotProps={slotProps}
                  layout={vehicleTypeLayout}
                  value={type.value}
                  onChange={type.setValue}
                />
              )}
              {open === "vehicle" && (
                <DumbVehicleForm
                  mode="edit"
                  variant={variant}
                  slotProps={slotProps}
                  layout={vehicleLayout}
                  value={vehicle.value}
                  onChange={vehicle.setValue}
                />
              )}
            </Box>

            {/* The library's own footer, driven by host-owned state: these are
              presentational forms, so `dirty`/save/cancel come from `useEditable`
              rather than from `useEntityForm`. Same component the data-aware
              wrappers render for themselves. */}
            <EditFooter
              dirty={dirty}
              onSave={() => active?.save()}
              onCancel={() => active?.cancel()}
              sx={{ flexShrink: 0 }}
            />
          </Box>
        </Drawer>
      }
    >
      <TabStyleToggle value={tabStyle} onChange={setTabStyle} />
      <Typography variant="body1" align="center">
        Edit a field — Save / Cancel wake up once the form is dirty
      </Typography>
      <Stack direction="row" spacing={2}>
        <Button variant="contained" onClick={() => setOpen("type")}>
          Type
        </Button>
        <Button variant="contained" onClick={() => setOpen("vehicle")}>
          Vehicle
        </Button>
      </Stack>
    </MockShell>
  );
};

const meta: Meta<typeof SaveOrCancelMock> = {
  title: "HostPages/Modal",
  component: SaveOrCancelMock,
  parameters: { layout: "fullscreen" },
};
export default meta;
type Story = StoryObj<typeof SaveOrCancelMock>;

export const Modal: Story = {};
