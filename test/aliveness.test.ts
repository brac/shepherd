import { describe, it, expect } from "vitest";
import { createGameState, type GameState } from "../src/state/gameState";
import { level1 } from "../data/levels/level1";
import { rebuildGrid } from "../src/sim/spatialHash";
import { updatePanic } from "../src/sim/panic";
import { stepSim } from "../src/sim/step";
import { DT, BIRD_STARTLE_TTL, PANIC_PROPAGATE_MIN, WAVE_SPEED } from "../data/tuning";

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
