# Phase 3: Continuous Camera System

## 1. Design Overview

The camera system is **continuous**: it adapts smoothly to any board
dimensions, layer configuration, and viewport aspect ratio without relying
on discrete layer indices, hard‑coded positions, or fixed FOV values.

All camera parameters are computed from four inputs:

| Input            | Symbol          | Source                          |
|------------------|-----------------|---------------------------------|
| Board side length| `boardSize`     | Level / game configuration      |
| Layer count      | `layers`        | Level / game configuration      |
| Layer spacing    | `layerSpacing`  | User‑adjustable slider          |
| Viewport aspect  | `aspectRatio`   | `viewportWidth / viewportHeight` |

---

## 2. Coordinate System & Board Geometry

### 2.1 Board Bounding Dimensions

The board occupies world space from `(0, 0, 0)` to
`(boardSize - 1, boardSize - 1, (layers - 1) * layerSpacing)`:

```
boardSpanX = boardSize - 1
boardSpanY = boardSize - 1
boardSpanZ = (layers - 1) * layerSpacing
```

### 2.2 Board Center (Camera Look‑At Target)

The camera always targets the geometric center of the bounding box:

```
center.x = (boardSize - 1) / 2
center.y = (layers - 1) * layerSpacing / 2
center.z = (boardSize - 1) / 2
```

### 2.3 Bounding Diagonal

The longest diagonal through the board's bounding box provides the reference
for distance and visual normalization:

```
FUNCTION computeDiagonal(boardSize, layers, layerSpacing):
    w := boardSize - 1
    h := (layers - 1) * layerSpacing
    RETURN sqrt(w*w + w*w + h*h)
```

For the default 13x13x6 board with spacing 3.5:

```
w = 12, h = 5 * 3.5 = 17.5
diagonal = sqrt(144 + 144 + 306.25) = sqrt(594.25) ~ 24.38
```

---

## 3. Aspect‑Ratio‑Driven FOV & Pitch

### 3.1 Normalized Aspect Ratio

The board's "tallness" drives both FOV and pitch:

```
FUNCTION normalizedAspect(boardSize, layers, layerSpacing):
    w := boardSize - 1
    h := (layers - 1) * layerSpacing
    rawAspect := h / max(w, 1)
    RETURN clamp(rawAspect * ASPECT_SENSITIVITY, 0, 1)

CONST ASPECT_SENSITIVITY = 2.5
```

- A flat board (1 layer): `h = 0`, `normalizedAspect = 0`
- A tall board (13x13x6, spacing 3.5): `h = 17.5`, `rawAspect = 1.46`,
  `normalizedAspect = clamp(3.65, 0, 1) = 1`

### 3.2 Dynamic FOV

Higher FOV for tall boards (to fit the vertical extent); lower FOV for
flat boards (to reduce perspective distortion on a single plane):

```
FUNCTION computeFOV(normalizedAspect):
    fov := lerp(MIN_FOV, MAX_FOV, normalizedAspect)
    RETURN fov

CONST MIN_FOV = 30    // degrees — flat/single‑layer boards
CONST MAX_FOV = 60    // degrees — tall/multi‑layer boards
```

**Lerp helper:**

```
FUNCTION lerp(a, b, t):
    RETURN a + (b - a) * t
```

**FOV to radians:**

```
FUNCTION toRadians(degrees):
    RETURN degrees * PI / 180
```

### 3.3 Dynamic Pitch (Elevation Angle)

Pitch is the angle above the horizontal (XZ) plane. A higher pitch gives a
more top‑down view; a lower pitch shows more of the vertical layers:

```
FUNCTION computePitch(normalizedAspect):
    pitch := lerp(MIN_PITCH, MAX_PITCH, 1 - normalizedAspect)
    RETURN pitch

CONST MIN_PITCH = 35    // degrees — for tall boards (see the layers)
CONST MAX_PITCH = 85    // degrees — for flat boards (near top‑down)
```

When `normalizedAspect = 0` (flat board): `pitch = 85` (nearly overhead).
When `normalizedAspect = 1` (tall board): `pitch = 35` (angled to reveal layers).

---

## 4. Distance Calculation

### 4.1 Visual Normalization

When transitioning between board sizes, the apparent visual size is clamped
to prevent jarring jumps. A base board (13x13x6) defines the reference diagonal:

```
CONST BASE_BOARD_SIZE   = 13
CONST BASE_LAYERS       = 6
CONST BASE_SPACING      = 3.5
CONST MIN_VISUAL_SCALE  = 0.8
CONST MAX_VISUAL_SCALE  = 1.2

baseDiagonal := computeDiagonal(BASE_BOARD_SIZE, BASE_LAYERS, BASE_SPACING)
```

For any board, compute the clamping:

```
FUNCTION computeTargetDiagonal(boardSize, layers, layerSpacing):
    current := computeDiagonal(boardSize, layers, layerSpacing)
    minDiag := baseDiagonal * MIN_VISUAL_SCALE
    maxDiag := baseDiagonal * MAX_VISUAL_SCALE
    RETURN clamp(current, minDiag, maxDiag)

FUNCTION clamp(value, lo, hi):
    IF value < lo THEN RETURN lo
    IF value > hi THEN RETURN hi
    RETURN value
```

### 4.2 Optimal Distance

Given the target diagonal and FOV, compute the distance that makes the board
fill the viewport comfortably:

```
FUNCTION computeDistance(targetDiagonal, fovVertical, aspectRatio):
    // Convert vertical FOV to horizontal FOV
    fovH := 2 * atan(tan(toRadians(fovVertical) / 2) * aspectRatio)

    // Distance to fit the diagonal within the view
    // Use the smaller of vertical/horizontal FOV as the limiting factor
    fovLimit := min(toRadians(fovVertical), fovH)

    distance := (targetDiagonal / 2) / sin(fovLimit / 2)

    // Add safety margin: 30% extra space around the board
    distance := distance * SAFETY_MARGIN

    RETURN distance

CONST SAFETY_MARGIN = 1.3
```

**Rationale:** `(targetDiagonal / 2) / sin(fov/2)` is the distance at which
a sphere of diameter `targetDiagonal` exactly touches the viewport edges.
Multiplying by 1.3 gives a comfortable margin.

### 4.3 Full Distance Pipeline

```
FUNCTION computeCameraDistance(boardSize, layers, layerSpacing,
                                fovVertical, aspectRatio):
    targetDiag := computeTargetDiagonal(boardSize, layers, layerSpacing)
    RETURN computeDistance(targetDiag, fovVertical, aspectRatio)
```

---

## 5. Camera Position (Spherical Coordinates)

### 5.1 Orbit Model

The camera orbits around the board center using spherical coordinates
`(distance, pitch, yaw)`:

- **distance**: radial distance from center (from section 4)
- **pitch**: elevation angle above the XZ plane (from section 3.3)
- **yaw**: rotation around the Y (up) axis; default = 45 deg for diagonal view

### 5.2 Position Computation

```
FUNCTION computeCameraPosition(center, distance, pitch, yaw):
    pitchRad := toRadians(pitch)
    yawRad   := toRadians(yaw)

    position.x := center.x + distance * cos(pitchRad) * cos(yawRad)
    position.y := center.y + distance * sin(pitchRad)
    position.z := center.z + distance * cos(pitchRad) * sin(yawRad)

    RETURN position
```

### 5.3 Coordinate Frame

```
       Y (up)
       |
       |   camera
       |  /
       | /   pitch
       |/_____
      /       \___ XZ plane
     /  yaw
    Z
```

The camera always "looks at" the board center and uses world-up `(0, 1, 0)`:

```
FUNCTION applyCameraView(cameraPosition, center):
    camera.lookAt(center)
    camera.up = (0, 1, 0)
```

---

## 6. Zoom & Rotation (Continuous User Interaction)

### 6.1 Zoom

Zoom modifies the effective distance from the center. The camera moves
along the radial direction toward/away from the look‑at target:

```
FUNCTION applyZoom(currentPosition, center, delta):
    // delta > 0 zooms in; delta < 0 zooms out
    dir := currentPosition - center
    currentDist := length(dir)

    // Normalize and scale by delta and current distance
    // (provides proportional feel: faster zoom when farther away)
    IF currentDist < EPSILON THEN RETURN

    dirNormalized := dir / currentDist
    step := delta * ZOOM_SPEED * currentDist

    newDist := currentDist - step
    newDist := clamp(newDist, MIN_DISTANCE, MAX_DISTANCE)

    newPosition := center + dirNormalized * newDist
    RETURN newPosition

CONST ZOOM_SPEED    = 0.15
CONST MIN_DISTANCE  = computeMinDistance(...)   // board-dependent
CONST MAX_DISTANCE  = computeMaxDistance(...)   // board-dependent
```

**Distance limits** are computed from the board diagonal:

```
FUNCTION computeMinDistance(targetDiagonal, fovVertical, aspectRatio):
    baseDist := computeDistance(targetDiagonal, fovVertical, aspectRatio)
    RETURN baseDist * 0.3

FUNCTION computeMaxDistance(targetDiagonal, fovVertical, aspectRatio):
    baseDist := computeDistance(targetDiagonal, fovVertical, aspectRatio)
    RETURN baseDist * 3.0
```

### 6.2 Rotation (Orbit)

Rotation changes the camera's yaw angle, orbiting around the Y axis
through the board center:

```
FUNCTION applyRotation(currentPosition, center, deltaYaw):
    // deltaYaw in degrees; positive = orbit right
    dir := currentPosition - center

    // Project to XZ plane
    radiusXZ := sqrt(dir.x^2 + dir.z^2)

    currentYaw := atan2(dir.z, dir.x)
    newYaw := currentYaw + toRadians(deltaYaw)

    newPosition.x := center.x + radiusXZ * cos(newYaw)
    newPosition.z := center.z + radiusXZ * sin(newYaw)
    newPosition.y := currentPosition.y   // pitch unchanged

    RETURN newPosition
```

### 6.3 Zoom‑to‑Cursor (Anchor‑Based)

For intuitive zoom, the camera moves toward/away from an anchor point
(typically the point under the cursor on the board surface):

```
FUNCTION zoomToAnchor(currentPosition, anchorPoint, delta):
    dir := anchorPoint - currentPosition
    currentDist := length(dir)
    IF currentDist < EPSILON THEN RETURN currentPosition

    dirNormalized := dir / currentDist
    step := delta * ZOOM_SPEED * currentDist

    newDist := currentDist - step
    newDist := clamp(newDist, MIN_DISTANCE, MAX_DISTANCE)

    ratio := (currentDist - newDist) / currentDist
    newPosition := currentPosition + dir * ratio

    RETURN newPosition
```

---

## 7. Near & Far Clip Planes

Clip planes are computed from the current distance to ensure the scene is
always visible without z‑fighting:

```
FUNCTION computeClipPlanes(distance):
    nearPlane := max(0.1, distance * 0.01)
    farPlane  := distance * 10.0
    RETURN (nearPlane, farPlane)
```

**Edge cases:**
- For extreme close‑ups: `nearPlane` is never below 0.1
- For extreme long shots: `farPlane` scales to 10x the distance

---

## 8. Performance Optimization

### 8.1 Caching Strategy

Camera parameters only need recomputation when their inputs change.
Cache the computed values and a hash of the input state:

```
STRUCT CameraCache:
    boardSize     : Integer
    layers        : Integer
    layerSpacing  : Real
    aspectRatio   : Real
    yaw           : Real

    // Cached outputs
    distance      : Real
    fov           : Real
    pitch         : Real
    position      : (Real, Real, Real)
    targetDiag    : Real
    nearPlane     : Real
    farPlane      : Real

FUNCTION needsRecompute(cache, boardSize, layers, layerSpacing,
                         aspectRatio, yaw):
    RETURN cache.boardSize    != boardSize
        OR cache.layers       != layers
        OR abs(cache.layerSpacing - layerSpacing) > EPSILON
        OR abs(cache.aspectRatio  - aspectRatio)  > EPSILON
        OR abs(cache.yaw          - yaw)          > EPSILON
```

**When to recompute:**
- `boardSize`, `layers` change → full recompute (rare: on level load)
- `layerSpacing` changes → recompute distance, pitch, FOV, center
- `aspectRatio` changes → recompute distance, FOV, clips (on resize)
- `yaw` changes → recompute position only (every rotation frame)

Incremental recomputation avoids redundant work:

```
FUNCTION updateCamera(cache, changes):
    IF changes.dimensions THEN
        cache.center       := computeCenter(...)
        cache.targetDiag   := computeTargetDiagonal(...)
    IF changes.dimensions OR changes.spacing OR changes.aspect THEN
        cache.normalizedAspect := computeNormalizedAspect(...)
        cache.fov      := computeFOV(cache.normalizedAspect)
        cache.pitch    := computePitch(cache.normalizedAspect)
        cache.distance := computeCameraDistance(..., cache.fov, ...)
        (cache.nearPlane, cache.farPlane) := computeClipPlanes(cache.distance)
    IF changes.dimensions OR changes.spacing OR changes.aspect OR changes.yaw THEN
        cache.position := computeCameraPosition(cache.center,
            cache.distance, cache.pitch, cache.yaw)
```

### 8.2 Instanced Rendering

Pieces are rendered using **instanced draw calls** to minimize CPU‑GPU
communication:

- **One geometry** per piece type (black stone, white stone, ghost stone)
- **One material** per opacity level
- **Instance count** = number of visible pieces
- **Per‑instance data** (packed into a buffer): `(x, y, z, scale, colorModifier)`

```
FUNCTION renderPieces(board, piecesGroup):
    // Group pieces by (color, opacity)
    opaqueBlack  := []
    opaqueWhite  := []
    ghostBlack   := []
    ghostWhite   := []

    FOR EACH cell (x, y, z) IN board:
        state := Get(board, x, y, z)
        IF state = CELL_EMPTY THEN CONTINUE

        opacity := computeOpacity(z)   // full for nearby, reduced for distant

        IF state = CELL_BLACK THEN
            IF opacity = 1.0 THEN opaqueBlack.ADD((x, y, z))
            ELSE ghostBlack.ADD((x, y, z))
        ELSE
            IF opacity = 1.0 THEN opaqueWhite.ADD((x, y, z))
            ELSE ghostWhite.ADD((x, y, z))

    // 4 draw calls at most (for 2 colors x 2 opacity levels)
    drawInstanced(opaqueBlack,  pieceGeo, blackOpaqueMat)
    drawInstanced(opaqueWhite,  pieceGeo, whiteOpaqueMat)
    drawInstanced(ghostBlack,   pieceGeo, blackGhostMat)
    drawInstanced(ghostWhite,   pieceGeo, whiteGhostMat)
```

**Opacity function** — continuous, not discrete:

```
FUNCTION computeOpacity(zPosition):
    // Opacity falls off with distance from the camera's look-at center
    // Smooth falloff: closest layers to the look-at center are fully opaque
    deltaY := abs(zPosition - center.y)
    maxDelta := (layers - 1) * layerSpacing / 2

    IF maxDelta < EPSILON THEN RETURN 1.0

    normalized := deltaY / maxDelta

    // Full opacity at center; smoothly reduces toward edges
    RETURN lerp(GHOST_OPACITY_MIN, 1.0, 1 - normalized)

CONST GHOST_OPACITY_MIN = 0.25
```

### 8.3 Grid & Connector Line Batching

Grid lines and inter‑layer connectors are built as a single merged geometry
per layer set, avoiding per‑line draw calls:

```
FUNCTION buildMergedGridGeometry(boardSize, layers, layerSpacing):
    positions := []

    FOR layer := 0 TO layers - 1:
        zPos := layer * layerSpacing

        // X‑direction lines (one per row)
        FOR y := 0 TO boardSize - 1:
            positions.ADD(0, y, zPos)
            positions.ADD(boardSize - 1, y, zPos)

        // Y‑direction lines (one per column)
        FOR x := 0 TO boardSize - 1:
            positions.ADD(x, 0, zPos)
            positions.ADD(x, boardSize - 1, zPos)

    // Single draw call: all grid lines
    RETURN buildLineGeometry(positions)
```

---

## 9. Summary: Parameter Computation Pipeline

```
INPUT: boardSize, layers, layerSpacing, aspectRatio, yaw

STEP 1 — Board Geometry:
    spanX   := boardSize - 1
    spanZ   := (layers - 1) * layerSpacing
    center  := (spanX/2, spanZ/2, spanX/2)
    diag    := sqrt(spanX^2 + spanX^2 + spanZ^2)

STEP 2 — Normalized Aspect:
    normAsp := clamp((spanZ / max(spanX, 1)) * 2.5, 0, 1)

STEP 3 — FOV & Pitch:
    fov   := lerp(30, 60, normAsp)
    pitch := lerp(35, 85, 1 - normAsp)

STEP 4 — Target Diagonal (visual normalization):
    targetDiag := clamp(diag, baseDiag * 0.8, baseDiag * 1.2)

STEP 5 — Distance:
    dist := (targetDiag / 2) / sin(min(fovRad, fovHRad) / 2) * 1.3

STEP 6 — Camera Position:
    pos.x := center.x + dist * cos(pitchRad) * cos(yawRad)
    pos.y := center.y + dist * sin(pitchRad)
    pos.z := center.z + dist * cos(pitchRad) * sin(yawRad)

STEP 7 — Clipping:
    near := max(0.1, dist * 0.01)
    far  := dist * 10.0

STEP 8 — Apply:
    camera.position := pos
    camera.lookAt(center)
    camera.up       := (0, 1, 0)
    camera.fov      := fov
    camera.near     := near
    camera.far      := far
    camera.aspect   := aspectRatio
```

---

## Appendix A: Constant Reference

| Constant              | Value | Purpose                                        |
|-----------------------|-------|------------------------------------------------|
| MIN_FOV               | 30    | Minimum field of view (degrees) — flat boards   |
| MAX_FOV               | 60    | Maximum field of view (degrees) — tall boards   |
| MIN_PITCH             | 35    | Minimum pitch angle (degrees) — tall boards     |
| MAX_PITCH             | 85    | Maximum pitch angle (degrees) — flat boards     |
| ASPECT_SENSITIVITY    | 2.5   | How strongly board aspect affects FOV/pitch     |
| SAFETY_MARGIN         | 1.3   | Extra distance multiplier around the board      |
| ZOOM_SPEED            | 0.15  | Relative speed of zoom per scroll step          |
| GHOST_OPACITY_MIN     | 0.25  | Lowest opacity for pieces farthest from center  |
| MIN_VISUAL_SCALE      | 0.8   | Lower bound for target diagonal clamping        |
| MAX_VISUAL_SCALE      | 1.2   | Upper bound for target diagonal clamping        |
| BASE_BOARD_SIZE       | 13    | Reference board for visual normalization        |
| BASE_LAYERS           | 6     | Reference layers for visual normalization       |
| BASE_SPACING          | 3.5   | Reference spacing for visual normalization      |

---

## Appendix B: Function Index

| Function                        | Section | Description                                          |
|---------------------------------|---------|------------------------------------------------------|
| `computeDiagonal`               | 2.3     | Bounding box diagonal for a board configuration      |
| `normalizedAspect`             | 3.1     | Tallness factor (0=flat, 1=tall)                     |
| `computeFOV`                   | 3.2     | Dynamic field of view from normalized aspect         |
| `computePitch`                 | 3.3     | Dynamic elevation angle from normalized aspect       |
| `computeTargetDiagonal`        | 4.1     | Clamped diagonal for visual size normalization       |
| `computeDistance`              | 4.2     | Optimal camera distance from diagonal and FOV        |
| `computeCameraPosition`        | 5.2     | Spherical‑to‑Cartesian conversion                    |
| `applyZoom`                    | 6.1     | Continuous zoom along radial direction               |
| `applyRotation`                | 6.2     | Continuous orbit around Y axis                       |
| `zoomToAnchor`                 | 6.3     | Anchor‑based zoom for cursor‑centered feel           |
| `computeClipPlanes`            | 7       | Near/far planes scaled to current distance           |
| `needsRecompute`               | 8.1     | Cache invalidation check                             |
| `computeOpacity`               | 8.2     | Continuous piece opacity from Z position             |

