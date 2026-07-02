// Hard positional de-overlap so sheep bodies bump instead of stacking. The boid
// separation term is a soft steer and can't prevent interpenetration at high
// density; this pass pushes any two sheep closer than SHEEP_COLLIDE_DIST apart.
//
// Jacobi relaxation: each pass reads current positions, accumulates half-push per
// overlapping pair into scratch arrays, then applies them at once (order-independent
// and deterministic). Neighbors come from the same 3x3 grid block; pushes are tiny
// (< body diameter) so the snapshot-built grid still covers every real neighbor.
// Zero allocation. After the final pass, positions are re-clamped against fences so
// a push can't shove a sheep through a wall.

import { FLAG_PENNED, type GameState } from "../state/gameState";
import { colOf, rowOf } from "./spatialHash";
import { collideWalls, collideOut } from "./collision";
import { OVERLAP_PASSES, SHEEP_RADIUS } from "../../data/tuning";

export function resolveOverlap(state: GameState): void {
  const s = state.sheep;
  const grid = state.grid;
  const cols = grid.cols;
  const rows = grid.rows;
  const heads = grid.heads;
  const next = grid.next;
  const corrX = s.corrX;
  const corrY = s.corrY;
  const bodyR = s.bodyR;

  for (let pass = 0; pass < OVERLAP_PASSES; pass++) {
    corrX.fill(0);
    corrY.fill(0);

    for (let i = 0; i < s.count; i++) {
      const px = s.posX[i];
      const py = s.posY[i];
      const c = colOf(grid, px);
      const r = rowOf(grid, py);
      const c0 = c > 0 ? c - 1 : 0;
      const c1 = c < cols - 1 ? c + 1 : cols - 1;
      const r0 = r > 0 ? r - 1 : 0;
      const r1 = r < rows - 1 ? r + 1 : rows - 1;

      for (let rr = r0; rr <= r1; rr++) {
        const rowBase = rr * cols;
        for (let cc = c0; cc <= c1; cc++) {
          let j = heads[rowBase + cc];
          while (j !== -1) {
            // Each unordered pair resolved once (j > i), correcting both.
            if (j > i) {
              const dx = s.posX[j] - px;
              const dy = s.posY[j] - py;
              const d2 = dx * dx + dy * dy;
              const minDist = bodyR[i] + bodyR[j]; // per-sheep sizes -> no perfect lattice
              if (d2 < minDist * minDist) {
                let ux: number;
                let uy: number;
                let overlap: number;
                if (d2 > 1e-6) {
                  const d = Math.sqrt(d2);
                  ux = dx / d;
                  uy = dy / d;
                  overlap = minDist - d;
                } else {
                  // Exactly coincident: split deterministically along +x by index.
                  ux = 1;
                  uy = 0;
                  overlap = minDist;
                }
                const half = overlap * 0.5;
                corrX[i] -= ux * half;
                corrY[i] -= uy * half;
                corrX[j] += ux * half;
                corrY[j] += uy * half;
              }
            }
            j = next[j];
          }
        }
      }
    }

    // Apply the accumulated corrections.
    for (let i = 0; i < s.count; i++) {
      s.posX[i] += corrX[i];
      s.posY[i] += corrY[i];
    }
  }

  // Re-clamp against fences so a de-overlap push can't leave a sheep inside a wall.
  // Penned sheep use the fully-enclosed pen boundary (can't be pushed out); everyone
  // else uses the open-gate wall set.
  const level = state.level;
  for (let i = 0; i < s.count; i++) {
    const penned = (s.flags[i] & FLAG_PENNED) !== 0;
    const walls = penned ? level.pennedWalls : level.walls;
    const wallCount = penned ? level.pennedWallCount : level.wallCount;
    collideWalls(walls, wallCount, s.posX[i], s.posY[i], 0, 0, SHEEP_RADIUS);
    s.posX[i] = collideOut.x;
    s.posY[i] = collideOut.y;
  }
}
