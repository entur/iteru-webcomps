/**
 * Minimal types for `@entur/iteru-3dbus` (v0.1.0 ships plain JS, no `.d.ts`).
 * Declares only what this repo calls. Used by the stories and tests only — the
 * library build never imports the package, so nothing here reaches `dist`.
 */
declare module '@entur/iteru-3dbus/core' {
  /** Shape: the package's `schema/bus-input.schema.json`. */
  export type BusInput = object;
  /** mm → three.js scene units (metres). */
  export const MM: number;
  /** Schema check, then the cross-field rules; `[]` when valid. */
  export function validate(inp: unknown): string[];
  /** Overall length in mm: sections plus bellows. */
  export function total(inp: BusInput): number;
}

declare module '@entur/iteru-3dbus' {
  export * from '@entur/iteru-3dbus/core';
  import type { BusInput } from '@entur/iteru-3dbus/core';

  export type FaceMaps = Record<'right' | 'left' | 'front' | 'rear', { svg: SVGSVGElement; w: number; h: number }[]>;
  /** A three.js group; only its position is touched here. */
  export interface BusGroup {
    position: { x: number };
  }
  /** The slice of a three.js `Vector3` used here. */
  export interface Vec3 {
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): Vec3;
  }
  export interface Stage {
    /** The perspective camera; only its position is moved here. */
    cam: { position: Vec3 };
    /** three's `OrbitControls`: `start` fires when the reader grabs the view. */
    ctl: {
      target: Vec3;
      addEventListener(type: 'start', fn: () => void): void;
      removeEventListener(type: 'start', fn: () => void): void;
    };
    /** Run before every frame, in order (live stage only; a shot stage has none). */
    ticks: (() => void)[];
    add(g: BusGroup): void;
    drop(g: BusGroup): void;
    dispose(): void;
  }
  export interface ShotStage extends Stage {
    /** A transparent PNG of the current view; rejects if the canvas gives none. */
    shot(): Promise<Blob>;
  }
  export type ViewName = 'quarter' | 'left' | 'right' | 'front' | 'rear' | 'top';

  export function faces(inp: BusInput): FaceMaps;
  export function mkBus(inp: BusInput, maps: FaceMaps, opts?: { detail?: number }): BusGroup;
  /** Live stage in `el`; the canvas follows the element's size. */
  export function mkStage(el: HTMLElement): Stage;
  /** Off-screen stage for PNGs. `bg` (hex / rgb() / rgba()) colours the ground. */
  export function mkStageShot(opts?: { w?: number; h?: number; bg?: string }): ShotStage;
  /** Camera mover; `instant` is required on a shot stage (it has no frame loop). */
  export function mkViews(
    stage: Stage,
    model: () => { group: BusGroup | null; len: number }
  ): (view?: ViewName, instant?: boolean) => void;
}
