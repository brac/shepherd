import { describe, it, expect } from "vitest";
import { createGameState, type GameState, FLAG_PENNED } from "../src/state/gameState";
import { level1 } from "../data/levels/level1";
import { level2 } from "../data/levels/level2";
import { stepSim } from "../src/sim/step";
import { pointInPolygon } from "../src/sim/geometry";
import { DT, SIM_HZ, SHEEP_COLLIDE_DIST } from "../data/tuning";

function allFinite(state: GameState): boolean {
  const s = state.sheep;
  for (let i = 0; i < s.count; i++) {
    if (!Number.isFinite(s.posX[i]) || !Number.isFinite(s.posY[i])) return false;
    if (!Number.isFinite(s.velX[i]) || !Number.isFinite(s.velY[i])) return false;
    if (!Number.isFinite(s.panic[i])) return false;
  }
  return Number.isFinite(state.dog.x) && Number.isFinite(state.dog.y);
}

// Sheep must never escape the field boundary (inset polygon 40..1960 / 40..1160).
function insideField(state: GameState): boolean {
  const s = state.sheep;
  for (let i = 0; i < s.count; i++) {
    if (s.posX[i] < 20 || s.posX[i] > 1980 || s.posY[i] < 20 || s.posY[i] > 1180) {
      return false;
    }
  }
  return true;
}

describe("smoke / invariants", () => {
  it("stays finite and inside the field under a clumsy head-on drive", () => {
    const state = createGameState(level1);
    // Drive the dog straight back and forth through the flock.
    for (let t = 0; t < 3000; t++) {
      state.input.mouseWorldX = 400 + 500 * Math.sin(t * 0.01);
      state.input.mouseWorldY = 640;
      stepSim(state, DT);
      if (t % 500 === 0) {
        expect(allFinite(state)).toBe(true);
        expect(insideField(state)).toBe(true);
      }
    }
    expect(allFinite(state)).toBe(true);
    expect(insideField(state)).toBe(true);
  });

  it("panic is dramatic but recoverable (decays after the dog leaves)", () => {
    const state = createGameState(level1);
    // Charge head-on fast through the flock for ~1.5s.
    for (let t = 0; t < 360; t++) {
      state.input.mouseWorldX = 200 + t * 2.5;
      state.input.mouseWorldY = 640;
      stepSim(state, DT);
    }
    let peak = 0;
    let fleeing = 0;
    for (let i = 0; i < state.sheep.count; i++) {
      peak = Math.max(peak, state.sheep.panic[i]);
      if (state.sheep.flags[i] & 1) fleeing++; // FLAG_FLEEING
    }
    expect(peak).toBeGreaterThan(0.6); // crossed the flight threshold
    expect(fleeing).toBeGreaterThan(0); // sheep actually bolted

    // Remove the dog entirely (teleport far outside the field) and let them settle ~4s.
    for (let t = 0; t < 960; t++) {
      state.dog.x = -100000;
      state.dog.y = -100000;
      state.dog.velX = 0;
      state.dog.velY = 0;
      state.input.mouseWorldX = -100000;
      state.input.mouseWorldY = -100000;
      stepSim(state, DT);
    }
    let after = 0;
    for (let i = 0; i < state.sheep.count; i++) after = Math.max(after, state.sheep.panic[i]);
    expect(after).toBeLessThan(0.1); // recovered
  });

  it("pens sheep and fires the win when all are inside", () => {
    const state = createGameState(level1);
    // Teleport every sheep well inside the pen at a realistic (non-overlapping)
    // spacing, then step once for accounting. Kept clear of the fences and gate.
    for (let i = 0; i < state.sheep.count; i++) {
      const x = 1540 + (i % 22) * 13;
      const y = 480 + ((i / 22) | 0) * 13;
      state.sheep.posX[i] = x;
      state.sheep.posY[i] = y;
      state.sheep.prevX[i] = x;
      state.sheep.prevY[i] = y;
    }
    stepSim(state, DT);
    expect(state.pennedCount).toBe(state.sheep.count);
    expect(state.won).toBe(true);
    for (let i = 0; i < state.sheep.count; i++) {
      expect(state.sheep.flags[i] & FLAG_PENNED).toBeTruthy();
    }
  });

  it("a clump nudged through the gate pens and cannot leak back out", () => {
    const state = createGameState(level1);
    // A tight clump of ~40 sheep at the gate mouth (they have each other as neighbours,
    // so the topological rejoin doesn't pull them off). The rest are parked far away as
    // their own clump. Dog just behind, pressing the clump through the gate.
    for (let i = 0; i < state.sheep.count; i++) {
      let x: number;
      let y: number;
      if (i < 40) {
        x = 1475 + (i % 8) * 3;
        y = 620 + ((i / 8) | 0) * 6;
      } else {
        x = 200 + (i % 20) * 8;
        y = 980 + (((i - 40) / 20) | 0) * 8;
      }
      state.sheep.posX[i] = x;
      state.sheep.posY[i] = y;
      state.sheep.prevX[i] = x;
      state.sheep.prevY[i] = y;
    }
    for (let t = 0; t < 900; t++) {
      state.input.mouseWorldX = 1420;
      state.input.mouseWorldY = 640;
      stepSim(state, DT);
    }

    // Some of the clump made it in...
    let penned = 0;
    for (let i = 0; i < 40; i++) if (state.sheep.flags[i] & FLAG_PENNED) penned++;
    expect(penned).toBeGreaterThan(0);
    // ...and every penned sheep is still inside the pen (no leakage).
    for (let i = 0; i < 40; i++) {
      if (state.sheep.flags[i] & FLAG_PENNED) {
        expect(state.sheep.posX[i]).toBeGreaterThan(1500);
      }
    }
  });

  it("a stray sheep rejoins the flock instead of stranding (topological rejoin)", () => {
    const state = createGameState(level1);
    // Tight flock clump; sheep 0 stranded far away, well beyond awareness radius.
    for (let i = 1; i < state.sheep.count; i++) {
      const x = 700 + ((i % 15) - 7) * 6;
      const y = 600 + (((i / 15) | 0) % 15 - 7) * 6;
      state.sheep.posX[i] = x;
      state.sheep.posY[i] = y;
      state.sheep.prevX[i] = x;
      state.sheep.prevY[i] = y;
    }
    state.sheep.posX[0] = 700;
    state.sheep.posY[0] = 150; // ~450px north of the flock, alone
    state.sheep.prevX[0] = 700;
    state.sheep.prevY[0] = 150;

    const flockCentroid = (): { x: number; y: number } => {
      let sx = 0;
      let sy = 0;
      for (let i = 1; i < state.sheep.count; i++) {
        sx += state.sheep.posX[i];
        sy += state.sheep.posY[i];
      }
      const n = state.sheep.count - 1;
      return { x: sx / n, y: sy / n };
    };
    const c0 = flockCentroid();
    const dist0 = Math.hypot(state.sheep.posX[0] - c0.x, state.sheep.posY[0] - c0.y);

    for (let t = 0; t < 700; t++) {
      state.dog.x = -100000; // no dog influence
      state.dog.y = -100000;
      state.input.mouseWorldX = -100000;
      state.input.mouseWorldY = -100000;
      stepSim(state, DT);
    }

    const c1 = flockCentroid();
    const dist1 = Math.hypot(state.sheep.posX[0] - c1.x, state.sheep.posY[0] - c1.y);
    // The stray closed most of the gap back to the flock rather than drifting off.
    expect(dist1).toBeLessThan(dist0 - 150);
  });

  it("sheep bodies do not deeply overlap once settled", () => {
    const state = createGameState(level1);
    // Let the densely-spawned flock relax with the dog well away.
    for (let t = 0; t < 600; t++) {
      state.dog.x = -100000;
      state.dog.y = -100000;
      state.input.mouseWorldX = -100000;
      state.input.mouseWorldY = -100000;
      stepSim(state, DT);
    }
    // Count pairs that are still deeply interpenetrating (< 60% of the body distance).
    const s = state.sheep;
    const deep = 0.6 * SHEEP_COLLIDE_DIST;
    const deep2 = deep * deep;
    let deepPairs = 0;
    for (let i = 0; i < s.count; i++) {
      for (let j = i + 1; j < s.count; j++) {
        const dx = s.posX[j] - s.posX[i];
        const dy = s.posY[j] - s.posY[i];
        if (dx * dx + dy * dy < deep2) deepPairs++;
      }
    }
    // A tiny number of transient contacts is fine; a pile-up is not.
    expect(deepPairs).toBeLessThan(10);
  });

  it("penned sheep stay inside even when a flock pulls from outside the fence", () => {
    const state = createGameState(level2);
    const pen = state.level.penPoly;

    // Sheep 0: penned, sitting just inside the right pen fence (x = 1850).
    state.sheep.posX[0] = 1842;
    state.sheep.posY[0] = 640;
    state.sheep.prevX[0] = 1842;
    state.sheep.prevY[0] = 640;
    state.sheep.flags[0] |= FLAG_PENNED;
    state.pennedCount = 1;

    // A dense flock of unpenned sheep just OUTSIDE the right fence, within the penned
    // sheep's awareness radius, so cohesion tugs it through the fence toward them.
    for (let i = 1; i < 180; i++) {
      const x = 1858 + (i % 12) * 6;
      const y = 600 + ((i / 12) | 0) * 6;
      state.sheep.posX[i] = x;
      state.sheep.posY[i] = y;
      state.sheep.prevX[i] = x;
      state.sheep.prevY[i] = y;
    }

    for (let t = 0; t < 600; t++) {
      state.input.mouseWorldX = -100000; // dog out of the way
      state.input.mouseWorldY = -100000;
      state.dog.x = -100000;
      state.dog.y = -100000;
      stepSim(state, DT);
    }

    // It must not have leaked out of the pen.
    expect(state.sheep.posX[0]).toBeLessThan(1850);
    expect(pointInPolygon(state.sheep.posX[0], state.sheep.posY[0], pen)).toBe(true);
  });

  it("obstacle blocks sheep — none penetrate the boulder when pushed into it", () => {
    const state = createGameState(level2);
    const boulder = state.level.obstacles[0];
    expect(boulder).toBeDefined();

    // Line up the first 60 sheep just off the boulder's left face, driving right
    // straight into it; park the dog behind them to keep the pressure on.
    for (let i = 0; i < 60; i++) {
      const x = 870;
      const y = 470 + (i % 60) * 4.5;
      state.sheep.posX[i] = x;
      state.sheep.posY[i] = y;
      state.sheep.prevX[i] = x;
      state.sheep.prevY[i] = y;
      state.sheep.velX[i] = 140;
      state.sheep.velY[i] = 0;
    }
    for (let t = 0; t < 500; t++) {
      state.input.mouseWorldX = 700;
      state.input.mouseWorldY = 600;
      stepSim(state, DT);
    }

    // No sheep may end up inside the obstacle polygon.
    let inside = 0;
    for (let i = 0; i < state.sheep.count; i++) {
      if (pointInPolygon(state.sheep.posX[i], state.sheep.posY[i], boulder)) inside++;
    }
    expect(inside).toBe(0);
  });

  it("holds a workable frame budget (500 hard, 1000 stretch)", () => {
    function measure(count: number): number {
      const def = { ...level1, sheepCount: count };
      const state = createGameState(def);
      // Warm up (let V8 JIT settle) then measure.
      for (let t = 0; t < 300; t++) {
        state.input.mouseWorldX = 800 + 300 * Math.sin(t * 0.02);
        state.input.mouseWorldY = 640;
        stepSim(state, DT);
      }
      const N = 1000;
      const start = performance.now();
      for (let t = 0; t < N; t++) {
        state.input.mouseWorldX = 800 + 300 * Math.sin(t * 0.02);
        state.input.mouseWorldY = 640;
        stepSim(state, DT);
      }
      const msPerStep = (performance.now() - start) / N;
      // eslint-disable-next-line no-console
      console.log(
        `sheep=${count}  ${msPerStep.toFixed(3)} ms/step  -> ${(msPerStep * SIM_HZ).toFixed(0)} ms sim / real second`,
      );
      return msPerStep * SIM_HZ;
    }

    // DoD: 500 sheep hold a stable frame budget (hard requirement) — sim must fit in
    // real time on a single thread at the sim rate with headroom for rendering.
    expect(measure(500)).toBeLessThan(1000);
    // 1000 is an explicit STRETCH check: logged for observation, not a pass/fail gate
    // (per Node-run variance it can exceed the single-thread 240 Hz budget). Only a
    // very loose regression ceiling so a pathological blow-up still trips the test.
    const stretch = measure(1000);
    expect(Number.isFinite(stretch)).toBe(true);
    expect(stretch).toBeLessThan(6000);
  });
});
