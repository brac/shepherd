// Worn-paths layer (above ground, below fence). Renders the Phase 2A trample grid as faint
// flattened/discoloured grass where the flock and dog have repeatedly trodden — the field
// accumulates the session's history, recovering slowly. The grid is written into a small
// cols×rows canvas texture (one texel per cell) and stretched over the field with linear
// filtering, so cheap cells become soft blobs. Rebuilt at ~4 Hz. Dumb view; reads trample only.

import { Container, Sprite, Texture } from "pixi.js";
import type { GameState } from "../state/gameState";
import { WORN_MAX_ALPHA, WORN_MIN, WORN_REFRESH, WORN_TINT } from "../../data/visuals";

export class WornPathsView {
  readonly container = new Container();
  private readonly sprite: Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly texture: Texture;
  private readonly r: number;
  private readonly g: number;
  private readonly b: number;
  private nextRefresh = 0;

  constructor(state: GameState) {
    const tr = state.trample;
    this.canvas = document.createElement("canvas");
    this.canvas.width = tr.cols;
    this.canvas.height = tr.rows;
    this.texture = Texture.from(this.canvas);
    // LINEAR so the tiny cols×rows texture blends into soft blobs when stretched over the
    // field — otherwise each cell is a hard square and the grid flickers as it refreshes.
    this.texture.source.scaleMode = "linear";
    this.r = (WORN_TINT >> 16) & 0xff;
    this.g = (WORN_TINT >> 8) & 0xff;
    this.b = WORN_TINT & 0xff;

    this.sprite = new Sprite(this.texture);
    this.sprite.x = tr.minX;
    this.sprite.y = tr.minY;
    this.sprite.width = tr.cols * tr.cellSize;
    this.sprite.height = tr.rows * tr.cellSize;
    this.container.addChild(this.sprite);
  }

  update(state: GameState): void {
    if (state.simTime < this.nextRefresh) return;
    this.nextRefresh = state.simTime + WORN_REFRESH;

    const tr = state.trample;
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(tr.cols, tr.rows);
    const d = img.data;
    const val = tr.val;
    const span = 1 - WORN_MIN; // val is 0..TRAMPLE_MAX(1)
    for (let i = 0; i < val.length; i++) {
      // Dead zone below WORN_MIN (a single pass is invisible), then ramp — wear is nonlinear.
      const v = val[i];
      const a = v <= WORN_MIN ? 0 : ((v - WORN_MIN) / span) * WORN_MAX_ALPHA;
      d[i * 4] = this.r;
      d[i * 4 + 1] = this.g;
      d[i * 4 + 2] = this.b;
      d[i * 4 + 3] = (a * 255) | 0;
    }
    ctx.putImageData(img, 0, 0);
    this.texture.source.update();
  }
}
