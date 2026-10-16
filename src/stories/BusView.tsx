/**
 * Story-only 3D preview of the open record (#60): a header toolbar toggling a
 * PNG shot (`mkStageShot`) and a live three.js canvas (`mkStage`), over a box
 * that fills the width it is given. The input comes from `toBusInput`; what it
 * lacks, or what 3dbus rejects, is listed instead of drawing a bus.
 *
 * Takes the result as given: the host settles its edits before handing them
 * over, and the result carries its own length check, so nothing here can pair
 * an input with a length from another record.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Paper,
  Skeleton,
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
  mkStage,
  mkStageShot,
  mkViews,
  validate,
  type BusGroup,
  type ShotStage,
  type Stage,
} from "@entur/iteru-3dbus";
import type { BusInput, BusInputResult } from "../index";
import { STILL_SKELETONS } from "../shared/motion";
import { build, phrase, VIEW } from "./busScene";
import { mkMotion, type BusMotion } from "./busMotion";
import { useSize } from "./hooks";

/** `bitmap` = a PNG of the scene; `3d` = the live, orbitable canvas. */
export type BusViewMode = "bitmap" | "3d";

// Box shape, and how long a resize must hold before the PNG is shot again
// (each shot is a fresh WebGL context, so not one per pixel of a drag).
const ASPECT = "16 / 10", RESHOOT_MS = 250;
// The in-canvas camera control: inset from the corner (px) and how much of the
// scene shows through it.
const CONTROL_INSET = 8, CONTROL_OPACITY = 0.92;
/** Shown in place of the bus when the browser gives no WebGL context (off, or
 *  out of contexts): the preview fails alone, never the page around it. */
const NO_WEBGL = "No 3D here: the browser could not create a WebGL context.";
const LOADING_LABEL = "Loading preview";

/** One live stage and the bus it shows (`cur.group` null until the first). */
type Scene = {
  stage: Stage;
  go: ReturnType<typeof mkViews>;
  cur: { group: BusGroup | null; len: number };
  motion: ReturnType<typeof mkMotion>;
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
    let stage: Stage;
    try {
      stage = mkStage(box.current!);
    } catch {
      setFailed(true);
      return;
    }
    const s: Scene = {
      stage,
      go: mkViews(stage, () => s.cur),
      cur: { group: null, len: 0 },
      motion: mkMotion(stage, { onTakeOver: () => report.current("orbit") }),
    };
    scene.current = s;
    return () => {
      s.motion.dispose();
      // `dispose` frees everything but a model still added: drop it first.
      if (s.cur.group) stage.drop(s.cur.group);
      stage.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    const prev = s.cur.group;
    if (prev) s.stage.drop(prev);
    const bus = build(inp);
    s.cur = bus;
    s.stage.add(bus.group);
    // Frame the first bus only: an edit keeps whatever view the reader orbited to.
    if (!prev) s.go(VIEW, true);
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

/**
 * The PNG: a throwaway shot stage per input and (settled) size, disposed once
 * it has shot. Sized in CSS px — 3dbus applies the device pixel ratio itself.
 */
const Shot = ({ inp, bg }: { inp: BusInput; bg: string }) => {
  const [boxRef, { w, h }] = useSize(RESHOOT_MS);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!w || !h) return;
    let current = true, made: string | null = null;
    let stage: ShotStage;
    try {
      stage = mkStageShot({ w, h, bg });
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
  return (
    <Box ref={boxRef} sx={{ position: "absolute", inset: 0 }}>
      {url && (
        <Box
          component="img"
          src={url}
          alt="Bus, three-quarter view"
          data-bus-view="bitmap"
          sx={{ width: "100%", height: "100%", display: "block" }}
        />
      )}
    </Box>
  );
};

export interface BusViewProps {
  /** `toBusInput`'s result for the open record; `null` = nothing selected. */
  result: BusInputResult | null;
  /** The record is still loading: a skeleton stands in, not a missing-data note. */
  loading?: boolean;
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
export function BusView({ result, loading = false, mode, onModeChange, motion, onMotionChange }: BusViewProps) {
  const bg = useTheme().palette.background.paper;
  const res = loading ? null : result;
  const inp = res?.ok ? res.inp : null;
  const errors = useMemo(() => (inp ? validate(inp) : []), [inp]);
  const drift = res?.ok && !errors.length ? res.lengthDrift : undefined;

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

      {loading && (
        <Box
          role="status"
          aria-busy="true"
          aria-label={LOADING_LABEL}
          sx={STILL_SKELETONS}
        >
          <Skeleton
            variant="rectangular"
            animation="wave"
            data-bus-view="loading"
            sx={{ width: "100%", height: "auto", aspectRatio: ASPECT, transform: "none" }}
          />
        </Box>
      )}
      {res && !res.ok && (
        <Alert severity="info" sx={{ m: 2 }}>
          Fill in to draw the bus — {phrase(res.missing)}.
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
          Length is {drift.stated} m, but the sections add up to {drift.sections} m.
        </Alert>
      )}
      {!loading && !res && (
        <Typography color="text.secondary" sx={{ m: 2 }}>
          Select a record to preview it.
        </Typography>
      )}

      {inp && !errors.length && (
        <Box sx={{ position: "relative", width: "100%", aspectRatio: ASPECT }}>
          {mode === "3d" ? (
            <Live inp={inp} motion={motion} onMotionChange={onMotionChange} />
          ) : (
            <Shot inp={inp} bg={bg} />
          )}
        </Box>
      )}
    </Paper>
  );
}
