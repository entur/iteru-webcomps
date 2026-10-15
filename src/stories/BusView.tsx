/**
 * Story-only 3D preview of the open record (#60): a header toolbar toggling a
 * PNG shot (`mkStageShot`) and a live three.js canvas (`mkStage`), over a box
 * that fills the width it is given. The input comes from `toBusInput`; what it
 * lacks, or what 3dbus rejects, is listed instead of drawing a bus.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Paper,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from "@mui/material";
import AnimationIcon from "@mui/icons-material/Animation";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import ThreeSixtyIcon from "@mui/icons-material/ThreeSixty";
import ViewInArIcon from "@mui/icons-material/ViewInAr";
import {
  MM,
  faces,
  mkBus,
  mkStage,
  mkStageShot,
  mkViews,
  total,
  validate,
  type BusGroup,
} from "@entur/iteru-3dbus";
import type { BusInput, BusInputResult } from "../index";
import { humanize } from "../shared/humanize";
import { UNIT_LABELS } from "./initLayouts";
import { mkMotion, type BusMotion } from "./busMotion";

/** `bitmap` = a PNG of the scene; `3d` = the live, orbitable canvas. */
export type BusViewMode = "bitmap" | "3d";

// Box shape, edit settle time, and how far the type's own length may sit from
// the sections' sum (rounding of metres) before it is flagged.
const ASPECT = "16 / 10", SETTLE_MS = 250, LENGTH_TOLERANCE_MM = 10;
// A PNG is shot at the box's device pixels, capped so a 4K screen stays cheap.
const MAX_DPR = 2;
const VIEW = "quarter";
// The in-canvas camera control: inset from the corner (px) and how much of the
// scene shows through it.
const CONTROL_INSET = 8, CONTROL_OPACITY = 0.92;
/** Shown in place of the bus when the browser gives no WebGL context (off, or
 *  out of contexts): the preview fails alone, never the page around it. */
const NO_WEBGL = "No 3D here: the browser could not create a WebGL context.";

/** A value that only follows `v` once it has held still for `ms`. */
const useSettled = <T,>(v: T, ms: number): T => {
  const [settled, setSettled] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setSettled(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return settled;
};

/** The element's content size, kept current. */
const useSize = (): [(el: HTMLDivElement | null) => void, { w: number; h: number }] => {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!el) return;
    const ro = new ResizeObserver(([e]) =>
      setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return [setEl, size];
};

/** Centre a fresh bus on the origin (3dbus puts the front at x = 0). */
const build = (inp: BusInput): { group: BusGroup; len: number } => {
  const group = mkBus(inp, faces(inp)), len = total(inp) * MM;
  group.position.x = -len / 2;
  return { group, len };
};

/** One live stage, the bus it shows, and whether it is still undisposed. */
type Scene = {
  stage: ReturnType<typeof mkStage>;
  go: ReturnType<typeof mkViews>;
  cur: { group: BusGroup | null; len: number };
  motion: ReturnType<typeof mkMotion>;
  framed: boolean;
  live: boolean;
};

interface LiveProps {
  inp: BusInput;
  motion: BusMotion;
  onMotionChange: (motion: BusMotion) => void;
}

/**
 * The live canvas: one stage for the component's life, the bus swapped per
 * input. Over it, top right, the Orbit | Animate control; a grab on the canvas
 * itself ends the flight at once and hands the camera over where it is.
 */
const Live = ({ inp, motion, onMotionChange }: LiveProps) => {
  const box = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const [failed, setFailed] = useState(false);
  // Read from the stage's own listener, so a new callback needs no re-attach.
  const report = useRef(onMotionChange);
  report.current = onMotionChange;

  useEffect(() => {
    let stage: Scene["stage"];
    try {
      stage = mkStage(box.current!);
    } catch {
      setFailed(true);
      return;
    }
    const cur: Scene["cur"] = { group: null, len: 0 };
    const s: Scene = {
      stage,
      go: mkViews(stage, () => s.cur),
      cur,
      motion: mkMotion(stage, { onTakeOver: () => report.current("orbit") }),
      framed: false,
      live: true,
    };
    scene.current = s;
    return () => {
      s.live = false;
      s.motion.dispose();
      stage.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    const bus = build(inp);
    s.cur = bus;
    s.stage.add(bus.group);
    // Frame the first bus only: an edit keeps whatever view the reader orbited to.
    if (!s.framed) s.go(VIEW, true);
    s.framed = true;
    return () => {
      if (s.live) s.stage.drop(bus.group);
    };
  }, [inp]);

  // After the framing above, so a flight starts from the framed view.
  useEffect(() => scene.current?.motion.set(motion), [motion]);

  if (failed) return <Alert severity="error">{NO_WEBGL}</Alert>;
  return (
    <>
      <Box ref={box} data-bus-view="3d" data-motion={motion} sx={{ position: "absolute", inset: 0 }} />
      <ToggleButtonGroup
        exclusive
        size="small"
        value={motion}
        onChange={(_e, v: BusMotion | null) => v && onMotionChange(v)}
        aria-label="Camera"
        sx={{
          position: "absolute",
          top: CONTROL_INSET,
          right: CONTROL_INSET,
          bgcolor: "background.paper",
          opacity: CONTROL_OPACITY,
        }}
      >
        <ToggleButton value="orbit" aria-label="Orbit">
          <ThreeSixtyIcon fontSize="small" sx={{ mr: 0.5 }} />
          Orbit
        </ToggleButton>
        <ToggleButton value="animate" aria-label="Animate">
          <AnimationIcon fontSize="small" sx={{ mr: 0.5 }} />
          Animate
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
};

/** The PNG: a throwaway shot stage per input and size, disposed once it has shot. */
const Shot = ({ inp, w, h, bg }: { inp: BusInput; w: number; h: number; bg: string }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!w || !h) return;
    let current = true, made: string | null = null;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    let stage: ReturnType<typeof mkStageShot>;
    try {
      stage = mkStageShot({ w: Math.round(w * dpr), h: Math.round(h * dpr), bg });
    } catch {
      setFailed(true);
      return;
    }
    const bus = build(inp);
    stage.add(bus.group);
    mkViews(stage, () => bus)(VIEW, true); // instant: a shot stage has no frame loop
    stage
      .shot()
      .then(blob => {
        if (!current) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
        setFailed(false);
      })
      .catch(() => current && setFailed(true))
      .finally(() => {
        stage.drop(bus.group);
        stage.dispose();
      });
    return () => {
      current = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [inp, w, h, bg]);

  if (failed) return <Alert severity="error">{NO_WEBGL}</Alert>;
  return url ? (
    <Box
      component="img"
      src={url}
      alt="Bus, three-quarter view"
      data-bus-view="bitmap"
      sx={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  ) : null;
};

const labelOf = (key: string): string =>
  (UNIT_LABELS as Record<string, string>)[key] ?? humanize(key);

export interface BusViewProps {
  /** `toBusInput`'s result for the open record; `null` = nothing selected. */
  result: BusInputResult | null;
  /** The type's own `length` in metres, checked against the sections' sum. */
  lengthM?: number | null;
  /** Where the missing values live, when that is not the open form — a
   *  Vehicle is drawn over its type, so most of them are the type's. */
  missingWhere?: string;
  mode: BusViewMode;
  onModeChange: (mode: BusViewMode) => void;
  /** The live canvas's camera: the reader's (`orbit`) or the ∞ flight. */
  motion: BusMotion;
  onMotionChange: (motion: BusMotion) => void;
}

/**
 * The preview column: a header with the bitmap / 3D toggle, then the bus, or
 * what stops it from being drawn.
 *
 * @param props see {@link BusViewProps}
 * @returns an outlined panel as wide as its parent
 */
export function BusView({
  result,
  lengthM,
  missingWhere,
  mode,
  onModeChange,
  motion,
  onMotionChange,
}: BusViewProps) {
  const bg = useTheme().palette.background.paper;
  // Keystrokes reach here through the form's onChange; let them settle, and
  // key on content so an equal input never rebuilds the bus.
  const key = useSettled(result ? JSON.stringify(result) : "", SETTLE_MS);
  const settled = useMemo(() => (key ? (JSON.parse(key) as BusInputResult) : null), [key]);
  const inp = settled?.ok ? settled.inp : null;
  const errors = useMemo(() => (inp ? validate(inp) : []), [inp]);
  const [boxRef, size] = useSize();

  const sum = inp && !errors.length ? total(inp) : null;
  const drift = sum !== null && lengthM != null && Math.abs(lengthM * 1000 - sum) > LENGTH_TOLERANCE_MM;

  return (
    <Paper variant="outlined" sx={{ minWidth: 0, overflow: "hidden" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2,
          py: 1,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="overline" color="text.secondary" sx={{ flex: 1 }}>
          3D preview
        </Typography>
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_e, v: BusViewMode | null) => v && onModeChange(v)}
          aria-label="Preview as"
        >
          <ToggleButton value="bitmap" aria-label="Bitmap">
            <ImageOutlinedIcon fontSize="small" sx={{ mr: 0.5 }} />
            Bitmap
          </ToggleButton>
          <ToggleButton value="3d" aria-label="3D">
            <ViewInArIcon fontSize="small" sx={{ mr: 0.5 }} />
            3D
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {settled && !settled.ok && (
        <Alert severity="info" sx={{ m: 2 }}>
          Fill in to draw the bus: {settled.missing.map(labelOf).join(", ")}
          {missingWhere ? ` (${missingWhere})` : ""}.
        </Alert>
      )}
      {errors.length > 0 && (
        <Alert severity="warning" sx={{ m: 2 }}>
          3dbus rejects this input:
          <Box component="ul" sx={{ m: 0, pl: 2 }}>
            {errors.map(e => (
              <li key={e}>{e}</li>
            ))}
          </Box>
        </Alert>
      )}
      {drift && (
        <Alert severity="warning" sx={{ mx: 2, mt: 2 }}>
          Length is {lengthM} m, but the sections add up to {sum! / 1000} m.
        </Alert>
      )}
      {!settled && (
        <Typography color="text.secondary" sx={{ m: 2 }}>
          Select a record to preview it.
        </Typography>
      )}

      {inp && !errors.length && (
        <Box ref={boxRef} sx={{ position: "relative", width: "100%", aspectRatio: ASPECT }}>
          {mode === "3d" ? (
            <Live inp={inp} motion={motion} onMotionChange={onMotionChange} />
          ) : (
            <Shot inp={inp} w={size.w} h={size.h} bg={bg} />
          )}
        </Box>
      )}
    </Paper>
  );
}
