# Optional textures (art drop-in)

Phase 2B renders **procedurally by default**. Drop a file here and the matching view uses it
instead of its procedural bake — no code change. Remove it and the procedural look returns.
Absence is the norm; nothing here is required. Loaded by `src/render/assets.ts` via Vite
`import.meta.glob`, so only files that actually exist are picked up (no 404s).

Honored filenames (any of `.png`, `.webp`, `.jpg`):

| name        | used by (milestone)      | spec |
|-------------|--------------------------|------|
| `shadow`    | ShadowView (M1)          | soft radial-gradient dark blob, transparent edge, roughly square |
| `fleece`    | SheepView (M2)           | soft-alpha woolly oval, ~greyscale so per-sheep shade/dirt/panic tints apply cleanly as tint |
| `grass`     | GroundView (M4)          | seamlessly tileable grass swatch |
| `cloud`     | CloudShadowView (M5)     | large soft dark patch, transparent edges, for a drifting cloud shadow |

The procedural path is the canonical look and is what each milestone is tuned against; an
external texture is a swap-in enhancement. If a provided asset looks wrong, fix the asset to
match the spec above — the code never special-cases it.
