// Optional external textures (art drop-in). 2B renders PROCEDURALLY by default; if an artist
// drops a file into assets/textures/ it is picked up here and a view can prefer it over its
// procedural bake. Absence is the norm and must never error — Vite's import.meta.glob only
// lists files that actually exist, so a missing asset is simply not in the map (no 404s).
//
// Honored names (each view documents its expectation): "shadow" (radial-gradient blob),
// "fleece" (soft-alpha woolly oval, ~greyscale so per-sheep shade tints cleanly), "grass"
// (seamlessly tileable), "cloud" (soft dark patch). Render-only: the sim never sees these,
// and headless/test runs never call the loader.

import { Assets, type Texture } from "pixi.js";

// Eager glob → a name→url map at build time. assets/textures/ is the canonical drop-in slot
// (all files honored); from assets/images/ we only pull the gen_* grass photos as ground
// candidates — the other source art there (level references) is multi-megapixel and unused,
// so we don't upload it to the GPU at boot. A folder may be empty (→ no entries). Keyed by
// filename stem (see fileStem).
const urls = import.meta.glob(
  ["../../assets/textures/*.{png,webp,jpg,jpeg}", "../../assets/images/gen_*.{png,webp,jpg,jpeg}"],
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>;

const registry = new Map<string, Texture>();
const LOAD_TIMEOUT_MS = 6000; // a slow/stalled asset must never block boot — fall back procedural

/** Load every present optional texture into the registry. Call once at renderer init. Never
 * blocks boot indefinitely: an asset that fails OR stalls past the timeout is skipped and its
 * view stays procedural. */
export async function loadOptionalTextures(): Promise<void> {
  await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      try {
        const tex = await withTimeout(Assets.load<Texture>(url));
        if (tex) registry.set(fileStem(path), tex);
      } catch {
        // Unloadable → stay procedural for that name.
      }
    }),
  );
}

function withTimeout(p: Promise<Texture>): Promise<Texture | null> {
  return Promise.race([
    p,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), LOAD_TIMEOUT_MS)),
  ]);
}

/** The optional texture registered under `name`, or null if none was present. */
export function optionalTexture(name: string): Texture | null {
  return registry.get(name) ?? null;
}

/** First present texture from a preference list (e.g. ["grass", "gen_1"]), or null. */
export function optionalTextureAny(names: string[]): Texture | null {
  for (const n of names) {
    const t = registry.get(n);
    if (t) return t;
  }
  return null;
}

function fileStem(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}
