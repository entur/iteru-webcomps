/**
 * One VehicleType as a bus PNG, sized to fill its parent (the cards-big
 * picture area). A skeleton stands in while the shared queue gets to it; a
 * record 3D can't draw shows the generic vehicle picture with a caption saying
 * so, the reason on hover. Story-only, like the queue behind it.
 */
import { useEffect, useMemo, useState } from "react";
import { Box, Skeleton, Typography, useTheme } from "@mui/material";
import { validate } from "@entur/iteru-3dbus";
import { toBusInput, type BusInput, type VehicleType } from "../index";
import { STILL_SKELETONS } from "../shared/motion";
import { phrase } from "./busScene";
import { NoWebGL, shotQueueFor } from "./shotQueue";
import genericVehicle from "./assets/no-render-data.png";

const LOADING_LABEL = "Rendering preview";
const NO_PREVIEW = "No 3D preview";
const NO_WEBGL = "The browser could not create a WebGL context.";
// The caption's inset from the picture's corner (theme spacing).
const CAPTION_INSET = 1;

const FILL = { position: "relative", width: "100%", height: "100%" } as const;
const IMG_SX = { display: "block", width: "100%", height: "100%", objectFit: "contain" } as const;

/** What a record comes to: an input to shoot, or why there is none. */
type Plan = { inp: BusInput; key: string } | { why: string };

const planOf = (vt: VehicleType): Plan => {
  const r = toBusInput(vt);
  if (!r.ok) return { why: `Fill in ${phrase(r.missing)}` };
  const errors = validate(r.inp);
  return errors.length ? { why: errors[0] } : { inp: r.inp, key: JSON.stringify(r.inp) };
};

/**
 * The generic vehicle picture: what a card shows when there is no 3D shot.
 *
 * @param why when set, a "No 3D preview" caption over the picture, with this
 *   as its hover text
 * @returns the picture, filling its parent
 */
export function GenericVehicle({ why }: { why?: string }) {
  return (
    <Box sx={FILL}>
      <Box component="img" src={genericVehicle} alt="" sx={IMG_SX} />
      {why ? (
        <Typography
          variant="caption"
          color="text.secondary"
          title={why}
          sx={{
            position: "absolute",
            left: t => t.spacing(CAPTION_INSET),
            bottom: t => t.spacing(CAPTION_INSET),
            px: 0.75,
            borderRadius: 1,
            bgcolor: "background.paper",
          }}
        >
          {NO_PREVIEW}
        </Typography>
      ) : null}
    </Box>
  );
}

/**
 * A VehicleType's bus, shot by the page's shared queue.
 *
 * @param vt the row to draw
 * @returns a skeleton, then the PNG — or the generic picture, captioned
 */
export function BusShot({ vt }: { vt: VehicleType }) {
  const bg = useTheme().palette.background.paper;
  const plan = useMemo(() => planOf(vt), [vt]);
  const key = "key" in plan ? plan.key : null;
  // Tagged with what it was shot for, so a new record never shows the old one's.
  const [shot, setShot] = useState<{ for: string; url?: string; why?: string } | null>(null);
  const tag = `${bg}|${key}`;

  useEffect(() => {
    if (!("inp" in plan)) return;
    const ac = new AbortController();
    shotQueueFor(bg)
      .request(plan.key, plan.inp, ac.signal)
      .then(
        url => setShot({ for: tag, url }),
        e => {
          if (ac.signal.aborted) return;
          setShot({ for: tag, why: e instanceof NoWebGL ? NO_WEBGL : e instanceof Error ? e.message : String(e) });
        }
      );
    return () => ac.abort();
  }, [plan, bg, tag]);

  if ("why" in plan) return <GenericVehicle why={plan.why} />;
  // A PNG already shot shows on the first render: paging back never flashes a skeleton.
  const url = (shot?.for === tag ? shot.url : undefined) ?? shotQueueFor(bg).peek(plan.key);
  const why = shot?.for === tag ? shot.why : undefined;
  if (why) return <GenericVehicle why={why} />;
  if (url) {
    return (
      <Box sx={{ ...FILL, bgcolor: "background.paper" }}>
        <Box component="img" src={url} alt={`${vt.name?.value ?? "Bus"}, three-quarter view`} sx={IMG_SX} />
      </Box>
    );
  }
  return (
    <Box role="status" aria-busy="true" aria-label={LOADING_LABEL} sx={[FILL, STILL_SKELETONS]}>
      <Skeleton variant="rectangular" animation="wave" sx={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
