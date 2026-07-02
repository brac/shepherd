import { describe, it, expect } from "vitest";
import { createRng, nextFloat } from "../src/sim/rng";

describe("mulberry32 rng", () => {
  it("is reproducible for the same seed", () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      expect(nextFloat(a)).toBe(nextFloat(b));
    }
  });

  it("differs across seeds", () => {
    const a = createRng(1);
    const b = createRng(2);
    let same = 0;
    for (let i = 0; i < 100; i++) {
      if (nextFloat(a) === nextFloat(b)) same++;
    }
    expect(same).toBeLessThan(5);
  });

  it("stays within [0,1)", () => {
    const r = createRng(999);
    for (let i = 0; i < 10000; i++) {
      const v = nextFloat(r);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
