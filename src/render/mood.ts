// World mood (Phase 2B M5): a slow time-of-day cycle + weather (overcast) that grade the
// whole scene's light and set the contact-shadow length — so the same field feels different
// each visit. A ColorMatrixFilter on the world container warms/dims/desaturates; the mood
// also writes visuals.shadowLenMul (read by ShadowView). Render-only; the sim reads nothing.

import { ColorMatrixFilter } from "pixi.js";
import type { GameState } from "../state/gameState";
import { visuals } from "./visualsRuntime";
import {
  DAY_LENGTH,
  OVERCAST_DESAT,
  OVERCAST_DIM,
  SHADOW_LOWSUN_LEN,
  TOD_DIM,
  TOD_WARM,
  WARM_TINT,
} from "../../data/visuals";

/** The scene color grade. Applied to the world container by the renderer; matrix set here. */
export const moodFilter = new ColorMatrixFilter();

export function updateMood(state: GameState): void {
  // Time of day: knob phase + a slow drift, wrapped to 0..1 (0 dawn, 0.5 noon, 1 dusk).
  let tod = visuals.dayPhaseOffset + state.simTime / DAY_LENGTH;
  tod -= Math.floor(tod);
  const elev = Math.sin(tod * Math.PI); // 0 at dawn/dusk, 1 at noon
  const lowSun = 1 - elev;
  const oc = visuals.overcast;

  // Low sun → long shadows (ShadowView reads this).
  visuals.shadowLenMul = 1 + lowSun * SHADOW_LOWSUN_LEN;

  // Color grade: dimmer at dawn/dusk + overcast; warm low-sun light (overcast greys it out);
  // overcast desaturates.
  const bright = 1 - lowSun * TOD_DIM - oc * OVERCAST_DIM;
  const warm = lowSun * TOD_WARM * (1 - oc);
  const warmCol = mixHex(0xffffff, WARM_TINT, warm);

  moodFilter.reset();
  moodFilter.brightness(bright, true);
  if (oc > 0) moodFilter.saturate(-oc * OVERCAST_DESAT, true);
  if (warm > 0.001) moodFilter.tint(warmCol, true);
}

function mixHex(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = (ar + (br - ar) * t) & 0xff;
  const g = (ag + (bg - ag) * t) & 0xff;
  const bl = (ab + (bb - ab) * t) & 0xff;
  return (r << 16) | (g << 8) | bl;
}
