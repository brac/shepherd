// Fence/obstacle collision is push-out along the surface normal, never bounce.
// A body penetrating a wall is projected back to the surface; residual velocity
// slides along the wall tangent (this is what lets sheep shoved at a fence slide
// toward the gate). Shared by sheep and dog.
//
// Zero allocation: results are written to the module-level `collideOut` scratch.
// Single-threaded sim, so a shared scratch is safe and deterministic.

import { closestPointOnSegment, type Wall } from "./geometry";

export const collideOut = { x: 0, y: 0, vx: 0, vy: 0, hit: false };

/**
 * Resolve (px,py,vx,vy,radius) against a packed wall array [ax,ay,bx,by,nx,ny]*.
 * Writes the corrected position/velocity into `collideOut`.
 */
export function collideWalls(
  walls: Float32Array,
  wallCount: number,
  px: number,
  py: number,
  vx: number,
  vy: number,
  radius: number,
): void {
  const r2 = radius * radius;
  let hit = false;
  for (let w = 0; w < wallCount; w++) {
    const o = w * 6;
    const ax = walls[o];
    const ay = walls[o + 1];
    const bx = walls[o + 2];
    const by = walls[o + 3];
    const nx = walls[o + 4];
    const ny = walls[o + 5];
    const cp = closestPointOnSegment(px, py, ax, ay, bx, by);
    const ddx = px - cp.x;
    const ddy = py - cp.y;
    const d2 = ddx * ddx + ddy * ddy;
    if (d2 >= r2) continue;
    const d = Math.sqrt(d2);
    // Unit push direction from the surface to the body; fall back to the face
    // normal when the body sits exactly on the surface.
    let ux: number;
    let uy: number;
    if (d > 1e-6) {
      ux = ddx / d;
      uy = ddy / d;
    } else {
      ux = nx;
      uy = ny;
    }
    // If the body crossed to the non-walkable side, flip toward the walkable side.
    if (ux * nx + uy * ny < 0) {
      ux = -ux;
      uy = -uy;
    }
    const push = radius - d;
    px += ux * push;
    py += uy * push;
    // Slide: remove the velocity component pointing into the wall.
    const vn = vx * ux + vy * uy;
    if (vn < 0) {
      vx -= vn * ux;
      vy -= vn * uy;
    }
    hit = true;
  }
  collideOut.x = px;
  collideOut.y = py;
  collideOut.vx = vx;
  collideOut.vy = vy;
  collideOut.hit = hit;
}

/** Resolve a single body against one wall (used for the one-way gate). */
export function collideOneWall(
  wall: Wall,
  px: number,
  py: number,
  vx: number,
  vy: number,
  radius: number,
): void {
  const cp = closestPointOnSegment(px, py, wall.ax, wall.ay, wall.bx, wall.by);
  const ddx = px - cp.x;
  const ddy = py - cp.y;
  const d2 = ddx * ddx + ddy * ddy;
  if (d2 >= radius * radius) {
    collideOut.x = px;
    collideOut.y = py;
    collideOut.vx = vx;
    collideOut.vy = vy;
    collideOut.hit = false;
    return;
  }
  const d = Math.sqrt(d2);
  let ux: number;
  let uy: number;
  if (d > 1e-6) {
    ux = ddx / d;
    uy = ddy / d;
  } else {
    ux = wall.nx;
    uy = wall.ny;
  }
  if (ux * wall.nx + uy * wall.ny < 0) {
    ux = -ux;
    uy = -uy;
  }
  const push = radius - d;
  px += ux * push;
  py += uy * push;
  const vn = vx * ux + vy * uy;
  if (vn < 0) {
    vx -= vn * ux;
    vy -= vn * uy;
  }
  collideOut.x = px;
  collideOut.y = py;
  collideOut.vx = vx;
  collideOut.vy = vy;
  collideOut.hit = true;
}
