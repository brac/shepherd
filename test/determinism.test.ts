import { describe, it, expect } from "vitest";
import { createGameState, type GameState } from "../src/state/gameState";
import { level1 } from "../data/levels/level1";
import { stepSim } from "../src/sim/step";
import { DT } from "../data/tuning";

// A scripted dog-intent sequence (no real pointer input) that exercises every dog
// state (trot / stalk / prone) and barking, so determinism is tested across the
// whole sim, not just the quiet path.
function drive(state: GameState, steps: number): void {
  for (let t = 0; t < steps; t++) {
    const inp = state.input;
    inp.mouseWorldX = 1000 + 600 * Math.sin(t * 0.003);
    inp.mouseWorldY = 600 + 300 * Math.sin(t * 0.0047);
    inp.leftDown = t % 1200 < 400;
    // Hold with no drag for the first stretch (prone/stop), then drag (stalk).
    inp.dragging = inp.leftDown && t % 1200 > 150;
    if (t % 900 === 0) inp.barkQueued = true;
    stepSim(state, DT);
  }
}

// FNV-1a over the raw bytes of every SoA buffer + scalar sim state.
function hashState(state: GameState): string {
  let h = 0x811c9dc5 >>> 0;
  const mix = (buf: ArrayBufferLike): void => {
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  };
  const s = state.sheep;
  mix(s.posX.buffer);
  mix(s.posY.buffer);
  mix(s.velX.buffer);
  mix(s.velY.buffer);
  mix(s.heading.buffer);
  mix(s.panic.buffer);
  mix(s.flags.buffer);
  // Phase 2A state (activity, timers, per-sheep traits).
  mix(s.activity.buffer);
  mix(s.panicAge.buffer);
  mix(s.restTimer.buffer);
  mix(s.strayTimer.buffer);
  mix(s.skittish.buffer);
  mix(s.speedMul.buffer);
  mix(s.restBias.buffer);
  mix(s.wanderMul.buffer);
  mix(s.idlePhase.buffer);
  // Fold in scalar state.
  const scalars = new Float64Array([
    state.dog.x,
    state.dog.y,
    state.dog.velX,
    state.dog.velY,
    state.dog.facing,
    state.pennedCount,
    state.tick,
    state.camera.x,
    state.camera.y,
  ]);
  mix(scalars.buffer);
  return h.toString(16);
}

describe("determinism", () => {
  it("same seed + same input sequence => identical state", () => {
    const a = createGameState(level1);
    const b = createGameState(level1);
    drive(a, 5000);
    drive(b, 5000);
    expect(hashState(a)).toBe(hashState(b));
  });

  it("different seed => different state", () => {
    const a = createGameState(level1, 1);
    const b = createGameState(level1, 2);
    drive(a, 2000);
    drive(b, 2000);
    expect(hashState(a)).not.toBe(hashState(b));
  });

  it("advances the sim clock deterministically", () => {
    const a = createGameState(level1);
    drive(a, 1234);
    expect(a.tick).toBe(1234);
    expect(a.simTime).toBeCloseTo(1234 * DT, 6);
  });
});
