// Drifting cloud shadows (Phase 2B M5) — the spec's standout beauty-per-effort item. A few
// large, soft, dark patches slide slowly across the field, loosely along the wind, so the
// light feels alive over the flock even when it's idle. Overcast thickens and darkens them.
// Optional asset "cloud" replaces the procedural blob. Dumb view.

import { Container, Sprite, Texture } from "pixi.js";
import type { GameState } from "../state/gameState";
import type { Level } from "../state/level";
import { createRng, nextFloat, nextRange } from "../sim/rng";
import { optionalTexture } from "./assets";
import { visuals } from "./visualsRuntime";
import {
  CLOUD_COUNT,
  CLOUD_DARKEN,
  CLOUD_DRIFT_SPEED,
  CLOUD_SCALE,
  CLOUD_TINT,
  OVERCAST_CLOUD,
} from "../../data/visuals";

const TEX_RADIUS = 64;

export class CloudShadowView {
  readonly container = new Container();
  private readonly clouds: Sprite[] = [];
  private readonly baseX: Float32Array; // offset within [0, spanX)
  private readonly baseY: Float32Array;
  private readonly spanX: number; // wrap distance per axis (field + one cloud of margin)
  private readonly spanY: number;
  private readonly minX: number;
  private readonly minY: number;
  private readonly dirX: number;
  private readonly dirY: number;

  constructor(level: Level) {
    const b = bounds(level.fieldPoly);
    const margin = CLOUD_SCALE * 0.6; // a cloud fully off one edge before it wraps back
    this.spanX = b.maxX - b.minX + margin * 2;
    this.spanY = b.maxY - b.minY + margin * 2;
    this.minX = b.minX - margin;
    this.minY = b.minY - margin;
    // Loose wind direction (diagonal), normalised.
    const a = -0.6;
    this.dirX = Math.cos(a);
    this.dirY = Math.sin(a);

    const tex = optionalTexture("cloud") ?? bakeCloudTexture();
    const rng = createRng(0xc10d);
    this.baseX = new Float32Array(CLOUD_COUNT);
    this.baseY = new Float32Array(CLOUD_COUNT);
    for (let i = 0; i < CLOUD_COUNT; i++) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      const scale = (CLOUD_SCALE / TEX_RADIUS) * nextRange(rng, 0.75, 1.35);
      sp.scale.set(scale, scale * nextRange(rng, 0.7, 1.0)); // slightly elliptical
      sp.rotation = nextRange(rng, 0, Math.PI * 2);
      sp.tint = CLOUD_TINT;
      this.baseX[i] = nextFloat(rng) * this.spanX;
      this.baseY[i] = nextFloat(rng) * this.spanY;
      this.clouds.push(sp);
      this.container.addChild(sp);
    }
  }

  update(state: GameState): void {
    const drift = state.simTime * CLOUD_DRIFT_SPEED;
    const alpha = CLOUD_DARKEN * (1 + visuals.overcast * OVERCAST_CLOUD);
    for (let i = 0; i < this.clouds.length; i++) {
      const sp = this.clouds[i];
      // Slide along the wind, wrapping within [min, min+span] on each axis.
      sp.x = this.minX + wrap(this.baseX[i] + this.dirX * drift, this.spanX);
      sp.y = this.minY + wrap(this.baseY[i] + this.dirY * drift, this.spanY);
      sp.alpha = alpha;
    }
  }
}

function wrap(v: number, span: number): number {
  const m = v % span;
  return m < 0 ? m + span : m;
}

function bounds(poly: Float32Array): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    const x = poly[i];
    const y = poly[i + 1];
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Soft irregular blob: radial falloff × wrapping value noise for an organic cloud edge. */
function bakeCloudTexture(): Texture {
  const rng = createRng(0xc10de);
  const size = TEX_RADIUS * 2;
  const gn = 6;
  const grid = new Float32Array(gn * gn);
  for (let i = 0; i < grid.length; i++) grid[i] = nextFloat(rng);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.EMPTY;
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - TEX_RADIUS) / TEX_RADIUS;
      const dy = (y - TEX_RADIUS) / TEX_RADIUS;
      const r = Math.sqrt(dx * dx + dy * dy);
      const n = wrapNoise(grid, gn, x / size, y / size);
      // Falloff softened and eaten into by noise so the edge is lumpy, not a clean disc.
      let a = 1 - r * (0.7 + n * 0.6);
      if (a < 0) a = 0;
      else if (a > 1) a = 1;
      const idx = (y * size + x) * 4;
      d[idx] = 255;
      d[idx + 1] = 255;
      d[idx + 2] = 255;
      d[idx + 3] = (a * a * 255) | 0; // square → softer core, faint edge
    }
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(canvas);
}

function wrapNoise(grid: Float32Array, n: number, u: number, v: number): number {
  const x = u * n;
  const y = v * n;
  const x0 = x | 0;
  const y0 = y | 0;
  const x1 = (x0 + 1) % n;
  const y1 = (y0 + 1) % n;
  const fx = x - x0;
  const fy = y - y0;
  const a = grid[y0 * n + x0];
  const b = grid[y0 * n + x1];
  const c = grid[y1 * n + x0];
  const dd = grid[y1 * n + x1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + dd * fx) * fy;
}
