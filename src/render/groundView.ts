// Ground layer (bottom of the world). A great ground makes simple sheep look real by
// association (spec §3). Prefers an external grass photo (assets/images/gen_*, or a "grass"
// drop-in) stretched over the field; falls back to a procedural noise ground. On top: a soft
// edge vignette and a faint wind-streak layer that only shows during a gust (tracks
// ambient.windAlert) so 2A wind-startles visibly brush the grass. Dumb view.

import { Container, Sprite, TilingSprite, Texture } from "pixi.js";
import type { GameState } from "../state/gameState";
import type { Level } from "../state/level";
import { createRng, nextFloat } from "../sim/rng";
import { optionalTextureAny } from "./assets";
import { GUST_ALERT } from "../../data/tuning";
import {
  GRASS_ASSET_NAMES,
  GRASS_BASE,
  GRASS_PATCH_DARK,
  GRASS_PATCH_LIGHT,
  VIGNETTE_ALPHA,
  WIND_SCROLL,
  WIND_STREAK_ALPHA,
} from "../../data/visuals";

export class GroundView {
  readonly container = new Container();
  private readonly wind: TilingSprite;

  constructor(level: Level) {
    const b = bounds(level.fieldPoly);
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;

    // Ground: external grass photo if present, else procedural noise.
    const photo = optionalTextureAny(GRASS_ASSET_NAMES);
    if (photo) {
      const sp = new Sprite(photo);
      sp.x = b.minX;
      sp.y = b.minY;
      sp.width = w;
      sp.height = h;
      this.container.addChild(sp);
    } else {
      const proc = new Sprite(bakeGrassTexture());
      proc.x = b.minX;
      proc.y = b.minY;
      proc.width = w;
      proc.height = h;
      this.container.addChild(proc);
    }

    // Soft edge vignette (frames the field, sells "terrain under light").
    const vig = new Sprite(bakeVignette());
    vig.x = b.minX;
    vig.y = b.minY;
    vig.width = w;
    vig.height = h;
    vig.alpha = VIGNETTE_ALPHA;
    this.container.addChild(vig);

    // Wind streaks: a tiling soft-noise layer, additive, alpha driven by the gust in update().
    this.wind = new TilingSprite({ texture: bakeWindStreaks(), width: w, height: h });
    this.wind.x = b.minX;
    this.wind.y = b.minY;
    this.wind.blendMode = "add";
    this.wind.alpha = 0;
    this.container.addChild(this.wind);
  }

  update(state: GameState): void {
    // Only visible during a gust; slides across the field so a gust reads as moving air.
    const gust = state.ambient.windAlert / GUST_ALERT;
    this.wind.alpha = (gust < 1 ? gust : 1) * WIND_STREAK_ALPHA;
    if (this.wind.alpha > 0.001) {
      const d = state.simTime * WIND_SCROLL;
      this.wind.tilePosition.set(-d, -d * 0.4);
    }
  }
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

/** Procedural fallback ground: low-res green value-noise stretched smooth over the field. */
function bakeGrassTexture(): Texture {
  const rng = createRng(0x9a55);
  const w = 48;
  const h = 30;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.WHITE;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const dark = rgb(GRASS_PATCH_DARK);
  const light = rgb(GRASS_PATCH_LIGHT);
  const base = rgb(GRASS_BASE);
  for (let i = 0; i < w * h; i++) {
    // Blend base→dark/light by a soft random value (bilinear stretch smooths it into patches).
    const t = nextFloat(rng);
    const target = t < 0.5 ? dark : light;
    const k = Math.abs(t - 0.5) * 0.9;
    d[i * 4] = base.r + (target.r - base.r) * k;
    d[i * 4 + 1] = base.g + (target.g - base.g) * k;
    d[i * 4 + 2] = base.b + (target.b - base.b) * k;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(canvas);
}

/** Radial vignette: transparent centre → dark toward the edges (stretched over the field). */
function bakeVignette(): Texture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Texture.EMPTY;
  const g = ctx.createRadialGradient(size / 2, size / 2, size * 0.32, size / 2, size / 2, size * 0.72);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/** Tileable soft grayscale streaks for the additive wind layer. */
function bakeWindStreaks(): Texture {
  const rng = createRng(0x3d11);
  const size = 128;
  const gn = 8;
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
      // Wrapping bilinear value noise → tileable soft streaks.
      const n = wrapNoise(grid, gn, x / size, y / size);
      const v = Math.max(0, n - 0.55) * 200; // only the bright crests, faint
      const idx = (y * size + x) * 4;
      d[idx] = 255;
      d[idx + 1] = 255;
      d[idx + 2] = 235;
      d[idx + 3] = v | 0;
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

function rgb(hex: number): { r: number; g: number; b: number } {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}
