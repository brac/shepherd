// Dumb view: draws the sheep SoA pool as a ParticleContainer of procedural FLEECE blobs —
// woolly value-noise texture with a feathered soft-alpha edge (blends overlapping sheep) and
// a baked domed sun-shade — coloured per sheep from a seeded shade ramp (cream → grey → dirty,
// plus a few brown/black) with per-sheep dirt and size. Activity/panic modulate that base
// tint. Reads GameState + interpolates prev->cur; never mutates sim state, never decides
// behavior. Optional external asset "fleece" replaces the procedural bake.

import { Container, ParticleContainer, Particle, Texture } from "pixi.js";
import type { GameState } from "../state/gameState";
import { ACT_ALERT, ACT_REST, FLAG_PENNED } from "../state/gameState";
import { createRng, nextFloat, nextRange, type Rng } from "../sim/rng";
import { lerp } from "./camera";
import { optionalTexture } from "./assets";
import { visuals } from "./visualsRuntime";
import { SHEEP_RADIUS, SHEEP_FLEE_SPEED } from "../../data/tuning";
import {
  BLACK_SHEEP_CHANCE,
  BLACK_SHEEP_TINT,
  BOUNCE_AMP,
  BOUNCE_FREQ,
  BREATH_AMP,
  BREATH_PERIOD_MAX,
  BREATH_PERIOD_MIN,
  BROWN_SHEEP_CHANCE,
  BROWN_SHEEP_TINT,
  DIRT_MAX,
  DIRT_TINT,
  FLEECE_EDGE_FEATHER,
  FLEECE_SHADES,
  FLEECE_SHADE_SKEW,
  FLEECE_SHADE_GAIN,
  FLEECE_SIZE_MAX,
  FLEECE_SIZE_MIN,
  FLEECE_WOOL_DEPTH,
  REST_BREATH_DEPTH,
  REST_BREATH_SLOW,
  SQUASH_GAIN,
  SQUASH_LAT,
  SUN_AZIMUTH,
  WOBBLE_AMP,
} from "../../data/visuals";

const TEXTURE_VARIANTS = 8;
const SUPERSAMPLE = 3; // bake fleece at 3x then display at 1/3 → smooth edges + noise at ~13px
const PANIC_TINT = 0xd9584c; // muted red the fleece shifts toward under panic
const PENNED_TINT = 0xbfe0a8; // soft green readability signal once safely penned
const ALERT_TINT = 0xe9e0a4; // faint warm cast for a head-up sheep
const REST_DIM = 0.12; // a lying sheep's fleece darkens this much
const REST_SCALE_Y = 0.7; // ...and reads flatter/lower

export class SheepView {
  readonly container: Container;
  private readonly particles: Particle[] = [];
  private readonly fleeceTint: Uint32Array; // per-sheep base fleece colour (shade + dirt)
  private readonly baseScale: Float32Array; // per-sheep display scale (texture→world × size spread)
  private readonly breathPhase: Float32Array; // per-sheep phase offset for breathing/bob (anti-sync)
  private readonly breathRate: Float32Array; // per-sheep breathing angular rate (rad/s)

  constructor(state: GameState) {
    const asset = optionalTexture("fleece");
    const textures = asset ? [asset] : bakeFleeceTextures();
    // Map a texture to world size: procedural bakes at SUPERSAMPLE; an asset maps its width
    // to roughly the sheep body diameter.
    const texScale = asset ? (SHEEP_RADIUS * 2.6) / asset.width : 1 / SUPERSAMPLE;

    const pc = new ParticleContainer({
      dynamicProperties: { position: true, rotation: true, color: true, scale: true },
    });
    const rng = createRng(0x5eed);
    const n = state.sheep.count;
    this.fleeceTint = new Uint32Array(n);
    this.baseScale = new Float32Array(n);
    this.breathPhase = new Float32Array(n);
    this.breathRate = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const tex = textures[(nextFloat(rng) * textures.length) | 0];
      this.baseScale[i] = texScale * nextRange(rng, FLEECE_SIZE_MIN, FLEECE_SIZE_MAX);
      this.fleeceTint[i] = pickFleeceTint(rng);
      this.breathPhase[i] = nextRange(rng, 0, Math.PI * 2);
      this.breathRate[i] = (Math.PI * 2) / nextRange(rng, BREATH_PERIOD_MIN, BREATH_PERIOD_MAX);
      const p = new Particle({
        texture: tex,
        x: state.sheep.posX[i],
        y: state.sheep.posY[i],
        anchorX: 0.5,
        anchorY: 0.5,
        rotation: state.sheep.heading[i],
        scaleX: this.baseScale[i],
        scaleY: this.baseScale[i],
        tint: this.fleeceTint[i],
      });
      pc.addParticle(p);
      this.particles.push(p);
    }
    this.container = pc;
  }

  update(state: GameState, alpha: number): void {
    const s = state.sheep;
    const t = state.simTime; // drives the breathing/bob clocks (advances at the sim rate)
    const animate = visuals.animateSheep; // perf A/B: false freezes the soft-material motion
    for (let i = 0; i < s.count; i++) {
      const p = this.particles[i];
      p.x = lerp(s.prevX[i], s.posX[i], alpha);
      p.y = lerp(s.prevY[i], s.posY[i], alpha);

      const base = this.baseScale[i];
      const fleece = this.fleeceTint[i];
      const flags = s.flags[i];
      const act = s.activity[i];
      const resting = !(flags & FLAG_PENNED) && act === ACT_REST;
      const ph = this.breathPhase[i];
      const rate = this.breathRate[i];

      // ---- Tint (per-sheep fleece modulated by activity/panic) ----
      if (flags & FLAG_PENNED) {
        p.tint = mixTint(fleece, PENNED_TINT, 0.7);
      } else if (resting) {
        p.tint = mixTint(fleece, 0x000000, REST_DIM);
      } else if (act === ACT_ALERT) {
        p.tint = mixTint(mixTint(fleece, ALERT_TINT, 0.25), PANIC_TINT, s.panic[i]);
      } else {
        p.tint = mixTint(fleece, PANIC_TINT, s.panic[i]);
      }

      // ---- Soft-material motion (Pillar 3) ----
      // scaleX = along heading (fleece is baked long on x, and rotation = heading), scaleY = across.
      if (!animate) {
        // A/B baseline: static body, no squash/stretch/breath/wobble. Isolates the motion's cost.
        p.scaleX = base;
        p.scaleY = resting ? base * REST_SCALE_Y : base;
        p.rotation = s.heading[i];
      } else if (resting) {
        // Deep, slow breathing; flattened; no bounce/wobble — a settled, planted mass.
        const b = 1 + BREATH_AMP * REST_BREATH_DEPTH * Math.sin(ph + t * rate * REST_BREATH_SLOW);
        p.scaleX = base * b;
        p.scaleY = base * REST_SCALE_Y * b;
        p.rotation = s.heading[i];
      } else {
        const vx = s.velX[i];
        const vy = s.velY[i];
        const spd = Math.sqrt(vx * vx + vy * vy);
        const sf = spd < SHEEP_FLEE_SPEED ? spd / SHEEP_FLEE_SPEED : 1; // 0 idle .. 1 full flee
        const idle = 1 - sf;
        const bob = 1 + BOUNCE_AMP * sf * Math.sin(ph + t * BOUNCE_FREQ);
        const breath = 1 + BREATH_AMP * idle * Math.sin(ph + t * rate);
        // Stretch along the heading, squash across → a soft bounding mass at speed.
        p.scaleX = base * (1 + SQUASH_GAIN * sf) * bob * breath;
        p.scaleY = base * (1 - SQUASH_LAT * sf) * breath;
        // Fleece-wobble rotation reads as jiggle (kept aligned with the body so it stays on
        // its shadow — the positional-lag variant would detach the two; that idea is cut).
        p.rotation = s.heading[i] + WOBBLE_AMP * sf * Math.sin(ph + t * BOUNCE_FREQ * 0.5);
      }
    }
  }
}

/** Per-sheep fleece colour: a few brown/black sheep, else a cream-skewed off-white ramp,
 * with a per-sheep dirt mix. Draws from the passed view RNG (deterministic, not the sim). */
function pickFleeceTint(rng: Rng): number {
  const roll = nextFloat(rng);
  let base: number;
  if (roll < BLACK_SHEEP_CHANCE) {
    base = BLACK_SHEEP_TINT;
  } else if (roll < BLACK_SHEEP_CHANCE + BROWN_SHEEP_CHANCE) {
    base = BROWN_SHEEP_TINT;
  } else {
    const u = nextFloat(rng);
    const idx = Math.min(FLEECE_SHADES.length - 1, (Math.pow(u, FLEECE_SHADE_SKEW) * FLEECE_SHADES.length) | 0);
    base = FLEECE_SHADES[idx];
  }
  const dirt = nextFloat(rng) * DIRT_MAX;
  return mixTint(base, DIRT_TINT, dirt * 0.5);
}

/** Bake TEXTURE_VARIANTS greyscale fleece blobs on a canvas (per-sheep colour is applied as
 * particle tint). Woolly value noise + a domed sun-shade + a feathered alpha edge. View-seeded
 * RNG, so it's deterministic but independent of the sim PRNG. */
function bakeFleeceTextures(): Texture[] {
  const rng = createRng(0xf1eece);
  const sunX = Math.cos(SUN_AZIMUTH);
  const sunY = Math.sin(SUN_AZIMUTH);
  const out: Texture[] = [];
  for (let v = 0; v < TEXTURE_VARIANTS; v++) {
    const rw = SHEEP_RADIUS * nextRange(rng, 1.15, 1.5) * SUPERSAMPLE;
    const rh = SHEEP_RADIUS * nextRange(rng, 0.75, 1.0) * SUPERSAMPLE;
    const pad = 2 * SUPERSAMPLE;
    const w = Math.ceil(rw * 2 + pad * 2);
    const h = Math.ceil(rh * 2 + pad * 2);
    const cx = w / 2;
    const cy = h / 2;
    // Irregular silhouette: an angular radius-jitter table sampled around the ellipse.
    const AJ = 20;
    const jit = new Float32Array(AJ);
    for (let k = 0; k < AJ; k++) jit[k] = 1 + nextRange(rng, -0.14, 0.14);
    // Two octaves of value noise: low-frequency clumps + finer grain.
    const lowN = 6;
    const hiN = 12;
    const low = randGrid(rng, lowN);
    const hi = randGrid(rng, hiN);

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      out.push(Texture.EMPTY);
      continue;
    }
    const img = ctx.createImageData(w, h);
    const d = img.data;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const idx = (py * w + px) * 4;
        const dx = px - cx;
        const dy = py - cy;
        const e = Math.sqrt((dx / rw) * (dx / rw) + (dy / rh) * (dy / rh));
        // Boundary radius at this angle (jittered → woolly outline).
        let ang = Math.atan2(dy, dx);
        if (ang < 0) ang += Math.PI * 2;
        const jf = (ang / (Math.PI * 2)) * AJ;
        const j0 = jf | 0;
        const jfrac = jf - j0;
        const edge = jit[j0] * (1 - jfrac) + jit[(j0 + 1) % AJ] * jfrac;
        if (e > edge) {
          d[idx + 3] = 0;
          continue;
        }
        // Feathered alpha over the outer FLEECE_EDGE_FEATHER of the silhouette.
        const t = (edge - e) / (edge * FLEECE_EDGE_FEATHER);
        const a = t < 1 ? t : 1;
        // Woolly luminance from the two noise octaves.
        const u = px / w;
        const vv = py / h;
        const wool = sampleGrid(low, lowN, u, vv) * 0.7 + sampleGrid(hi, hiN, u, vv) * 0.3;
        let lum = 1 - FLEECE_WOOL_DEPTH * (1 - wool);
        // Domed directional shade: rim brighter toward the sun, darker away (gentle volume).
        const rlen = Math.sqrt(dx * dx + dy * dy);
        if (rlen > 1e-3) {
          const ndx = dx / rlen;
          const ndy = dy / rlen;
          lum *= 1 + FLEECE_SHADE_GAIN * (ndx * sunX + ndy * sunY) * e;
        }
        if (lum > 1) lum = 1;
        else if (lum < 0.55) lum = 0.55;
        const c = (lum * 255) | 0;
        d[idx] = c;
        d[idx + 1] = c;
        d[idx + 2] = c;
        d[idx + 3] = (a * 255) | 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    out.push(Texture.from(canvas));
  }
  return out;
}

/** n×n grid of random values in [0,1) from the view RNG. */
function randGrid(rng: Rng, n: number): Float32Array {
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = nextFloat(rng);
  return g;
}

/** Bilinear sample of an n×n value grid at (u,v) in [0,1]. */
function sampleGrid(grid: Float32Array, n: number, u: number, v: number): number {
  const x = u * (n - 1);
  const y = v * (n - 1);
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = x0 + 1 < n ? x0 + 1 : n - 1;
  const y1 = y0 + 1 < n ? y0 + 1 : n - 1;
  const fx = x - x0;
  const fy = y - y0;
  const a = grid[y0 * n + x0];
  const b = grid[y0 * n + x1];
  const c = grid[y1 * n + x0];
  const dd = grid[y1 * n + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + dd * fx) * fy;
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
