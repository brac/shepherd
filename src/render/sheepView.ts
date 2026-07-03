// Dumb view: draws the sheep SoA pool as a ParticleContainer of irregular off-white
// ovals oriented to heading, tinted toward red as panic rises. Reads GameState and
// interpolates prev->cur; never mutates sim state, never decides behavior.

import {
  Application,
  Container,
  Graphics,
  ParticleContainer,
  Particle,
  Texture,
} from "pixi.js";
import type { GameState } from "../state/gameState";
import { ACT_ALERT, ACT_REST, FLAG_PENNED } from "../state/gameState";
import { createRng, nextFloat, nextRange, type Rng } from "../sim/rng";
import { lerp } from "./camera";
import { SHEEP_RADIUS } from "../../data/tuning";

const TEXTURE_VARIANTS = 8;
const CALM_TINT = 0xf2efe6; // off-white
const PANIC_TINT = 0xd9584c; // muted red
const PENNED_TINT = 0xbfe0a8; // soft green once safely penned
// Phase 2A minimal activity read (full fleece treatment is Phase 2B).
const REST_TINT = 0xcfccbf; // dimmer off-white for a lying sheep
const ALERT_TINT = 0xe9e0a4; // faint warm cast for a head-up sheep
const REST_SCALE_Y = 0.7; // a resting sheep reads flatter/lower

/** Pre-bake a few irregular oval textures (view-only randomness; NOT the sim rng). */
function bakeTextures(app: Application): Texture[] {
  const rng: Rng = createRng(0xa11ce);
  const textures: Texture[] = [];
  for (let v = 0; v < TEXTURE_VARIANTS; v++) {
    const rw = SHEEP_RADIUS * nextRange(rng, 1.15, 1.5);
    const rh = SHEEP_RADIUS * nextRange(rng, 0.75, 1.0);
    const g = new Graphics();
    // Irregular blob: sample points around an ellipse with a little jitter.
    const pts: number[] = [];
    const steps = 12;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const jr = 1 + nextRange(rng, -0.12, 0.12);
      pts.push(Math.cos(a) * rw * jr, Math.sin(a) * rh * jr);
    }
    g.poly(pts).fill({ color: 0xffffff });
    const tex = app.renderer.generateTexture(g);
    g.destroy();
    textures.push(tex);
  }
  return textures;
}

export class SheepView {
  readonly container: Container;
  private particles: Particle[] = [];

  constructor(app: Application, state: GameState) {
    const textures = bakeTextures(app);
    const pc = new ParticleContainer({
      dynamicProperties: { position: true, rotation: true, color: true, scale: true },
    });
    const rng = createRng(0x5eed);
    for (let i = 0; i < state.sheep.count; i++) {
      const tex = textures[(nextFloat(rng) * TEXTURE_VARIANTS) | 0];
      const p = new Particle({
        texture: tex,
        x: state.sheep.posX[i],
        y: state.sheep.posY[i],
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: state.sheep.heading[i],
        tint: CALM_TINT,
      });
      pc.addParticle(p);
      this.particles.push(p);
    }
    this.container = pc;
  }

  update(state: GameState, alpha: number): void {
    const s = state.sheep;
    for (let i = 0; i < s.count; i++) {
      const p = this.particles[i];
      p.x = lerp(s.prevX[i], s.posX[i], alpha);
      p.y = lerp(s.prevY[i], s.posY[i], alpha);
      p.rotation = s.heading[i];
      if (s.flags[i] & FLAG_PENNED) {
        p.tint = PENNED_TINT;
        p.scaleY = 1;
      } else {
        const act = s.activity[i];
        if (act === ACT_REST) {
          p.tint = REST_TINT;
          p.scaleY = REST_SCALE_Y;
        } else if (act === ACT_ALERT) {
          p.tint = mixTint(ALERT_TINT, PANIC_TINT, s.panic[i]);
          p.scaleY = 1;
        } else {
          p.tint = mixTint(CALM_TINT, PANIC_TINT, s.panic[i]);
          p.scaleY = 1;
        }
      }
    }
  }
}

/** Linear channel mix between two 0xRRGGBB colors. */
function mixTint(a: number, b: number, t: number): number {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = (ar + (br - ar) * t) & 0xff;
  const g = (ag + (bg - ag) * t) & 0xff;
  const bl = (ab + (bb - ab) * t) & 0xff;
  return (r << 16) | (g << 8) | bl;
}
