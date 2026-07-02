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
  obstacles?: number[][]; // flat polygons blocking sheep AND dog (walkable = exterior)
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
  obstacles: Float32Array[]; // obstacle polygons (for rendering; collision uses `walls`)
  // For UNPENNED sheep and the dog: field + pen fence (minus gate, walkable=exterior) + obstacles.
  walls: Float32Array; // packed [ax,ay,bx,by,nx,ny]*
  wallCount: number;
  // For PENNED sheep: field + obstacles + the FULL pen boundary with inward normals
  // (every edge incl. the gate is solid from the inside) so a penned sheep can never
  // leave, no matter what pulls on it.
  pennedWalls: Float32Array;
  pennedWallCount: number;
  gate: Gate;
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

  // Field: bodies live inside. Pen: bodies (approaching) live outside; skip the gate
  // edge. Obstacles: bodies live outside (walkable = exterior), same as the pen fence.
  const fieldWalls = polygonToWalls(fieldPoly, true);
  const penExteriorWalls = polygonToWalls(penPoly, false, def.gateEdge); // approach side, gate open
  const penInteriorWalls = polygonToWalls(penPoly, true); // full closed, normals point inward
  const obstacles: Float32Array[] = [];
  let obstacleWalls: Wall[] = [];
  if (def.obstacles) {
    for (const raw of def.obstacles) {
      const poly = new Float32Array(raw);
      obstacles.push(poly);
      obstacleWalls = obstacleWalls.concat(polygonToWalls(poly, false));
    }
  }
  // Unpenned sheep + dog: pen fence blocks from outside, gate is open.
  const walls = packWalls(fieldWalls.concat(penExteriorWalls).concat(obstacleWalls));
  // Penned sheep: fully enclosed by the pen (gate included) so they cannot leave.
  const pennedWalls = packWalls(fieldWalls.concat(penInteriorWalls).concat(obstacleWalls));

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

  return {
    name: def.name,
    sheepCount: def.sheepCount,
    fieldPoly,
    penPoly,
    obstacles,
    walls,
    wallCount: walls.length / 6,
    pennedWalls,
    pennedWallCount: pennedWalls.length / 6,
    gate,
    spawn: { ...def.spawn },
    dogStartX: def.dogStart.x,
    dogStartY: def.dogStart.y,
    penBackX: def.penBack.x,
    penBackY: def.penBack.y,
    funnelX: midX + inx * FUNNEL_INSET,
    funnelY: midY + iny * FUNNEL_INSET,
  };
}
