// Phase 2B render tunables. Same rule as data/tuning.ts — views read these, never hardcode
// a number — but kept SEPARATE from the sim tuning: nothing here touches behavior or the
// determinism contract. Live-tunable subset (sun angle, etc.) is mirrored in
// src/render/visualsRuntime.ts so the dev panel can adjust it without editing constants.

// ---- Sun (the single shared light source) ----
// One light direction feeds shadows (Pillar 1), fleece shading (Pillar 2), grass, and cloud
// shadows (M5). Consistency of light across everything is what sells realism. Azimuth is the
// compass direction the light comes FROM, in world radians (atan2 convention: +x right, +y
// down). Elevation biases shadow length: low sun = long shadows, overhead = short.
export const SUN_AZIMUTH = -2.36; // ≈ -135°: light from the upper-left, shadows fall lower-right
export const SUN_ELEVATION = 0.9; // 0 = grazing/horizon (long) .. ~1.4 = overhead (short)
export const SHADOW_LENGTH = 5; // px the shadow centre is pushed away from the sun (subtle at top-down)
export const SHADOW_ALPHA = 0.26; // base opacity of a contact shadow
export const SHADOW_REST_ALPHA = 0.34; // a lying sheep sits lower → tighter, darker contact
export const SHADOW_SCALE = 1.6; // shadow blob radius relative to SHEEP_RADIUS (a soft pool under the body)
export const SHADOW_REST_SCALE = 0.8; // a resting sheep's shadow pulls in tighter (closer contact)
export const SHADOW_TINT = 0x1b2913; // dark warm-green (reads more natural on grass than pure black)

// ---- Fleece palette (Pillar 2 / anti-uniformity, M2) ----
// Off-white ramp skewed toward cream, plus a rare-sheep table. Real flocks are not uniform
// and the eye catches it fast, so a few darker fleeces + dirt variation carry the realism.
export const FLEECE_SHADES = [0xf2efe6, 0xece7d9, 0xe1dbc9, 0xd6cfba]; // cream → greyer → dirty
export const FLEECE_SHADE_SKEW = 1.6; // >1 biases the pick toward the lighter (cream) end
export const BROWN_SHEEP_CHANCE = 0.05; // fraction of the flock with a brown fleece
export const BLACK_SHEEP_CHANCE = 0.02; // ...and black (a couple per few hundred)
export const BROWN_SHEEP_TINT = 0x8a6f52;
export const BLACK_SHEEP_TINT = 0x4a4640;
export const DIRT_TINT = 0xcdbfa6; // multiplied under a sheep for a grubby underside
export const DIRT_MAX = 0.35; // max per-sheep dirt mix (0 = clean, 1 = full DIRT_TINT)

// ---- Grass / field (M4) ----
export const GRASS_BASE = 0x7fa650; // matches the current flat fill so M0 is unchanged
export const GRASS_PATCH_DARK = 0x6f9646; // large-scale value variation (low-frequency octave)
export const GRASS_PATCH_LIGHT = 0x8bb35c;
export const WORN_TINT = 0x9c8b63; // flattened/discoloured grass where traffic has passed

// ---- Soft-material motion (Pillar 3, M3) — all applied per-sheep phase-offset ----
export const SQUASH_GAIN = 0.35; // stretch-along-heading at full flee speed (fraction)
export const JIGGLE_LAG = 0.12; // fraction the rendered fleece lags the body (wool settles behind)
export const BREATH_AMP = 0.02; // idle breathing scale pulse (±2%)
export const BREATH_PERIOD_MIN = 2.6; // seconds per breath (per-sheep, seeded)
export const BREATH_PERIOD_MAX = 4.2;

// ---- World mood / clouds (M5) ----
export const CLOUD_COUNT = 3; // drifting soft shadow patches
export const CLOUD_DARKEN = 0.18; // how much a cloud patch dims the ground beneath it
export const CLOUD_DRIFT_SPEED = 6; // px/s the cloud field slides across the field

// ---- Camera dynamic zoom (M6; graduates to data/tuning.ts when the sim camera pass reads it) ----
export const ZOOM_MIN = 0.62; // flock spread wide → zoomed out
export const ZOOM_MAX = 1.05; // flock tight / working the pen → zoomed in
export const ZOOM_EASE = 1.2; // slow ease of zoom toward its spread target (1/s)
