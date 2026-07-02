import { describe, it, expect } from "vitest";
import { createGameState } from "../src/state/gameState";
import { level1 } from "../data/levels/level1";
import { rebuildGrid, colOf, rowOf } from "../src/sim/spatialHash";
import { AWARENESS_RADIUS } from "../data/tuning";

describe("spatial hash", () => {
  it("3x3 query returns exactly the brute-force neighbors within awareness", () => {
    const state = createGameState(level1);
    rebuildGrid(state);
    const s = state.sheep;
    const grid = state.grid;
    const aware2 = AWARENESS_RADIUS * AWARENESS_RADIUS;

    // Sample every 37th sheep.
    for (let i = 0; i < s.count; i += 37) {
      const px = s.prevX[i];
      const py = s.prevY[i];

      // Brute force.
      let brute = 0;
      for (let j = 0; j < s.count; j++) {
        if (j === i) continue;
        const dx = s.prevX[j] - px;
        const dy = s.prevY[j] - py;
        if (dx * dx + dy * dy < aware2) brute++;
      }

      // 3x3 grid query.
      let viaGrid = 0;
      const c = colOf(grid, px);
      const r = rowOf(grid, py);
      const c0 = Math.max(0, c - 1);
      const c1 = Math.min(grid.cols - 1, c + 1);
      const r0 = Math.max(0, r - 1);
      const r1 = Math.min(grid.rows - 1, r + 1);
      for (let rr = r0; rr <= r1; rr++) {
        for (let cc = c0; cc <= c1; cc++) {
          let j = grid.heads[rr * grid.cols + cc];
          while (j !== -1) {
            if (j !== i) {
              const dx = s.prevX[j] - px;
              const dy = s.prevY[j] - py;
              if (dx * dx + dy * dy < aware2) viaGrid++;
            }
            j = grid.next[j];
          }
        }
      }

      expect(viaGrid).toBe(brute);
    }
  });
});
