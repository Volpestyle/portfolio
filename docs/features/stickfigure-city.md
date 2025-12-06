# Stick Figure City

Design blueprint only — this feature is not yet implemented in the codebase. Use it as a reference if we decide to build it later.

Love this idea. You can totally make Stick‑Figure City feel alive while also showing off recognition + procedural animation. Below is an end‑to‑end blueprint that covers: (1) how to accept only stick figures, (2) how to turn each sketch into an animatable rig, (3) how to make them walk, idle, jump, and interact, and (4) how to filter out "too bland" submissions.

---

## System at a Glance

### Client (browser)

- Canvas/SVG drawing ➜ stroke capture & simplification
- In‑browser validation & rig extraction (fast; no server round‑trip)
- Local preview of animation states (idle, walk, jump)
- On accept ➜ publish to realtime channel

### Server (or serverless)

- Persistence (tiny JSON per figure)
- Optional second‑pass moderation (NSFW filter, rate limiting)
- Realtime broadcast (WebSocket/Firestore/Supabase Realtime)

### Renderer

- 2D scene with faux‑depth (layer/sort by y)
- Crowd simulation (wander/avoidance)
- Interaction triggers (hi‑five, chat bubbles, "look at nearby")

---

## 1. "Only stick figures" — Recognition & Validation

You don't need a heavy ML model; a hybrid heuristic + tiny classifier works great and runs entirely in the browser.

### Input Normalization

1. Capture strokes as polylines
2. Resample to uniform spacing (e.g., 2–4 px)
3. Douglas–Peucker simplify (tolerance ~1.5–2 px)
4. Normalize: translate to centroid, scale to unit height

### Structural Graph

- Build a graph from strokes: vertices at endpoints & intersections; edges as stroke segments
- Compute vertex degrees (endpoints have degree 1; joints typically degree 3)

### Heuristics that Catch 90% of Cases

- **Head**: exactly one closed path with high circularity above the centroid

```typescript
const circularity = (4 * Math.PI * area) / (perimeter * perimeter); // > 0.7 ≈ circle-ish
```

- **Torso**: a near‑vertical path starting below the head's lowest point; the longest open path by geodesic length
- **Limbs**: 2 branches near upper torso (shoulders) and 2 near lower torso (hips). Degree around torso node should be 3–5
- **No fills**: total filled area (excluding head) below a small threshold (prevents non‑stick filled bodies)
- **Counts**: strokes ≤ 12, joints ≤ 14, single connected component

### Lightweight Classifier (Optional but Helpful)

A 32×32 grayscale raster of the drawing into a TF.js micro‑CNN (or QuickDraw‑style) with labels `{stick_figure, other}`. Accept if:

- `p(stick_figure) ≥ 0.85` and structural heuristics pass

This combo is tiny (~100–300 KB) and very fast.

### Fail Feedback

When you reject, show actionable hints:

- "I found a circle but no torso line below it."
- "Arms should branch from the upper body; try connecting them to the torso."

---

## 2. From Drawing ➜ Rig (So You Can Animate Everyone's Unique Figure)

**Goal**: infer a 10–12 joint skeleton and bind the user's lines to that skeleton so animation just moves joints.

### Joint Layout (12 is a Sweet Spot)

```
head, neck, spine, hip_center, l_shoulder, r_shoulder, l_elbow, r_elbow,
l_hip, r_hip, l_knee, r_knee, l_ankle, r_ankle
```

### Fitting the Skeleton

- **Head**: center = head path centroid; radius = equivalent circle
- **Torso axis**: principal component of torso stroke (PCA) defines up/down
- **Joint candidates**: find branch points along torso axis (shoulders near top third; hips near bottom third) by nearest stroke vertices to those bands
- **Arms/legs**: greedily extend from shoulder/hip to nearest long outward stroke; elbows/knees = points of maximum curvature along those strokes

### Skinning the User's Lines to Bones

For each limb polyline, compute local coordinates relative to its bone at capture time:

- Project each vertex onto the bone to get a normalized `t ∈ [0,1]` (along‑bone), plus perpendicular offset `d`
- During animation frame:
  - Get the current bone segment in world space
  - Place each vertex at `bonePoint(t) + d * normal(t)` (with normal from bone direction)
  - This preserves their exact wonky line style while the bone moves—no raster sprites needed, super crisp at any scale

---

## 3. Procedural Animation: Walk, Idle, Jump

Use a tiny state machine per figure:

```typescript
type State = 'idle' | 'walk' | 'jump' | 'emote';
```

### Gait (Walk)

- Phase variable `φ = (time * speed * 2π) % 2π`
- Hips oscillate horizontally and vertically:

```typescript
hip.x += A_x * sin(φ)
hip.y += A_y * sin(2φ + π/2)
```

- **Legs**: opposite phase
  - Left thigh angle `θ_L = θ0 + α * sin(φ)`
  - Right thigh angle `θ_R = θ0 + α * sin(φ + π)`
  - Knees use a simple IK to keep foot on ground during stance phase; during swing, give foot an arc: `y += h * sin(swingPhase)`
- **Arms**: counter‑swing to legs (smaller amplitude)

### Idle

- Subtle breathing: shoulders/hip up/down (±2–4 px)
- Head micro‑look: slow noise on head yaw/tilt
- Occasional weight shift: hips x drift, one foot taps

### Jump

- Set vertical velocity; apply gravity; while airborne, tuck legs (knees flex), raise arms
- On landing, brief squash (scale Y 0.9) + bounce

### Interaction Triggers (Fun + Simple)

- **Hi‑five**: when two figures' right hands come within 12 px and both are in walk → play a hi‑five pose & "👏" bubble
- **Chat bubble**: when dwell < 30 px for > 1.5 s → each emits a short line (see bubbles below)
- **Follow**: 1 in 20 spawns as an "extrovert" that briefly follows another

---

## 4. City Simulation & Depth

- **World**: simple navmesh with sidewalks & plazas; random waypoints per agent
- **Avoidance**: Reciprocal velocity obstacles (RVO) or a cheap steering blend (seek + separate)
- **Depth**: sort draw order by y (lower on screen = "closer"); add a short ground shadow (ellipse length ∝ height)
- **Density cap**: keep ~120 on screen; older ones roam offscreen but remain persisted

---

## 5. Speech Bubbles (Tiny but Charming)

Generate short, whimsical lines from:

- **Local facts**: username initials, creation time ("New in town"), features ("Nice hat"), crowd state ("Busy day!")
- **Interaction context**: "Hi‑five!", "Excuse me", "Cute shoes" (when ankle accessories present), "Same height!" (when bone lengths similar)
- Limit to 40–60 chars; fade after 3–4 s

---

## 6. Don't Publish "Too Bland" — An "Interestingness" Score

Score a figure before publish; if under threshold, prompt for a tweak with a friendly hint.

### Features (0–1 Normalized)

- `A_accessory`: closed shapes not part of skeleton (hat, bag, hair tuft count up to 3)
- `A_pose`: asymmetry at submit time (arms/legs not perfectly mirrored)
- `A_stylization`: stroke jitter/variance (stddev of perpendicular offsets along bones)
- `A_head`: head ratio/style (non‑perfect circle, eyes/mouth marks)
- `A_color`: if you allow a small palette, non‑default color bonus

### Score Formula

```
S = 0.35*A_accessory + 0.25*A_pose + 0.2*A_stylization + 0.15*A_head + 0.05*A_color
Publish if S ≥ 0.45
```

If low: "Add a tiny accessory (hat? hair? backpack?) or bend one arm/leg for a pose."

---

## 7. Data Model (Tiny + Future‑Proof)

```json
{
  "id": "uuid",
  "created_at": "ISO",
  "user_hash": "sha256(ip+ua+salt)",
  "style": {
    "strokeWidth": 2,
    "color": "#222",
    "head": { "center": [x, y], "radius": r, "extras": [...] }
  },
  "skeleton": {
    "joints": {
      "head": [x, y], "neck": [x, y], "spine": [x, y], "hip": [x, y],
      "l_shoulder": [x, y], "r_shoulder": [x, y], "l_elbow": [x, y], "r_elbow": [x, y],
      "l_hip": [x, y], "r_hip": [x, y], "l_knee": [x, y], "r_knee": [x, y],
      "l_ankle": [x, y], "r_ankle": [x, y]
    },
    "boneLengths": { /* normalized to height */ }
  },
  "bindings": {
    "arm_L": [ { "t": 0.00, "d": -2.1 }, ... ],
    "arm_R": [ ... ],
    "leg_L": [ ... ],
    "leg_R": [ ... ],
    "torso": [ ... ]
  },
  "interestingness": 0.58,
  "checksum": "sha1(of raw strokes)" // dedupe/spam control
}
```

Store bindings instead of raw bitmaps so you can re‑animate perfectly at any resolution.

---

## 8. Realtime & Persistence

- Insert on accept; broadcast `{id, skeleton, bindings, style}` to a `figures:new` channel
- Clients subscribe and spawn agents with a randomized gait speed (0.7–1.3×) and handedness
- Aging policy: keep last N=2,000 active; archive older to cold storage (still queryable by "view all")

---

## 9. Performance Notes

- Render with Canvas 2D; each figure is ~5–7 polylines; 60 FPS is fine up to ~150 agents on modern laptops
- Batch operations: compute skeleton transforms, then draw in y‑sorted order
- Use `requestAnimationFrame` + a fixed 60 Hz simulation step; interpolate for smoothness
- Avoid GC churn: reuse typed arrays for vertices/bindings

---

## 10. Security & Moderation

- Client‑side checks + server rate limits (1 submit / 30s / user_hash)
- Drop submissions with absurd point counts or giant bounding boxes
- Optional: server‑side NSFW image/text filter on rasterized 64×64 preview

---

## 11. MVP File Map (React + Canvas Example)

```
/src
  /drawing
    CanvasPad.tsx      // capture strokes, preview, accept
    recognizer.ts      // heuristics + micro-CNN hook
    rigging.ts         // skeleton fit + bindings
  /city
    Agent.ts           // state machine + IK
    Crowd.ts           // steering + collisions
    Renderer.ts        // y-sort + draw routines
  /net
    realtime.ts        // subscribe/publish
    api.ts             // save/load submissions
  /ui
    SpeechBubble.tsx
    Toast.tsx
```

---

## 12. Handy Snippets

### Shoulder/Hip Banding (Find Joint Anchors)

```typescript
function jointNearBand(points: Vec2[], torsoAxis: Line, tBand: [number, number]) {
  // project torso endpoints to get axis param t ∈ [0,1]
  const { p0, p1 } = torsoAxis;
  const v = sub(p1, p0);
  let best = null,
    bestDist = 1e9;

  for (const pt of points) {
    const t = clamp(dot(sub(pt, p0), v) / dot(v, v), 0, 1);
    if (t < tBand[0] || t > tBand[1]) continue;
    const dist = distanceToSegment(pt, p0, p1);
    if (dist < bestDist) {
      bestDist = dist;
      best = { pt, t };
    }
  }

  return best?.pt ?? midpoint(p0, p1);
}
```

### Leg Swing Angles (Walk)

```typescript
function walkAngles(t: number, speed: number) {
  const φ = t * speed * Math.PI * 2;
  const thigh = (a: number) => -0.1 + 0.45 * Math.sin(φ + a); // radians
  const shin = (a: number) => 0.7 * Math.max(0, Math.sin(φ + a + Math.PI / 8));

  return {
    L: { thigh: thigh(0), shin: shin(0) },
    R: { thigh: thigh(Math.PI), shin: shin(Math.PI) },
  };
}
```

---

## 13. Small Delights that Make It Memorable

- **Click to emote**: click a figure to trigger a jump or wave + "Hello!" bubble
- **Seasonal sets**: scarfs in winter, sunglasses in summer (auto‑accessory overlay)
- **Collective moments**: every hour on the :00, nearby figures face the center and do a 2‑second wave
- **Visitor credit**: hover shows "Drawn by AB • 2m ago" (no PII)

---

## TL;DR Build Order

1. Drawing → validation (head/torso/limbs + micro‑classifier)
2. Rigging + bindings (map polylines to bones)
3. Idle + walk with depth‑sorted rendering
4. Realtime publish/subscribe
5. Interactions & bubbles
6. Interestingness gate to nudge creativity

If you want, I can turn this into a minimal starter (React + Canvas + TF.js stub + rigging/animation utilities) you can drop into your portfolio and start customizing.
