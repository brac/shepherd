// Live-tunable render values, seeded from the data/visuals.ts constants. The dev panel (`)
// writes these; views read them. Render-only and a module singleton (like the tuning consts
// are imported everywhere) — NEVER imported by sim/state code, so it can't touch determinism
// or headless runs. The mutable counterpart to the immutable visuals constants, mirroring
// the tuning(const) / GameState.dev(runtime) split on the sim side.

import { SUN_AZIMUTH, DAY_PHASE_DEFAULT } from "../../data/visuals";

export const visuals = {
  sunAzimuth: SUN_AZIMUTH, // shadow direction (dev knob; also the baked-shading reference)
  dayPhaseOffset: DAY_PHASE_DEFAULT, // time-of-day phase (dev knob); actual ToD adds the day drift
  overcast: 0, // weather: 0 clear .. 1 fully overcast (dev knob)
  shadowLenMul: 1, // contact-shadow length multiplier (set by the mood pass from the sun height)
  // ---- Perf A/B toggles (keyboard, see main.ts) — isolate a suspect to measure its real cost ----
  animateSheep: true, // false → freeze per-sheep squash/stretch/breath/wobble to static scale+heading
  moodGrade: true, // false → detach the full-screen ColorMatrixFilter (restores the direct draw path)
};

/** Unit vector pointing the way shadows fall (away from the sun). */
export function shadowDir(): { x: number; y: number } {
  // Sun comes FROM sunAzimuth; the shadow is cast in the opposite direction.
  return { x: -Math.cos(visuals.sunAzimuth), y: -Math.sin(visuals.sunAzimuth) };
}
