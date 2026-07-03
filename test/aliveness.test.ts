import { describe, it, expect } from "vitest";
import { createGameState, type GameState } from "../src/state/gameState";
import { ACT_ALERT, ACT_GRAZE, ACT_REST } from "../src/state/gameState";
import { level1 } from "../data/levels/level1";
import { rebuildGrid } from "../src/sim/spatialHash";
import { updatePanic } from "../src/sim/panic";
import { stepSim } from "../src/sim/step";
import {
  DT,
  BIRD_STARTLE_TTL,
  GRAZE_CLUSTER_RADIUS,
  PANIC_PROPAGATE_MIN,
  REST_RISE_DELAY,
  STRAY_AROUSAL,
  WAVE_SPEED,
} from "../data/tuning";

function parkDog(state: GameState): void {
  state.dog.x = -100000;
  state.dog.y = -100000;
  state.dog.velX = 0;
  state.dog.velY = 0;
  state.input.mouseWorldX = -100000;
  state.input.mouseWorldY = -100000;
}

// Random birds/gusts would add uncontrolled panic; push their timers far out so a test
// observes only the pulse it injects itself.
function silenceAmbient(state: GameState): void {
  state.ambient.birdCountdown = 1e9;
  state.ambient.gustCountdown = 1e9;
}

describe("Phase 2A M1 — startle wave", () => {
  it("panic radiates at a finite speed (a fresh source does not teleport to neighbours)", () => {
    const state = createGameState(level1);
    parkDog(state);
    const s = state.sheep;

    // Two isolated sheep 60px apart, out in empty field so no other sheep interfere.
    const D = 60; // < AWARENESS_RADIUS, so distance alone would allow propagation
    s.posX[0] = 1000;
    s.posY[0] = 200;
    s.prevX[0] = 1000;
    s.prevY[0] = 200;
    s.posX[1] = 1000 + D;
    s.posY[1] = 200;
    s.prevX[1] = 1000 + D;
    s.prevY[1] = 200;

    // Sheep 0 is terrified but only *just* startled (panicAge 0): the front hasn't
    // travelled the 60px gap yet, so neighbour 1 must stay calm this step.
    s.panic[0] = 1;
    s.panicPrev[0] = 1;
    s.panicAge[0] = 0;
    rebuildGrid(state);
    updatePanic(state, DT);
    expect(s.panic[1]).toBeLessThan(1e-4); // wave front has not arrived

    // Now mark sheep 0 as an established source (panicked long enough for the front to
    // cover the gap: panicAge * WAVE_SPEED >> D). The same single step now propagates.
    s.panicAge[0] = (D / WAVE_SPEED) * 2;
    rebuildGrid(state);
    updatePanic(state, DT);
    expect(s.panic[1]).toBeGreaterThan(0);
  });

  it("an injected startle expands, then fades, and never engulfs the whole flock", () => {
    const state = createGameState(level1);
    silenceAmbient(state);

    // Let the densely-spawned flock relax with the dog gone.
    for (let t = 0; t < 240; t++) {
      parkDog(state);
      silenceAmbient(state);
      stepSim(state, DT);
    }
    const s = state.sheep;

    // Injection point = flock centroid.
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < s.count; i++) {
      cx += s.posX[i];
      cy += s.posY[i];
    }
    cx /= s.count;
    cy /= s.count;

    // Drop one strong, brief startle emitter at the centroid (bypassing the RNG bird path).
    state.ambient.startleX[0] = cx;
    state.ambient.startleY[0] = cy;
    state.ambient.startleMag[0] = 12; // rate; strong enough to seed a clear, measurable wave
    state.ambient.startleTtl[0] = BIRD_STARTLE_TTL;

    const panicked = (): number => {
      let n = 0;
      for (let i = 0; i < s.count; i++) if (s.panic[i] > PANIC_PROPAGATE_MIN) n++;
      return n;
    };

    let early = 0; // count just after injection (front still near the centre)
    let peak = 0;
    let last = 0;
    for (let t = 0; t < 720; t++) {
      parkDog(state);
      silenceAmbient(state);
      stepSim(state, DT);
      const n = panicked();
      if (t === 8) early = n;
      if (n > peak) peak = n;
      last = n;
    }

    expect(peak).toBeGreaterThan(early); // the disturbance spread outward...
    expect(last).toBeLessThan(peak); // ...then decayed away
    // And it dies out partway: a good chunk of the flock never panics at all.
    expect(peak).toBeLessThan(s.count * 0.9);
  });
});

describe("Phase 2A M2 — anti-uniformity traits", () => {
  it("seeds a spread of per-sheep traits, with skittishness centred near 1", () => {
    const state = createGameState(level1);
    const s = state.sheep;

    const stats = (arr: Float32Array) => {
      let min = Infinity;
      let max = -Infinity;
      let sum = 0;
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] < min) min = arr[i];
        if (arr[i] > max) max = arr[i];
        sum += arr[i];
      }
      return { min, max, mean: sum / arr.length };
    };

    const sk = stats(s.skittish);
    const sp = stats(s.speedMul);
    const wm = stats(s.wanderMul);

    // Every trait shows real spread across the flock (individuals, not clones).
    expect(sk.max - sk.min).toBeGreaterThan(0.3);
    expect(sp.max - sp.min).toBeGreaterThan(0.1);
    expect(wm.max - wm.min).toBeGreaterThan(0.3);
    // Skittishness averages ≈1 so wiring it into injection doesn't dampen the whole flock.
    expect(sk.mean).toBeGreaterThan(0.85);
    expect(sk.mean).toBeLessThan(1.15);
  });

  it("two equidistant sheep take different panic from the same pulse (skittishness)", () => {
    const state = createGameState(level1);
    parkDog(state);
    const s = state.sheep;

    // Two sheep the same distance (60px) either side of a startle centre, far enough apart
    // (120px > awareness) that they don't cross-propagate — so only the trait differs.
    const cx = 1000;
    const cy = 600;
    s.posX[0] = cx - 60;
    s.posY[0] = cy;
    s.prevX[0] = cx - 60;
    s.prevY[0] = cy;
    s.posX[1] = cx + 60;
    s.posY[1] = cy;
    s.prevX[1] = cx + 60;
    s.prevY[1] = cy;
    s.skittish[0] = 0.8; // placid
    s.skittish[1] = 1.5; // jumpy

    // One active startle emitter centred between them (radius covers both equally).
    state.ambient.startleX[0] = cx;
    state.ambient.startleY[0] = cy;
    state.ambient.startleMag[0] = 6;
    state.ambient.startleTtl[0] = BIRD_STARTLE_TTL;

    rebuildGrid(state);
    updatePanic(state, DT);

    expect(s.panic[0]).toBeGreaterThan(0);
    expect(s.panic[1]).toBeGreaterThan(0);
    // The jumpy sheep took more — in proportion to its skittishness (equal decay from 0).
    expect(s.panic[1]).toBeGreaterThan(s.panic[0] * 1.5);
  });
});

describe("Phase 2A M3 — grazing clusters", () => {
  it("an idle flock forms uneven sub-groups that reshuffle over time", () => {
    const state = createGameState({ ...level1, sheepCount: 300 });
    const s = state.sheep;

    const R2 = GRAZE_CLUSTER_RADIUS * GRAZE_CLUSTER_RADIUS;
    // Per-sheep local density = close companions within the cluster radius (brute force).
    const density = (): Float64Array => {
      const d = new Float64Array(s.count);
      for (let i = 0; i < s.count; i++) {
        let n = 0;
        for (let j = 0; j < s.count; j++) {
          if (i === j) continue;
          const dx = s.posX[j] - s.posX[i];
          const dy = s.posY[j] - s.posY[i];
          if (dx * dx + dy * dy < R2) n++;
        }
        d[i] = n;
      }
      return d;
    };
    const cov = (d: Float64Array): number => {
      let sum = 0;
      for (const v of d) sum += v;
      const mean = sum / d.length;
      let ss = 0;
      for (const v of d) ss += (v - mean) * (v - mean);
      return Math.sqrt(ss / d.length) / mean; // coefficient of variation
    };
    const corr = (a: Float64Array, b: Float64Array): number => {
      const n = a.length;
      let sa = 0;
      let sb = 0;
      for (let i = 0; i < n; i++) {
        sa += a[i];
        sb += b[i];
      }
      const ma = sa / n;
      const mb = sb / n;
      let num = 0;
      let da = 0;
      let db = 0;
      for (let i = 0; i < n; i++) {
        const x = a[i] - ma;
        const y = b[i] - mb;
        num += x * y;
        da += x * x;
        db += y * y;
      }
      return num / Math.sqrt(da * db);
    };

    const idle = (steps: number): void => {
      for (let t = 0; t < steps; t++) {
        state.dog.x = -100000;
        state.dog.y = -100000;
        state.input.mouseWorldX = -100000;
        state.input.mouseWorldY = -100000;
        stepSim(state, DT);
      }
    };

    idle(6000); // ~25 s: let clusters emerge from the uniform spawn blob
    const dA = density();
    idle(3600); // ~15 s more
    const dB = density();

    // The flock hasn't dispersed into singletons (still grouped)...
    let sum = 0;
    for (const v of dA) sum += v;
    expect(sum / dA.length).toBeGreaterThan(3);
    // ...density is genuinely lumpy (sub-groups), well above a uniform/random spread...
    expect(cov(dA)).toBeGreaterThan(0.33);
    // ...and the clumps reshuffle rather than freezing into fixed groups.
    expect(corr(dA, dB)).toBeLessThan(0.85);
  });
});

describe("Phase 2A M4 — rest state + lone-sheep return", () => {
  it("an idle flock lies down over time, mixed with grazers, and the resting set churns", () => {
    const state = createGameState(level1);
    const s = state.sheep;

    const restingSet = (): Set<number> => {
      const set = new Set<number>();
      for (let i = 0; i < s.count; i++) if (s.activity[i] === ACT_REST) set.add(i);
      return set;
    };
    const idle = (steps: number): void => {
      for (let t = 0; t < steps; t++) {
        parkDog(state);
        silenceAmbient(state);
        stepSim(state, DT);
      }
    };

    idle(9600); // ~40 s: staggered onsets (10–90 s) mean a good fraction has lain down
    const a = restingSet();
    expect(a.size).toBeGreaterThan(0); // some sheep are resting

    idle(3600); // ~15 s more
    const b = restingSet();

    // The flock never rests in lockstep — grazers coexist with sleepers (anti-sync).
    let grazing = 0;
    for (let i = 0; i < s.count; i++) if (s.activity[i] === ACT_GRAZE) grazing++;
    expect(grazing).toBeGreaterThan(0);

    // The resting population turns over (some rose, some newly lay down) — not frozen.
    let changed = 0;
    a.forEach((i) => {
      if (!b.has(i)) changed++;
    });
    b.forEach((i) => {
      if (!a.has(i)) changed++;
    });
    expect(changed).toBeGreaterThan(0);
  });

  it("a startled sleeper wakes with a rise-delay (laggard drama), not instantly", () => {
    const state = createGameState(level1);
    parkDog(state);
    silenceAmbient(state);
    const s = state.sheep;

    // Sheep 0 is deep in a rest bout, surrounded by its (calm) flockmates so isolation
    // isn't the wake trigger — a mild fright is. Panic sits above REST_WAKE_PANIC (0.12)
    // but well below the flight threshold, so it must *wake and rise*, not bolt.
    s.activity[0] = ACT_REST;
    s.restTimer[0] = 100;
    s.panic[0] = 0.2;
    s.panicPrev[0] = 0.2;

    rebuildGrid(state);
    stepSim(state, DT);

    // The wake trigger fired, but the rise-delay holds it lying down for this beat...
    expect(s.activity[0]).toBe(ACT_REST);
    expect(s.restTimer[0]).toBeLessThanOrEqual(REST_RISE_DELAY);

    // ...then, once REST_RISE_DELAY has elapsed, it rises.
    const riseSteps = Math.ceil(REST_RISE_DELAY / DT) + 5;
    for (let t = 0; t < riseSteps; t++) {
      parkDog(state);
      silenceAmbient(state);
      stepSim(state, DT);
    }
    expect(s.activity[0]).not.toBe(ACT_REST);
  });

  it("a stranded sheep is tagged ALERT with an arousal floor, then hurries home and clears", () => {
    const state = createGameState(level1);
    const s = state.sheep;

    // A tight flock clump with sheep 0 stranded ~450px north, well beyond awareness.
    for (let i = 1; i < s.count; i++) {
      const x = 700 + ((i % 15) - 7) * 6;
      const y = 600 + ((((i / 15) | 0) % 15) - 7) * 6;
      s.posX[i] = x;
      s.posY[i] = y;
      s.prevX[i] = x;
      s.prevY[i] = y;
    }
    s.posX[0] = 700;
    s.posY[0] = 150;
    s.prevX[0] = 700;
    s.prevY[0] = 150;

    const centroid = (): { x: number; y: number } => {
      let sx = 0;
      let sy = 0;
      for (let i = 1; i < s.count; i++) {
        sx += s.posX[i];
        sy += s.posY[i];
      }
      const n = s.count - 1;
      return { x: sx / n, y: sy / n };
    };
    const c0 = centroid();
    const dist0 = Math.hypot(s.posX[0] - c0.x, s.posY[0] - c0.y);

    parkDog(state);
    silenceAmbient(state);
    rebuildGrid(state);
    stepSim(state, DT);

    // While stranded: anxious (ALERT) and mildly aroused (isolation arousal floor).
    expect(s.activity[0]).toBe(ACT_ALERT);
    expect(s.strayTimer[0]).toBeGreaterThan(0);
    expect(s.panic[0]).toBeGreaterThanOrEqual(STRAY_AROUSAL - 1e-6);

    // It closes the gap back to the flock...
    for (let t = 0; t < 1400; t++) {
      parkDog(state);
      silenceAmbient(state);
      stepSim(state, DT);
    }
    const c1 = centroid();
    const dist1 = Math.hypot(s.posX[0] - c1.x, s.posY[0] - c1.y);
    expect(dist1).toBeLessThan(dist0 * 0.5);

    // ...and once rejoined, the stray flags clear (timer reset, arousal decayed away).
    expect(s.strayTimer[0]).toBe(0);
    expect(s.activity[0]).not.toBe(ACT_ALERT);
  });
});
