// Seeded mulberry32 PRNG. The ONLY source of randomness in the sim.
// State is a single uint32 carried in GameState so a level+seed is reproducible.
// Never call Math.random() anywhere in the sim.

export interface Rng {
  s: number; // current 32-bit state
}

export function createRng(seed: number): Rng {
  // Ensure a well-mixed non-zero 32-bit seed.
  return { s: (seed >>> 0) || 0x9e3779b9 };
}

/** Advance and return a float in [0, 1). Mutates rng.s in place (no allocation). */
export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Float in [lo, hi). */
export function nextRange(rng: Rng, lo: number, hi: number): number {
  return lo + (hi - lo) * nextFloat(rng);
}

/** Symmetric float in [-mag, mag). */
export function nextSigned(rng: Rng, mag: number): number {
  return (nextFloat(rng) * 2 - 1) * mag;
}
