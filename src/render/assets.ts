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

// Eager glob → a name→url map at build time. The directory may not exist yet (→ empty map).
const urls = import.meta.glob("../../assets/textures/*.{png,webp,jpg,jpeg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const registry = new Map<string, Texture>();

/** Load every present optional texture into the registry. Call once at renderer init. */
export async function loadOptionalTextures(): Promise<void> {
  await Promise.all(
    Object.entries(urls).map(async ([path, url]) => {
      try {
        const tex = await Assets.load<Texture>(url);
        registry.set(fileStem(path), tex);
      } catch {
        // Unloadable → stay procedural for that name.
      }
    }),
  );
}

/** The optional texture registered under `name`, or null if none was present. */
export function optionalTexture(name: string): Texture | null {
  return registry.get(name) ?? null;
}

function fileStem(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot === -1 ? base : base.slice(0, dot);
}
