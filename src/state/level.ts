// Runtime level built from authoring data. All allocation happens here, once, at
// load — never in the per-frame sim. Adding a level = new LevelDef data, no sim code.

import {
  packWalls,
  polygonToWalls,
  type Wall,
} from "../sim/geometry";
import { FUNNEL_INSET } from "../../data/tuning";

/** Raw authoring data for a level: just polygons + a few points. */
export interface LevelDef {
  name: string;
  seed: number;
  sheepCount: number;
  field: number[]; // flat polygon [x0,y0,...], walkable = interior
  pen: number[]; // flat polygon, walkable = exterior (fence seen from the field)
  gateEdge: number; // index of the pen edge that is the open gate
  spawn: { x: number; y: number; w: number; h: number };
  dogStart: { x: number; y: number };
  penBack: { x: number; y: number }; // far interior of the pen (circulate-to-back target)
}

export interface Gate {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  midX: number;
  midY: number;
  inwardNx: number; // unit normal pointing into the pen interior
  inwardNy: number;
}

export interface Level {
  name: string;
  sheepCount: number;
  fieldPoly: Float32Array;
  penPoly: Float32Array;
  walls: Float32Array; // packed [ax,ay,bx,by,nx,ny]* — field + pen minus gate
  wallCount: number;
  gate: Gate;
  gateWall: Wall; // the gate segment, collides ONLY penned sheep (one-way)
  spawn: { x: number; y: number; w: number; h: number };
  dogStartX: number;
  dogStartY: number;
  penBackX: number;
  penBackY: number;
  funnelX: number; // attractor point just inside the gate
  funnelY: number;
}

function centroid(poly: Float32Array): { x: number; y: number } {
  let cx = 0;
  let cy = 0;
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    cx += poly[i * 2];
    cy += poly[i * 2 + 1];
  }
  return { x: cx / n, y: cy / n };
}

export function buildLevel(def: LevelDef): Level {
  const fieldPoly = new Float32Array(def.field);
  const penPoly = new Float32Array(def.pen);

  // Field: bodies live inside. Pen: bodies (approaching) live outside; skip the gate edge.
  const fieldWalls = polygonToWalls(fieldPoly, true);
  const penWalls = polygonToWalls(penPoly, false, def.gateEdge);
  const walls = packWalls(fieldWalls.concat(penWalls));

  // Gate segment = the skipped pen edge.
  const n = penPoly.length / 2;
  const gi = def.gateEdge;
  const gj = (gi + 1) % n;
  const ax = penPoly[gi * 2];
  const ay = penPoly[gi * 2 + 1];
  const bx = penPoly[gj * 2];
  const by = penPoly[gj * 2 + 1];
  const midX = (ax + bx) / 2;
  const midY = (ay + by) / 2;

  // Inward normal = from gate midpoint toward the pen centroid (works for any gate placement).
  const pc = centroid(penPoly);
  let inx = pc.x - midX;
  let iny = pc.y - midY;
  const ilen = Math.hypot(inx, iny) || 1;
  inx /= ilen;
  iny /= ilen;

  const gate: Gate = { ax, ay, bx, by, midX, midY, inwardNx: inx, inwardNy: iny };

  // One-way gate wall: normal points into the pen so penned sheep can't leak out.
  const gateWall: Wall = { ax, ay, bx, by, nx: inx, ny: iny };

  return {
    name: def.name,
    sheepCount: def.sheepCount,
    fieldPoly,
    penPoly,
    walls,
    wallCount: walls.length / 6,
    gate,
    gateWall,
    spawn: { ...def.spawn },
    dogStartX: def.dogStart.x,
    dogStartY: def.dogStart.y,
    penBackX: def.penBack.x,
    penBackY: def.penBack.y,
    funnelX: midX + inx * FUNNEL_INSET,
    funnelY: midY + iny * FUNNEL_INSET,
  };
}
