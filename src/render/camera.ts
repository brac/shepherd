// Camera transform: axis-locked top-down, translate-only (never rotates). The world
// point (camX, camY) maps to the center of the viewport, scaled by zoom.
// Pure functions — the sim owns camera position; views/input just transform through it.

import { CAMERA_ZOOM } from "../../data/tuning";

export const ZOOM = CAMERA_ZOOM;

export function worldToScreenX(wx: number, camX: number, width: number, zoom: number): number {
  return (wx - camX) * zoom + width / 2;
}

export function worldToScreenY(wy: number, camY: number, height: number, zoom: number): number {
  return (wy - camY) * zoom + height / 2;
}

export function screenToWorldX(sx: number, camX: number, width: number, zoom: number): number {
  return (sx - width / 2) / zoom + camX;
}

export function screenToWorldY(sy: number, camY: number, height: number, zoom: number): number {
  return (sy - height / 2) / zoom + camY;
}

/** Interpolated camera position for smooth rendering. */
export function lerp(prev: number, cur: number, alpha: number): number {
  return prev + (cur - prev) * alpha;
}
