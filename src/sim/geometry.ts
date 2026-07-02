// Pure geometry helpers for the sim. No allocation in the hot-path functions
// (closestPointOnSegment writes into an out-object the caller owns).

export interface Vec2 {
  x: number;
  y: number;
}

/** A wall is a segment (a->b) with a precomputed unit outward normal (nx, ny). */
export interface Wall {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
}

const _cp = { x: 0, y: 0, t: 0 };

/**
 * Closest point on segment (ax,ay)-(bx,by) to (px,py).
 * Returns a shared scratch object {x,y,t} — copy fields out before the next call.
 * t is the clamped parameter along the segment [0,1].
 */
export function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  _cp.x = ax + t * dx;
  _cp.y = ay + t * dy;
  _cp.t = t;
  return _cp;
}

/** Standard even-odd ray-cast point-in-polygon. poly is flat [x0,y0,x1,y1,...]. */
export function pointInPolygon(px: number, py: number, poly: Float32Array): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if (yi > py !== yj > py) {
      const xCross = ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (px < xCross) inside = !inside;
    }
  }
  return inside;
}

/** Signed area * 2 of a flat polygon (>0 => counter-clockwise in a y-down world). */
export function polygonSignedArea2(poly: Float32Array): number {
  let sum = 0;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    sum += poly[j * 2] * poly[i * 2 + 1] - poly[i * 2] * poly[j * 2 + 1];
  }
  return sum;
}

/**
 * Build walls from a flat polygon. Each edge gets a unit normal pointing to the
 * *inside* of the polygon (bodies live inside the field / outside the pen fence,
 * so "inward" is where they are pushed back to). `interiorInside` selects which
 * side is the walkable side: true = interior of the polygon is walkable (field),
 * false = exterior is walkable (pen fence, seen from outside).
 * `skipEdge` lets a single edge (the gate) be omitted.
 */
export function polygonToWalls(
  poly: Float32Array,
  interiorInside: boolean,
  skipEdge: number = -1,
): Wall[] {
  const n = poly.length / 2;
  const ccw = polygonSignedArea2(poly) > 0;
  const walls: Wall[] = [];
  for (let i = 0; i < n; i++) {
    if (i === skipEdge) continue;
    const ax = poly[i * 2];
    const ay = poly[i * 2 + 1];
    const j = (i + 1) % n;
    const bx = poly[j * 2];
    const by = poly[j * 2 + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    // Left normal of the edge direction.
    let nx = -dy / len;
    let ny = dx / len;
    // For a CCW polygon the left normal points inward; flip as needed so the
    // normal points toward the walkable side.
    const pointsInward = ccw;
    if (pointsInward !== interiorInside) {
      nx = -nx;
      ny = -ny;
    }
    walls.push({ ax, ay, bx, by, nx, ny });
  }
  return walls;
}

/** Flatten a Wall[] into a Float32Array [ax,ay,bx,by,nx,ny]* for cache-friendly iteration. */
export function packWalls(walls: Wall[]): Float32Array {
  const out = new Float32Array(walls.length * 6);
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    out[i * 6] = w.ax;
    out[i * 6 + 1] = w.ay;
    out[i * 6 + 2] = w.bx;
    out[i * 6 + 3] = w.by;
    out[i * 6 + 4] = w.nx;
    out[i * 6 + 5] = w.ny;
  }
  return out;
}
