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

## 2. Logical‑to‑World Coordinate Mapping (Critical)

### 2.1 Coordinate Systems

The game logic uses a different coordinate convention than the rendering
world space. This mapping MUST be applied before any camera calculation.

| Phase 1 Logical Axis | Meaning      | World Axis | Meaning     |
|----------------------|--------------|------------|-------------|
| `x`                  | column       | `X`        | column      |
| `y`                  | row          | `Z`        | forward     |
| `z`                  | layer        | `Y`        | up (height) |

**Visual comparison:**

```
 LOGICAL (game logic)         WORLD (rendering)
      z (layer)                    Y (up)
      |                            |
      |   (x,y,z)                  |   (X,Y,Z)
      |  /                         |  /
      | /                          | /
      |/                           |/
      +-------> y (row)            +-------> Z (forward)
     /                            /
    /                            /
   v                            v
  x (column)                   X (column)
```

### 2.2 LogicalToWorld Function

```
FUNCTION LogicalToWorld(logicalX, logicalY, logicalZ):
    // logicalX = column  -> worldX = column (unchanged)
    // logicalY = row     -> worldZ = forward
    // logicalZ = layer   -> worldY = up (height)
    worldX := logicalX
    worldY := logicalZ * layerSpacing
    worldZ := logicalY
    RETURN (worldX, worldY, worldZ)
```

**Inverse:**

```
FUNCTION WorldToLogical(worldX, worldY, worldZ):
    logicalX := worldX
    logicalY := worldZ
    logicalZ := round(worldY / layerSpacing)
    RETURN (logicalX, logicalY, logicalZ)
```

### 2.3 Board Bounding Dimensions (in World Space)

The board occupies world space from `(0, 0, 0)` to
`(boardSize - 1, (layers - 1) * layerSpacing, boardSize - 1)`:

```
boardSpan_X = boardSize - 1                   // columns (logical x)
boardSpan_Y = (layers - 1) * layerSpacing     // height  (logical z * spacing)
boardSpan_Z = boardSize - 1                   // depth   (logical y)
```

### 2.4 Board Center (Camera Look‑At Target)

The camera always targets the geometric center of the bounding box
in **world space**:

```
center_X = (boardSize - 1) / 2
center_Y = (layers - 1) * layerSpacing / 2
center_Z = (boardSize - 1) / 2
```

### 2.5 Bounding Diagonal

The longest diagonal through the world‑space bounding box:

```
FUNCTION computeDiagonal(boardSize, layers, layerSpacing):
    w := boardSize - 1
    h := (layers - 1) * layerSpacing
    RETURN sqrt(w*w + w*w + h*h)   // X^2 + Z^2 + Y^2
```

For the default 13x13x6 board with spacing 3.5:

```
w = 12, h = 5 * 3.5 = 17.5
diagonal = sqrt(144 + 144 + 306.25) = sqrt(594.25) ~ 24.38
```

### 2.6 Converting Piece Positions for Rendering

Every piece stored at logical `(x, y, z)` in the board array must be
placed at world position via `LogicalToWorld`:

```
FUNCTION placePieceMesh(pieceMesh, logicalX, logicalY, logicalZ, layerSpacing):
    (wx, wy, wz) := LogicalToWorld(logicalX, logicalY, logicalZ)
    pieceMesh.position := (wx, wy, wz)
```

Similarly, grid lines, connector lines, and all auxiliary geometry follow
the same mapping.

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

    // World-space spherical to Cartesian (Y is up)
    position_X := center_X + distance * cos(pitchRad) * cos(yawRad)
    position_Y := center_Y + distance * sin(pitchRad)
    position_Z := center_Z + distance * cos(pitchRad) * sin(yawRad)

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
    dir_X := currentPosition.x - center_X
    dir_Y := currentPosition.y - center_Y
    dir_Z := currentPosition.z - center_Z
    currentDist := sqrt(dir_X*dir_X + dir_Y*dir_Y + dir_Z*dir_Z)

    // Normalize and scale by delta and current distance
    // (provides proportional feel: faster zoom when farther away)
    IF currentDist < EPSILON THEN RETURN

    dirNormalized_X := dir_X / currentDist
    dirNormalized_Y := dir_Y / currentDist
    dirNormalized_Z := dir_Z / currentDist
    step := delta * ZOOM_SPEED * currentDist

    newDist := currentDist - step
    newDist := clamp(newDist, MIN_DISTANCE, MAX_DISTANCE)

    newPosition.x := center_X + dirNormalized_X * newDist
    newPosition.y := center_Y + dirNormalized_Y * newDist
    newPosition.z := center_Z + dirNormalized_Z * newDist
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
    dir_X := currentPosition.x - center_X
    dir_Z := currentPosition.z - center_Z

    // Project to XZ plane (horizontal orbit around Y axis)
    radiusXZ := sqrt(dir_X*dir_X + dir_Z*dir_Z)

    currentYaw := atan2(dir_Z, dir_X)
    newYaw := currentYaw + toRadians(deltaYaw)

    newPosition.x := center_X + radiusXZ * cos(newYaw)
    newPosition.z := center_Z + radiusXZ * sin(newYaw)
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

    dirNormalized_X := dir_X / currentDist
    dirNormalized_Y := dir_Y / currentDist
    dirNormalized_Z := dir_Z / currentDist
    step := delta * ZOOM_SPEED * currentDist

    newDist := currentDist - step
    newDist := clamp(newDist, MIN_DISTANCE, MAX_DISTANCE)

    ratio := (currentDist - newDist) / currentDist
    newPosition.x := currentPosition.x + dir_X * ratio
    newPosition.y := currentPosition.y + dir_Y * ratio
    newPosition.z := currentPosition.z + dir_Z * ratio

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

    FOR EACH cell (lx, ly, lz) IN board:
        state := Get(board, lx, ly, lz)
        IF state = CELL_EMPTY THEN CONTINUE

        (wx, wy, wz) := LogicalToWorld(lx, ly, lz)
        opacity := computeOpacity(wy)   // full for nearby Y, reduced for distant Y

        IF state = CELL_BLACK THEN
            IF opacity = 1.0 THEN opaqueBlack.ADD((wx, wy, wz))
            ELSE ghostBlack.ADD((wx, wy, wz))
        ELSE
            IF opacity = 1.0 THEN opaqueWhite.ADD((wx, wy, wz))
            ELSE ghostWhite.ADD((wx, wy, wz))

    // 4 draw calls at most (for 2 colors x 2 opacity levels)
    drawInstanced(opaqueBlack,  pieceGeo, blackOpaqueMat)
    drawInstanced(opaqueWhite,  pieceGeo, whiteOpaqueMat)
    drawInstanced(ghostBlack,   pieceGeo, blackGhostMat)
    drawInstanced(ghostWhite,   pieceGeo, whiteGhostMat)
```

**Opacity function** — continuous, not discrete:

```
FUNCTION computeOpacity(worldY):
    // Opacity falls off continuously with vertical distance from
    // the camera's look-at center. Pieces near the center Y are
    // fully opaque; pieces at the top/bottom edges fade smoothly.
    deltaY := abs(worldY - center_Y)
    maxDelta := (layers - 1) * layerSpacing / 2

    IF maxDelta < EPSILON THEN RETURN 1.0

    normalized := deltaY / maxDelta
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
    span_X  := boardSize - 1
    span_Y  := (layers - 1) * layerSpacing
    span_Z  := boardSize - 1
    center  := (span_X/2, span_Y/2, span_Z/2)
    diag    := sqrt(span_X^2 + span_Z^2 + span_Y^2)

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
    // World-space spherical to Cartesian (Y is up)
    pos_X := center_X + dist * cos(pitchRad) * cos(yawRad)
    pos_Y := center_Y + dist * sin(pitchRad)
    pos_Z := center_Z + dist * cos(pitchRad) * sin(yawRad)

STEP 7 — Clipping:
    near := max(0.1, dist * 0.01)
    far  := dist * 10.0

STEP 8 — Apply:
    camera.position := (pos_X, pos_Y, pos_Z)
    camera.lookAt(center_X, center_Y, center_Z)
    camera.up       := (0, 1, 0)
    camera.fov      := fov
    camera.near     := near
    camera.far      := far
    camera.aspect   := aspectRatio
```

---



---

## 9. Transparency Sorting (Draw Order)

### 9.1 Problem

Ghost (semi-transparent) pieces must be rendered after opaque pieces and
sorted back?to?front relative to the camera to avoid alpha?blending
artifacts (incorrect occlusion, z?fighting in transparent regions).

### 9.2 Sort?by?Distance Algorithm

Before issuing draw calls, sort all transparent instances by their distance
from the camera position (farthest first):

```
FUNCTION sortTransparentInstances(instances, cameraPosition):
    // Sort descending by distance: farthest drawn first
    SORT instances BY computeDistToCamera(instance, cameraPosition) DESCENDING
    RETURN instances

FUNCTION computeDistToCamera(instance, cameraPos):
    dx := instance.worldX - cameraPos.x
    dy := instance.worldY - cameraPos.y
    dz := instance.worldZ - cameraPos.z
    RETURN dx*dx + dy*dy + dz*dz   // squared distance (avoids sqrt)
```

### 9.3 Correct Draw Order

```
FUNCTION renderAllPieces(board, cameraPosition, layerSpacing):
    opaqueInstances  := []
    ghostInstances   := []

    // Bucket pieces by opacity (see section 8.2)
    FOR EACH piece IN board:
        (wx, wy, wz) := LogicalToWorld(piece.lx, piece.ly, piece.lz)
        opacity := computeOpacity(wy)
        IF opacity >= 1.0 - EPSILON THEN
            opaqueInstances.ADD((wx, wy, wz, piece.color))
        ELSE
            ghostInstances.ADD((wx, wy, wz, piece.color, opacity))

    // Step 1: Draw all opaque pieces first (order irrelevant)
    drawInstanced(opaqueInstances, pieceGeo, opaqueMat)

    // Step 2: Sort ghost pieces far?to?near
    ghostInstances := sortTransparentInstances(ghostInstances, cameraPosition)

    // Step 3: Draw ghost pieces in sorted order
    drawInstanced(ghostInstances, pieceGeo, ghostMat)
```

### 9.4 When to Re?sort

Ghost instances must be re?sorted whenever the camera position changes:

| Trigger                | Action                    |
|------------------------|---------------------------|
| Camera orbit (rotate)  | Re?sort ghost instances    |
| Camera zoom            | Re?sort ghost instances    |
| Board resize / reload  | Full rebuild + re?sort     |
| New piece placed       | Append + re?sort           |

---

## 10. Save/Load Camera Initialization

### 10.1 Deprecated Field: focusZ

Old save files (version < 2.0.0) may contain a `focusZ` field. This field
is **ignored** by the continuous camera system. The camera state is always
computed from the board's dimensions, not from discrete layer indices.

### 10.2 Loading Procedure

When loading a saved game, compute the initial camera state from scratch:

```
FUNCTION initCameraFromSave(saveData, viewportAspectRatio):
    boardSize    := saveData.boardSize
    layers       := saveData.layers
    layerSpacing := saveData.layerSpacing   // or default 3.5 if missing

    // Compute fresh camera state (ignore any old camera fields)
    yaw := DEFAULT_YAW    // 45 degrees ? diagonal view
    return computeCameraState(boardSize, layers, layerSpacing,
                               viewportAspectRatio, yaw)

CONST DEFAULT_YAW = 45
```

### 10.3 What is NOT Restored

| Deprecated Field      | Why Ignored                             |
|-----------------------|-----------------------------------------|
| `focusZ`              | Continuous system has no discrete focus |
| Any camera position   | Recomputed from board dimensions        |
| Any camera rotation   | Default yaw = 45 degrees                |

### 10.4 What IS Restored from Saves

| Field           | Usage                                              |
|-----------------|----------------------------------------------------|
| `boardSize`     | Bounding box width/depth                           |
| `layers`        | Bounding box height                                |
| `layerSpacing`  | Layer separation (user preference)                  |
| `isDarkTheme`   | Affects background color, not camera                |

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


