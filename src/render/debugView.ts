// Debug overlay for Phase 2A observability (toggle with 'D'). Dumb view: reads
// GameState, never mutates it. Recolours every sheep by its activity/flee state and rings
// active ambient startle emitters, so behaviour is visible while tuning. Pooling
// attractors (M5) and the trample heatmap (M6) fill in as those milestones land.

import { Container, Graphics } from "pixi.js";
import {
  ACT_ALERT,
  ACT_FOLLOW,
  ACT_REST,
  FLAG_FLEEING,
  type GameState,
} from "../state/gameState";
import { BIRD_STARTLE_RADIUS, TRAMPLE_MAX } from "../../data/tuning";

const STARTLE_RING_COLOR = 0xffe066;
const POOL_COLOR = 0x66d9ff; // soft blue — a terrain-pooling camp (M5)
const TRAMPLE_COLOR = 0x8a6d3b; // muddy brown — worn ground (M6)
const TRAMPLE_MIN_DRAW = 0.04; // skip near-empty cells so the heatmap stays cheap/legible
// Activity palette (dot per sheep).
const COL_GRAZE = 0x6ab04c; // green — calm/grazing
const COL_ALERT = 0xffe066; // yellow — planted and staring at a disturbance
const COL_FLEE = 0xff4d4d; // red — fleeing
const COL_REST = 0x7f8fa6; // slate — lying down (M4)
const COL_FOLLOW = 0x4dd0e1; // cyan — following a leader (M6)

export class DebugView {
  readonly container: Container;
  private readonly g = new Graphics();
  private on = false;

  constructor() {
    this.container = new Container();
    this.container.addChild(this.g);
    this.container.visible = false;
  }

  toggle(): void {
    this.on = !this.on;
    this.container.visible = this.on;
  }

  update(state: GameState): void {
    if (!this.on) return;
    const g = this.g;
    g.clear();

    // Worn-paths heatmap (M6): muddy tint per trodden cell, drawn first (under everything).
    const tr = state.trample;
    const tv = tr.val;
    for (let k = 0; k < tv.length; k++) {
      const v = tv[k];
      if (v < TRAMPLE_MIN_DRAW) continue;
      const cx = k % tr.cols;
      const cy = (k / tr.cols) | 0;
      g.rect(tr.minX + cx * tr.cellSize, tr.minY + cy * tr.cellSize, tr.cellSize, tr.cellSize).fill({
        color: TRAMPLE_COLOR,
        alpha: 0.55 * (v / TRAMPLE_MAX),
      });
    }

    // A dot per sheep, coloured by activity (fleeing overrides activity).
    const s = state.sheep;
    for (let i = 0; i < s.count; i++) {
      let color: number;
      if (s.flags[i] & FLAG_FLEEING) color = COL_FLEE;
      else if (s.activity[i] === ACT_ALERT) color = COL_ALERT;
      else if (s.activity[i] === ACT_REST) color = COL_REST;
      else if (s.activity[i] === ACT_FOLLOW) color = COL_FOLLOW;
      else color = COL_GRAZE;
      g.circle(s.posX[i], s.posY[i], 3.5).fill({ color, alpha: 0.9 });
    }

    // Terrain-pooling camps (M5): catchment ring + centre dot.
    const level = state.level;
    const pa = level.poolAttr;
    for (let k = 0; k < level.poolCount; k++) {
      const x = pa[k * 4];
      const y = pa[k * 4 + 1];
      const radius = pa[k * 4 + 3];
      g.circle(x, y, radius).stroke({ color: POOL_COLOR, width: 2, alpha: 0.5 });
      g.circle(x, y, 6).fill({ color: POOL_COLOR, alpha: 0.7 });
    }

    // Active ambient startle emitters (birds / gusts).
    const a = state.ambient;
    for (let k = 0; k < a.startleTtl.length; k++) {
      if (a.startleTtl[k] > 0) {
        g.circle(a.startleX[k], a.startleY[k], BIRD_STARTLE_RADIUS).stroke({
          color: STARTLE_RING_COLOR,
          width: 2,
          alpha: 0.8,
        });
      }
    }
  }
}
