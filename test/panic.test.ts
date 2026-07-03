import { describe, it, expect } from "vitest";
import { createGameState } from "../src/state/gameState";
import { level1 } from "../data/levels/level1";
import { rebuildGrid } from "../src/sim/spatialHash";
import { updatePanic } from "../src/sim/panic";
import { DT } from "../data/tuning";
import { FLAG_FLEEING } from "../src/state/gameState";

// Move the dog far away so injection is negligible and we isolate decay/propagation.
function parkDogFarAway(state: ReturnType<typeof createGameState>): void {
  state.dog.x = -100000;
  state.dog.y = -100000;
  state.dog.velX = 0;
  state.dog.velY = 0;
}

describe("panic", () => {
  it("decays toward zero when the dog is absent", () => {
    const state = createGameState(level1);
    parkDogFarAway(state);
    const i = 0;
    state.sheep.panic[i] = 0.5;
    state.sheep.panicPrev[i] = 0.5;
    rebuildGrid(state);
    updatePanic(state, DT);
    expect(state.sheep.panic[i]).toBeLessThan(0.5);
    expect(state.sheep.panic[i]).toBeGreaterThan(0);
  });

  it("propagates from a panicking sheep to its close neighbors", () => {
    const state = createGameState(level1);
    parkDogFarAway(state);
    const s = state.sheep;

    // Find a sheep with at least one near neighbor.
    let a = -1;
    let b = -1;
    outer: for (let i = 0; i < s.count; i++) {
      for (let j = 0; j < s.count; j++) {
        if (i === j) continue;
        const dx = s.posX[j] - s.posX[i];
        const dy = s.posY[j] - s.posY[i];
        if (dx * dx + dy * dy < 40 * 40) {
          a = i;
          b = j;
          break outer;
        }
      }
    }
    expect(a).toBeGreaterThanOrEqual(0);

    // a is terrified; snapshot must carry it for propagation to read. panicAge marks it
    // as an ESTABLISHED source (panicked long enough for the wave front to have reached b);
    // a freshly-startled sheep radiates outward at WAVE_SPEED instead of jumping instantly.
    s.panic[a] = 1;
    s.panicPrev[a] = 1;
    s.panicAge[a] = 1;
    const before = s.panic[b];
    rebuildGrid(state);
    updatePanic(state, DT);
    expect(s.panic[b]).toBeGreaterThan(before);
  });

  it("sets the FLEEING flag once panic crosses the threshold", () => {
    const state = createGameState(level1);
    parkDogFarAway(state);
    const i = 0;
    state.sheep.panic[i] = 0.95;
    state.sheep.panicPrev[i] = 0.95;
    rebuildGrid(state);
    updatePanic(state, DT);
    expect(state.sheep.flags[i] & FLAG_FLEEING).toBeTruthy();
  });
});
