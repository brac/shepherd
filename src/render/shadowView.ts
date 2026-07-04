// Soft contact shadows (Phase 2B M1, Pillar 1 — the biggest single realism win). A soft
// blurred blob under every sheep and the dog, offset by the one shared sun vector, low
// opacity, softest at the edge. Shadows are what ground the flock into the field. Dumb view:
// reads GameState + the live sun angle, never mutates. One batched ParticleContainer, one
// texture (optional asset "shadow", else a procedural radial gradient).

import { Container, ParticleContainer, Particle, Texture } from "pixi.js";
import type { GameState } from "../state/gameState";
import { ACT_REST } from "../state/gameState";
import { createRng, nextRange } from "../sim/rng";
import { lerp } from "./camera";
import { optionalTexture } from "./assets";
import { shadowDir } from "./visualsRuntime";
import { DOG_RADIUS, SHEEP_RADIUS } from "../../data/tuning";
import {
  SHADOW_ALPHA,
  SHADOW_LENGTH,
  SHADOW_REST_ALPHA,
  SHADOW_REST_SCALE,
  SHADOW_SCALE,
  SHADOW_TINT,
} from "../../data/visuals";

const TEX_RADIUS = 32; // baked gradient half-size; particle scale maps it to world radius

export class ShadowView {
  readonly container: Container;
  private readonly particles: Particle[] = [];
  private readonly baseScale: Float32Array; // per-body shadow scale (index count = the dog)

  constructor(state: GameState) {
    const tex = optionalTexture("shadow") ?? bakeShadowTexture();
    const pc = new ParticleContainer({
      dynamicProperties: { position: true, scale: true, color: true },
    });
    const s = state.sheep;
    const n = s.count;
    this.baseScale = new Float32Array(n + 1);
    const rng = createRng(0x5ad0);

    for (let i = 0; i < n; i++) {
      // A little per-sheep jitter so 500 shadows aren't identical (full size traits: M2).
      const world = SHEEP_RADIUS * SHADOW_SCALE * nextRange(rng, 0.9, 1.1);
      const sc = world / TEX_RADIUS;
      this.baseScale[i] = sc;
      const p = new Particle({
        texture: tex,
        x: s.posX[i],
        y: s.posY[i],
        anchorX: 0.5,
        anchorY: 0.5,
        scaleX: sc,
        scaleY: sc,
        tint: SHADOW_TINT,
        alpha: SHADOW_ALPHA,
      });
      pc.addParticle(p);
      this.particles.push(p);
    }

    // The dog's shadow (last particle).
    const dogSc = (DOG_RADIUS * SHADOW_SCALE) / TEX_RADIUS;
    this.baseScale[n] = dogSc;
    const dp = new Particle({
      texture: tex,
      x: state.dog.x,
      y: state.dog.y,
      anchorX: 0.5,
      anchorY: 0.5,
      scaleX: dogSc,
      scaleY: dogSc,
      tint: SHADOW_TINT,
      alpha: SHADOW_ALPHA,
    });
    pc.addParticle(dp);
    this.particles.push(dp);

    this.container = pc;
  }

  update(state: GameState, alpha: number): void {
    const s = state.sheep;
    const dir = shadowDir();
    const ox = dir.x * SHADOW_LENGTH;
    const oy = dir.y * SHADOW_LENGTH;
    const n = s.count;

    for (let i = 0; i < n; i++) {
      const p = this.particles[i];
      p.x = lerp(s.prevX[i], s.posX[i], alpha) + ox;
      p.y = lerp(s.prevY[i], s.posY[i], alpha) + oy;
      // A lying sheep sits lower: its shadow pulls in tighter and darkens (closer contact).
      if (s.activity[i] === ACT_REST) {
        const sc = this.baseScale[i] * SHADOW_REST_SCALE;
        p.scaleX = sc;
        p.scaleY = sc;
        p.alpha = SHADOW_REST_ALPHA;
      } else {
        p.scaleX = this.baseScale[i];
        p.scaleY = this.baseScale[i];
        p.alpha = SHADOW_ALPHA;
      }
    }

    const dp = this.particles[n];
    dp.x = lerp(state.dog.prevX, state.dog.x, alpha) + ox;
    dp.y = lerp(state.dog.prevY, state.dog.y, alpha) + oy;
  }
}

/** Procedural fallback: a soft white radial-gradient blob (white so the tint colours it). */
function bakeShadowTexture(): Texture {
  const size = TEX_RADIUS * 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(TEX_RADIUS, TEX_RADIUS, 0, TEX_RADIUS, TEX_RADIUS, TEX_RADIUS);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.82)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}
