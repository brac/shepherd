# PHASE_2A_FLOCK_ALIVENESS.md — shepherd

**Goal:** fix "minute-to-minute is good but flat." At 500 sheep the flock should feel like a living thing with its own agenda, producing small emergent events the player notices and enjoys even when not actively herding. This is depth on the *enjoyment* axis, not the *challenge* axis — nothing here adds tasks, failure, or difficulty. It adds life to watch.

**Non-negotiable:** every behavior here is an emergent consequence of per-sheep rules over existing state (position, velocity, panic, neighbors). No scripted events, no flock object, no global choreography. The little dramas must *emerge* so they're never the same twice. Same architecture rules as CLAUDE.md — SoA, local-only awareness, no allocation in hot loops, all tunables in `data/`.

---

## 1. Sheep behavior states (extend, don't replace, the panic model)

Panic remains the single flight scalar from the DESIGN_BIBLE. Layer a small **activity state** on top, orthogonal to panic, that governs *low-panic* behavior (what a sheep does when the dog isn't pressuring it). One enum per sheep in the SoA (`activity: u8`). States and transitions:

- **GRAZE** (default calm): slow wander, frequent near-stops, head-down bias. Already exists — formalize it as a state.
- **REST** (lying down): after a sheep has been in GRAZE, undisturbed, low-panic, for a sustained random duration (seeded, e.g. 20–60 s), it may lie down. Resting sheep are near-stationary, render lower/flatter (see rendering doc), and are slower to react — a resting sheep takes an extra beat to rise and flee, which produces natural "laggard" drama. Rises immediately if panic crosses a low threshold or a close neighbor flees.
- **ALERT** (head up, watching): brief transitional state triggered by a nearby-but-not-close disturbance (a neighbor's mild panic, the dog entering awareness at range, a startle event §3). Head up, stops moving, faces the disturbance. Resolves back to GRAZE if nothing escalates, or into fleeing if panic crosses threshold. This is the visible "did you hear that?" beat.
- **FOLLOW** (trailing a mover): see §2 lead-sheep.

Transitions are per-sheep and probabilistic off the seeded PRNG so the flock never changes state in lockstep. **Stagger everything** — no synchronized state flips.

---

## 2. Emergent "little dramas" (the anti-flat content)

Each of these is a rule, not a script. They fire naturally from the sim and are the things the player will enjoy noticing.

### 2.1 The lone-sheep return
Already implied by local cohesion, but make it *readable*. When a sheep has zero neighbors within awareness (stranded), it enters a mild self-driven state: raises alertness slightly, and gains a weak bias toward the *last known* direction of the flock (store a low-frequency-updated "flock memory" vector per sheep, or steer toward the nearest sheep even beyond normal awareness at reduced strength). The result: a stray drifts, "notices" it's alone, and hurries back. Do **not** make this a hard tractor beam — the drift-then-hurry rhythm is the drama. Tunable: stray-awareness-bonus, return-bias-strength.

### 2.2 The startle wave
The single highest-value aliveness behavior. A startle event (§3) injects panic at a point; because panic already propagates with proximity falloff, a *visible ripple* crosses the flock — sheep flip GRAZE→ALERT→(maybe flee)→settle in an outward wave. This already half-works via propagation; to make it read as a *wave* rather than a blob-panic:
- Add a small propagation *delay* proportional to distance (a sheep receives a neighbor's panic contribution with a 1–3 frame lag scaled by distance), so the ripple has a visible travel speed instead of flashing instantly.
- Ensure the wave *decays* as it travels (already true via falloff) so it dies out partway through a large flock rather than always engulfing it — a ripple that crosses half the flock and fades is far more alive than all-or-nothing.
The wave reads through sheep *positions, motion, and state* (bunching, squash, alert postures, panic tint) — it does not depend on any special flock-surface rendering, so nothing here relies on the (cut) fleece-merge.
Tunable: propagation-delay-per-unit-distance, wave-decay.

### 2.3 Grazing clusters that form and dissolve
When calm, sheep shouldn't distribute evenly — real flocks clump into loose sub-groups that drift, merge, and split *on their own*, independent of the dog. Achieve with a weak, slow **local sub-cohesion** active only in GRAZE: grazing sheep feel a gentle pull toward nearby grazing neighbors, but with a low cap and a slow-wander overriding it, so clusters form, loiter, and dissolve over tens of seconds. This gives the idle flock its own shifting structure — the field is never static. Tunable: graze-cohesion-strength, graze-wander-strength.

### 2.4 The lead-sheep effect
When the flock is moving (being driven or spooked), it should sometimes string into a **followed line** rather than a uniform blob. Emergent recipe: pick nothing explicitly — instead, when a sheep is moving and has a clear neighbor ahead in its heading direction, boost alignment/cohesion toward that leader (FOLLOW state). Sheep naturally chain behind whichever sheep is in front, producing the classic single-file trail through gaps and gates. This *also* helps gate threading for free. The "leader" is emergent and shifts constantly. Tunable: follow-boost, follow-cone-angle.

### 2.5 Terrain pooling (own-agenda movement)
Give the field weak ambient attractors/repulsors so the *undisturbed* flock has somewhere it "wants" to be: sheep drift toward shade / low ground / a favored corner over time when not pressured. This means leaving the flock alone doesn't produce stasis — it slowly migrates and re-pools, so returning your attention to it reveals it has *done something*. Pooling targets are per-level data (polygons/points with weak attraction, active only at low panic). Tunable per attractor: strength, radius.

### 2.6 Worn paths (persistent trace)
Sheep (and the dog) passing over grass leave a faint, slowly-recovering trampled trail. Purely visual (see rendering doc for the effect) but it makes a session *accumulate* history in the field — after minutes of herding, the field shows where the work happened. Store a low-res "trample" field over the level, incremented by traffic, decaying slowly. This is cheap depth: the world remembers.

---

## 3. Startle sources (why waves happen)

The flock needs *ambient* disturbances so things happen even when the dog is idle — this is what breaks flat. Small, frequent, low-stakes:
- **Birds:** occasionally a bird flushes from the grass near the flock (seeded timing), injecting a small local panic pulse → a startle wave. Purely ambient, no gameplay stakes.
- **Wind gusts:** a stronger gust (tied to the weather system, rendering doc) can raise mild flock-wide alertness briefly.
- **Sudden dog moves:** already covered by the panic model (fast/surprise approach). No new work — just ensure ambient startles use the same panic injection path so waves look consistent regardless of source.
Keep ambient startles *mild* — they should produce a pretty ripple and settle, never a real scatter, or the cozy feel breaks. Tunable: startle-frequency, startle-magnitude (keep well below flight threshold at the source's falloff edge so only the nearest few sheep actually flee, if any).

---

## 4. Anti-uniformity (critical — uniformity reads as dead)

The flock looks alive only if sheep are *not* synchronized. Enforce throughout:
- Per-sheep random **phase offsets** on every periodic behavior (graze-wander noise, rest timing, alert duration, breathing/idle motion) from the seeded PRNG.
- Per-sheep small **trait variation**: slightly different max speed, skittishness (panic sensitivity), graze-wander amount, laziness (rest probability). A handful of floats per sheep. This alone makes the flock read as individuals-in-a-mass rather than clones — some sheep are jumpy, some placid, some wander more.
- **Never** transition states or apply forces in a way that syncs the flock. If you see the whole flock "breathe" or flip states together, that's a bug against this section.

---

## 5. Tuning priorities (do in this order)

1. **Startle wave** (§2.2) with propagation delay — the biggest single "it's alive!" moment.
2. **Anti-uniformity traits + phase offsets** (§4) — without this everything else looks synthetic.
3. **Grazing clusters** (§2.3) — gives the idle flock shifting structure.
4. **Rest state + lone-sheep return** (§1, §2.1) — the readable individual dramas.
5. **Terrain pooling** (§2.5) — own-agenda migration, the "reason to glance back."
6. Lead-sheep (§2.4) and worn paths (§2.6) last — nice, not essential.

## Definition of done
Leave the dog completely still for 60 seconds and the flock should still be *interesting to watch*: clusters shifting, a stray returning, an occasional bird-startle ripple crossing and fading, sheep lying down and rising, the mass slowly pooling toward shade. If the idle flock looks static or synchronized, this phase isn't done.
