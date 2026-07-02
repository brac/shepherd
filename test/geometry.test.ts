import { describe, it, expect } from "vitest";
import {
  closestPointOnSegment,
  pointInPolygon,
  polygonToWalls,
} from "../src/sim/geometry";

describe("closestPointOnSegment", () => {
  it("projects onto the segment interior", () => {
    const cp = closestPointOnSegment(5, 5, 0, 0, 10, 0);
    expect(cp.x).toBeCloseTo(5);
    expect(cp.y).toBeCloseTo(0);
    expect(cp.t).toBeCloseTo(0.5);
  });

  it("clamps to an endpoint", () => {
    const cp = closestPointOnSegment(-5, 3, 0, 0, 10, 0);
    expect(cp.x).toBeCloseTo(0);
    expect(cp.y).toBeCloseTo(0);
    expect(cp.t).toBe(0);
  });
});

describe("pointInPolygon", () => {
  const square = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
  it("detects inside", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
  });
  it("detects outside", () => {
    expect(pointInPolygon(-1, 5, square)).toBe(false);
    expect(pointInPolygon(11, 5, square)).toBe(false);
  });
});

describe("polygonToWalls", () => {
  it("orients field normals inward", () => {
    // A CCW-or-CW square; interior is walkable. Every normal should point toward center.
    const square = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
    const walls = polygonToWalls(square, true);
    expect(walls.length).toBe(4);
    for (const w of walls) {
      const mx = (w.ax + w.bx) / 2;
      const my = (w.ay + w.by) / 2;
      // Vector from edge midpoint to polygon center (5,5) should align with the normal.
      const cx = 5 - mx;
      const cy = 5 - my;
      expect(w.nx * cx + w.ny * cy).toBeGreaterThan(0);
    }
  });

  it("can skip the gate edge", () => {
    const square = new Float32Array([0, 0, 10, 0, 10, 10, 0, 10]);
    const walls = polygonToWalls(square, false, 1);
    expect(walls.length).toBe(3);
  });
});
