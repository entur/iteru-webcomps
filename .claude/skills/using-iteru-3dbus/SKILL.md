---
name: using-iteru-3dbus
description: 'Use when rendering a bus in 3D, or a picture of one, inside this lib or hathor: a VehicleType preview, collection cards with bus thumbnails, or anything importing @entur/iteru-3dbus (mkBus, faces, mkStage, mkStageShot, validate). Also when TypeScript reports no declaration file for it, when a test fails creating a WebGLRenderer under jsdom, or when "too many active WebGL contexts" appears.'
---

# Using `@entur/iteru-3dbus`

A boxy 3D bus in three.js from **one input JSON** (contract v2.0, units **mm**). The library is plain ES modules with no types and no React. The data path is always: `validate(inp)` → `faces(inp)` → `mkBus(inp, maps)`. Source, schema and examples: <https://github.com/entur/iteru-3dbus>.

## Install

Not on a registry: install the GitHub Release tarball with three as its **peer**. 0.x caret ranges are narrow, so `three@latest` (0.186) does not satisfy `^0.180.0`.

```sh
npm i https://github.com/entur/iteru-3dbus/releases/download/v0.1.0/entur-iteru-3dbus-0.1.0.tgz three@^0.180.0
```

- **In this lib:** add both to `peerDependencies` and to `EXTERNAL` in `vite.config.ts`, as with React and MUI. Then the host (hathor) owns one copy of three.
- **Private repo:** the URL needs auth. Run `gh release download v0.1.0 -R entur/iteru-3dbus`, then `npm i ./entur-iteru-3dbus-0.1.0.tgz`.

## Types: add a shim

The package has no `.d.ts`, so `import … from '@entur/iteru-3dbus'` is TS7016 under `strict`. Declare only what you use, in `src/types/iteru-3dbus.d.ts`:

```ts
declare module '@entur/iteru-3dbus' {
  export type BusInput = Record<string, unknown>;        // shape: schema/bus-input.schema.json
  export type FaceMaps = Record<'right' | 'left' | 'front' | 'rear', { svg: SVGSVGElement; w: number; h: number }[]>;
  export interface Stage {
    add(g: unknown): void; drop(g: unknown): void; dispose(): void;
    cam: { position: { lerp(to: unknown, t: number): void } }; ctl: { target: unknown };
  }
  export const MM: number;
  export function validate(inp: unknown): string[];      // [] when valid; faces/mkBus need a valid inp
  export function total(inp: BusInput): number;          // mm
  export function faces(inp: BusInput): FaceMaps;
  export function mkBus(inp: BusInput, maps: FaceMaps, opts?: { detail?: number }): { position: { x: number } };
  export function mkStage(el: HTMLElement): Stage;
  export function mkStageShot(opts?: { w?: number; h?: number; bg?: string }): Stage & { shot(): Promise<Blob> };
  export function mkViews(stage: Stage, model: () => { group: unknown; len: number }): (view?: string, instant?: boolean) => void;
}
```

## One bus, live

```tsx
import { useEffect, useRef } from 'react';
import { MM, faces, mkBus, mkStage, mkViews, total, validate, type BusInput } from '@entur/iteru-3dbus';

export function Bus3D({ inp }: { inp: BusInput }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || validate(inp).length) return;    // show the errors elsewhere; never build an invalid bus
    const stage = mkStage(box.current);                  // the canvas follows the box's size
    const group = mkBus(inp, faces(inp)), len = total(inp) * MM;
    group.position.x = -len / 2;                         // the front is at x = 0: centre it
    stage.add(group);
    mkViews(stage, () => ({ group, len }))('quarter', true);
    return () => stage.dispose();                        // StrictMode's double mount is safe: each run has its own stage
  }, [inp]);
  return <div ref={box} style={{ width: '100%', height: 360 }} />;
}
```

The box needs a real size: a stage with zero width or height draws nothing.

## Many buses: pictures, not canvases

A browser keeps about 16 WebGL contexts, so **never mount one `Bus3D` per card**. Use one `mkStageShot` and shoot the buses one at a time. The ground plane takes its colour from `bg`, and the sky stays transparent:

```ts
let cur: { group: unknown; len: number } = { group: null, len: 0 };
const stage = mkStageShot({ w: 640, h: 360, bg: theme.palette.background.paper }); // the colour the PNG lies on: hex or rgb()/rgba() only
const go = mkViews(stage, () => cur);
for (const { inp, img } of shots) {
  const group = mkBus(inp, faces(inp), { detail: 0.35 }), len = total(inp) * MM; // a third of the texture density: about 2× faster
  group.position.x = -len / 2;
  cur = { group, len };
  stage.add(group);
  go('quarter', true);                                   // instant only: a shot stage has no frame loop
  try {
    const url = URL.createObjectURL(await stage.shot()); // transparent PNG; rejects if the canvas gives none
    img.onload = img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  } catch { /* leave this card blank, shoot the rest */ } finally { stage.drop(group); }
}
stage.dispose();
```

## Input from a sobek `VehicleType`

Required at the root: `schema_version` ("2.0"), `brand`, `model`, `body`, `bus_class`, `floor_type`, `width_mm`, `height_mm`, `tyre`, `base_color.hex`, `sections` (each with `length_mm` and section-relative `axles_mm`). A `VehicleType` covers only part of this:

| VehicleType | Input |
|---|---|
| `length` | `sections[0].length_mm` (rigid) |
| `width`, `height` | `width_mm`, `height_mm` |
| `lowFloor` | `floor_type: 'low_floor'` when true |

NeTEx dimensions are metres, so multiply by 1000; check this against a real sobek record. Axles, tyre, colour, class and body are not in a VehicleType: start from the closest example in the repo's `examples/`, overwrite what you have, and `validate`. Never guess axle positions per field.

## Tests (jsdom)

jsdom has no WebGL, so `mkStage` and `mkStageShot` throw. Test the pure part (`validate`, `total`, `faces`) directly. For components, `vi.mock('@entur/iteru-3dbus')` and assert that `mkStage` and `dispose` are called on mount and unmount.

## Common mistakes

| Symptom | Cause |
|---|---|
| Bus off to one side | `position.x = -len/2` missing |
| Floating, tiny, or huge bus | Metres passed where mm are expected |
| Blank canvas | Box has no height, or `go()` called without `true` on a shot stage |
| Cards go blank after ~16 | One live stage per card instead of `mkStageShot` |
| Two three.js copies warning | three not external / not a peer here |
| A colour scheme switch doesn't recolour the stage | `mkStage` reads the scheme once; rebuild it on the change |
