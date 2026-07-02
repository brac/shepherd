// Uniform-grid spatial hash. Bookkeeping ONLY: it answers "which sheep are near
// (x,y)?" cheaply. It never constrains movement, never snaps a position, is never
// rendered. Rebuilt once per sim step (before flocking) from the snapshot positions.
//
// Implemented as linked-lists-in-arrays: heads[cell] is the first sheep index in a
// cell, next[i] chains to the next sheep in the same cell. Zero per-frame allocation.

import type { GameState, Grid } from "../state/gameState";

/** Clamp a world coordinate to a grid column/row. */
export function colOf(grid: Grid, x: number): number {
  let c = ((x - grid.minX) / grid.cellSize) | 0;
  if (c < 0) c = 0;
  else if (c >= grid.cols) c = grid.cols - 1;
  return c;
}

export function rowOf(grid: Grid, y: number): number {
  let r = ((y - grid.minY) / grid.cellSize) | 0;
  if (r < 0) r = 0;
  else if (r >= grid.rows) r = grid.rows - 1;
  return r;
}

/**
 * Clear the grid and insert every sheep by its snapshot (prev) position.
 * Insertion order is by index so iteration order stays deterministic.
 */
export function rebuildGrid(state: GameState): void {
  const grid = state.grid;
  const s = state.sheep;
  grid.heads.fill(-1);
  const heads = grid.heads;
  const next = grid.next;
  const cols = grid.cols;
  for (let i = 0; i < s.count; i++) {
    const c = colOf(grid, s.prevX[i]);
    const r = rowOf(grid, s.prevY[i]);
    const cell = r * cols + c;
    next[i] = heads[cell];
    heads[cell] = i;
  }
}
