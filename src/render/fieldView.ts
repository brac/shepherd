// Dumb view: draws the field boundary, pen fence (gate omitted), and a soft gate
// marker straight from the level polygon data. Static — drawn once at construction.

import { Container, Graphics } from "pixi.js";
import type { Level } from "../state/level";
import { OBSTACLE_SHADOW_ALPHA, OBSTACLE_SHADOW_LEN, SHADOW_TINT, SUN_AZIMUTH } from "../../data/visuals";

const GRASS_EDGE = 0x4a6630;
const FENCE = 0x6b4a2f;
const GATE_MARK = 0xe8d9a0;
const ROCK = 0x8a8577;
const ROCK_EDGE = 0x625e53;

export class FieldView {
  readonly container: Container;

  constructor(level: Level) {
    const c = new Container();

    // Field boundary only — GroundView owns the grass fill now (below this layer).
    const field = new Graphics();
    const fp = level.fieldPoly;
    const pts: number[] = [];
    for (let i = 0; i < fp.length; i++) pts.push(fp[i]);
    field.poly(pts).stroke({ width: 4, color: GRASS_EDGE, alpha: 0.6 });
    c.addChild(field);

    // A tall obstacle casts a soft shadow, offset by the shared sun (baked; matches fleece).
    const sox = -Math.cos(SUN_AZIMUTH) * OBSTACLE_SHADOW_LEN;
    const soy = -Math.sin(SUN_AZIMUTH) * OBSTACLE_SHADOW_LEN;

    // Obstacles (block sheep and dog).
    for (const poly of level.obstacles) {
      const op: number[] = [];
      for (let i = 0; i < poly.length; i++) op.push(poly[i]);
      const shadow = new Graphics();
      const sp: number[] = [];
      for (let i = 0; i < poly.length; i += 2) {
        sp.push(poly[i] + sox, poly[i + 1] + soy);
      }
      shadow.poly(sp).fill({ color: SHADOW_TINT, alpha: OBSTACLE_SHADOW_ALPHA });
      c.addChild(shadow);
      const g = new Graphics();
      g.poly(op).fill({ color: ROCK }).stroke({ width: 4, color: ROCK_EDGE });
      c.addChild(g);
    }

    // Pen fence: draw each wall segment that belongs to the pen (skip field walls),
    // i.e. reconstruct from penPoly minus the gate edge.
    const fence = new Graphics();
    const pen = level.penPoly;
    const n = pen.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      // Skip the gate edge (the segment matching the gate endpoints).
      if (isGateEdge(pen, i, j, level)) continue;
      fence.moveTo(pen[i * 2], pen[i * 2 + 1]).lineTo(pen[j * 2], pen[j * 2 + 1]);
    }
    fence.stroke({ width: 7, color: FENCE });
    c.addChild(fence);

    // Gate marker: a faint post-to-post line showing the opening.
    const gate = new Graphics();
    gate
      .moveTo(level.gate.ax, level.gate.ay)
      .lineTo(level.gate.bx, level.gate.by)
      .stroke({ width: 3, color: GATE_MARK, alpha: 0.6 });
    c.addChild(gate);

    this.container = c;
  }
}

function isGateEdge(pen: Float32Array, i: number, j: number, level: Level): boolean {
  const ax = pen[i * 2];
  const ay = pen[i * 2 + 1];
  const bx = pen[j * 2];
  const by = pen[j * 2 + 1];
  const g = level.gate;
  const eps = 0.5;
  const match =
    (Math.abs(ax - g.ax) < eps &&
      Math.abs(ay - g.ay) < eps &&
      Math.abs(bx - g.bx) < eps &&
      Math.abs(by - g.by) < eps) ||
    (Math.abs(ax - g.bx) < eps &&
      Math.abs(ay - g.by) < eps &&
      Math.abs(bx - g.ax) < eps &&
      Math.abs(by - g.ay) < eps);
  return match;
}
