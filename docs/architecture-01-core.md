# Phase 1: Core Data Structures & State Machine

## 1. Board State

### 1.1 Dimensional Model

The game board is a 3-dimensional integer grid of size `boardSize x boardSize x layers`
(default 13 x 13 x 6), where each cell holds one of {0, 1, 2}.

| Parameter       | Variable       | Default | Constraint                                    |
|-----------------|----------------|---------|-----------------------------------------------|
| Side length     | `boardSize`    | 13      | `boardSize` is odd, `boardSize >= 5`          |
| Layer count     | `layers`       | 6       | `layers >= 1`                                 |

The board origin `(0, 0, 0)` is at one corner. Axes are:

- **x** — column (horizontal, increasing rightward)
- **y** — row    (horizontal, increasing forward/downward)
- **z** — layer  (vertical, increasing upward)

The center position is `(floor(boardSize/2), floor(boardSize/2), floor(layers/2))`.

### 1.2 Cell State

Each cell `(x, y, z)` holds one of three values:

```
CELL_EMPTY = 0
CELL_BLACK = 1   // first player
CELL_WHITE = 2   // second player
```

### 1.3 Internal Storage

The board is stored as a flat dense array of length `boardSize * boardSize * layers`.
The linear index is computed with **row-major, z-major** ordering:

```
INDEX(x, y, z) = z * boardSize^2 + y * boardSize + x
```

**Pseudocode:**

```
FUNCTION Get(board, x, y, z):
    IF 0 <= x < boardSize AND 0 <= y < boardSize AND 0 <= z < layers THEN
        RETURN board.data[z * boardSize^2 + y * boardSize + x]
    ELSE
        RETURN CELL_EMPTY    // out-of-bounds reads return empty

FUNCTION Set(board, x, y, z, state):
    IF 0 <= x < boardSize AND 0 <= y < boardSize AND 0 <= z < layers THEN
        board.data[z * boardSize^2 + y * boardSize + x] := state
```

### 1.4 Iteration

```
FUNCTION ForEach(board, callback):
    FOR z := 0 TO layers - 1:
        FOR y := 0 TO boardSize - 1:
            FOR x := 0 TO boardSize - 1:
                callback(x, y, z, Get(board, x, y, z))
```

### 1.5 Piece Count

To determine the next player from an existing board (used by AI):

```
FUNCTION CountPieces(board):
    count1 := 0, count2 := 0
    FOR z := 0 TO layers - 1, y := 0 TO boardSize - 1, x := 0 TO boardSize - 1:
        v := Get(board, x, y, z)
        IF v = CELL_BLACK THEN count1 := count1 + 1
        IF v = CELL_WHITE THEN count2 := count2 + 1
    RETURN (count1, count2)

FUNCTION DetectCurrentPlayer(board):
    (c1, c2) := CountPieces(board)
    RETURN IF c1 <= c2 THEN CELL_BLACK ELSE CELL_WHITE
```

---

## 2. Move & History

### 2.1 Move Definition

```
STRUCT Move:
    x         : Integer   // 0 <= x < boardSize
    y         : Integer   // 0 <= y < boardSize
    z         : Integer   // 0 <= z < layers
    player    : {BLACK, WHITE}
    timestamp : Integer?  // optional, Unix ms
    evaluation: Real?     // optional, AI heuristic score
```

### 2.2 Move List

The move history is a sequentially ordered list:

```
moveHistory: List<Move>   // [move[0], move[1], move[2], ...]
```

Properties:
- `moveHistory.length` equals total moves placed this game
- The last element is the most recent move
- Indices are 0-based and correspond to turn order

### 2.3 Undo / Redo Semantics

The system uses a **replay-from-history** model rather than a branching undo stack:

**Undo to step k:** Reconstruct the board state by replaying moves `move[0]` through `move[k-1]`.

```
FUNCTION ReplayMoves(board, moves, targetCount):
    board.Reset()   // fill all cells with CELL_EMPTY
    FOR i := 0 TO targetCount - 1:
        move := moves[i]
        Set(board, move.x, move.y, move.z, move.player)
```

This is the mechanism used by the replay viewer (see section 4 REPLAY state).
A full undo (remove last move) corresponds to `targetCount := moves.length - 1`.

### 2.4 Replay State

```
STRUCT ReplayState:
    moves        : List<Move>
    currentIndex : Integer    // how many moves are visible (0 .. moves.length)
```

Step forward/backward adjusts `currentIndex` and re-renders via `ReplayMoves(board, moves, currentIndex)`.

---

## 3. Game State Machine

### 3.1 State Enumeration

```
STATES = {
    TITLE,
    PLAYING,
    PAUSED,
    GAME_OVER,
    REPLAY,
    GUIDE_FROM_TITLE,
    GUIDE_FROM_GAME
}
```

### 3.2 State Descriptions

| State               | Description                                                    |
|----------------------|----------------------------------------------------------------|
| **TITLE**            | Start screen visible; board inactive; menu BGM playing.         |
| **PLAYING**          | Active game; accepting input; game BGM playing.                 |
| **PAUSED**           | ESC menu overlay shown; game frozen; pause BGM playing.         |
| **GAME_OVER**        | Win detected; victory modal shown; SFX triggered.               |
| **REPLAY**           | Viewing a saved game move-by-move; step controls active.        |
| **GUIDE_FROM_TITLE** | Tutorial/guide screen, entered from TITLE.                      |
| **GUIDE_FROM_GAME**  | Tutorial/guide screen, entered from PAUSED (ESC menu).          |

### 3.3 State Transition Map

```
                               +--------------+
                               |    TITLE     |
                               +--+---+---+---+
                    "Start Game"  |   |   |  "Guide"
                       +----------+   |   +----------+
                       v              |              v
                 +----------+         |    +--------------------+
                 | PLAYING  |<--------+    | GUIDE_FROM_TITLE   |
                 +-+--+--+--+  "Load Game" +---------+----------+
                   |  |  |       (via L key)         | "Back"
      "ESC / R"    |  |  | "Win detected"            v
         +---------+  |  +----------+          +----------+
         v             |             v          |  TITLE   |
    +---------+        |       +----------+     +----------+
    | PAUSED  |        |       |GAME_OVER |
    +--+--+---+        |       +----+-----+
       |  |  "Guide/G" |            | "Restart" / "Title"
       |  +------+     |            |
       |         v     |            |
       |  +--------------+         |
       |  |GUIDE_FROM_GAME|        |
       |  +------+-------+         |
       |         | "Resume" / "Back to Game"
       |         v                 |
       |    +---------+            |
       |    | PLAYING |<-----------+
       |    +---------+
       |
       | "Resume (ESC)"
       v
   +---------+
   | PLAYING |
   +---------+
```

### 3.4 Transition Table

| From                | To                | Trigger                          | Conditions                                          |
|---------------------|-------------------|----------------------------------|-----------------------------------------------------|
| **TITLE**           | PLAYING           | "Start Game" button / Space/Enter| —                                                   |
| **TITLE**           | GUIDE_FROM_TITLE  | "Guide" button                   | —                                                   |
| **TITLE**           | PLAYING           | L key (load latest save)         | A valid save exists in a slot                       |
| **GUIDE_FROM_TITLE**| PLAYING           | "Start Game" button              | —                                                   |
| **GUIDE_FROM_TITLE**| TITLE             | "Back" button                    | —                                                   |
| **PLAYING**         | PAUSED            | ESC or R key                     | —                                                   |
| **PLAYING**         | GAME_OVER         | Win detected (run length >= 5)   | After any piece placement, checkWinner() returns non-zero |
| **PAUSED**          | PLAYING           | ESC (Resume)                     | —                                                   |
| **PAUSED**          | PLAYING           | R key (Restart)                  | Confirms restart; resets board and moveHistory      |
| **PAUSED**          | TITLE             | B key (Back to Title)            | Clears game state, returns to start screen           |
| **PAUSED**          | GUIDE_FROM_GAME   | G key (Guide)                    | —                                                   |
| **PAUSED**          | PLAYING           | Load a save via L key            | Valid save loaded successfully                      |
| **GUIDE_FROM_GAME** | PLAYING           | "Resume" button / ESC            | —                                                   |
| **GUIDE_FROM_GAME** | PLAYING           | "New Game" button                | Confirms restart; resets board                      |
| **GAME_OVER**       | PLAYING           | "Restart" button                 | Confirms restart; resets board                      |
| **GAME_OVER**       | TITLE             | "Title" button                   | Returns to start screen                             |
| **Any**             | REPLAY            | "Replay" button on a save slot   | Valid save loaded; enters replay mode                |
| **REPLAY**          | TITLE             | Exit replay (ESC / R / Exit btn) | Returns to TITLE after cleanup                      |

### 3.5 Global Hotkeys (all states)

| Key | Action                              |
|-----|-------------------------------------|
| T   | Toggle dark/light theme             |
| M   | Toggle mute                         |

---

## 4. Turn & Rule Engine Interface

### 4.1 Rule Engine Abstraction

The game decouples rule logic from UI via a strategy pattern:

```
INTERFACE IRuleEngine:
    checkWin(x, y, z, player, board)      -> Boolean
    isLegalMove(x, y, z, player, history, board) -> Boolean
    getNextTurnState(history, currentPlayer)     -> TurnState
```

### 4.2 TurnState

```
STRUCT TurnState:
    nextPlayer  : {BLACK, WHITE}
    isSwapPhase : Boolean
    message     : String    // human-readable hint for swap UI
```

### 4.3 Concrete Rule Sets

#### StandardEngine (Gomoku)

- **Win**: Run of exactly `winLength` consecutive same-color pieces in any of 13 3D directions (see section 5).
- **Legality**: Cell must be empty.
- **Turn order**: Strict alternation; `nextPlayer = opponent(currentPlayer)`.

#### SwapEngine (Swap2 Opening Rule)

- Inherits win/legality from `StandardEngine`.
- **Turn logic**: After the first move (Black's opening), the engine signals
  `isSwapPhase = true` with the same `nextPlayer`. White may:
  - **Swap**: All pieces flip color on the board and in history;
    Black and White roles exchange.
  - **Pass**: Game continues without color change; turn passes to Black normally.

```
FUNCTION getNextTurnState(history, currentPlayer):
    IF history.length = 1 THEN
        RETURN TurnState(
            nextPlayer  := currentPlayer,
            isSwapPhase := true,
            message     := "Choose Swap or Pass"
        )
    ELSE
        RETURN TurnState(
            nextPlayer  := opponent(currentPlayer),
            isSwapPhase := false,
            message     := ""
        )
```

```
FUNCTION applySwap(history, board):
    FOR EACH move IN history:
        move.player := opponent(move.player)    // flip in history
    board.Reset()
    FOR EACH move IN history:
        Set(board, move.x, move.y, move.z, move.player)
```

---

## 5. Win Detection (13-Direction 3D Run Length)

### 5.1 Direction Vectors

There are 13 independent direction vectors (only one per antipodal pair is needed):

```
DIRECTIONS = [
    (1, 0, 0),  (0, 1, 0),  (0, 0, 1),           // axial
    (1, 1, 0),  (1, -1, 0),                       // face diagonal (XY)
    (1, 0, 1),  (1, 0, -1),                       // face diagonal (XZ)
    (0, 1, 1),  (0, 1, -1),                       // face diagonal (YZ)
    (1, 1, 1),  (1, 1, -1), (1, -1, 1), (1, -1, -1)  // space diagonal
]
```

### 5.2 Win Check Algorithm

Given the most recently placed stone at position `(x, y, z)` with player `p`:

```
FUNCTION checkWinner(board, x, y, z):
    state := Get(board, x, y, z)
    IF state = CELL_EMPTY THEN RETURN 0

    FOR EACH dir IN DIRECTIONS:
        count := 1

        // Scan positive direction
        (px, py, pz) := (x + dir.dx, y + dir.dy, z + dir.dz)
        WHILE inBounds(px, py, pz) AND Get(board, px, py, pz) = state:
            count := count + 1
            (px, py, pz) := (px + dir.dx, py + dir.dy, pz + dir.dz)

        // Scan negative direction
        (nx, ny, nz) := (x - dir.dx, y - dir.dy, z - dir.dz)
        WHILE inBounds(nx, ny, nz) AND Get(board, nx, ny, nz) = state:
            count := count + 1
            (nx, ny, nz) := (nx - dir.dx, ny - dir.dy, nz - dir.dz)

        IF count >= winLength THEN RETURN state

    RETURN 0
```

**Complexity:** O(|DIRECTIONS| * winLength) = O(13 * 5) = constant time.

### 5.3 Pattern Detection

For heuristics (AI evaluation / auxiliary line display), the same scan also
records **open ends** and lists all cells in a run:

```
STRUCT Pattern3D:
    dx, dy, dz  : Integer   // direction vector
    count       : Integer   // number of consecutive same-color pieces (>= 2)
    openEnds    : {0, 1, 2} // how many ends are empty
    alive       : Boolean   // openEnds = 2
    cells       : List<{x, y, z}>  // all cells in this run

FUNCTION checkPatterns3D(board, x, y, z):
    state := Get(board, x, y, z)
    IF state = CELL_EMPTY THEN RETURN []

    results := []
    FOR EACH dir IN DIRECTIONS:
        (count, openEnds, cells) := scanRun(board, x, y, z, dir)
        IF count >= 2 THEN
            results := results + [{
                dx: dir.dx, dy: dir.dy, dz: dir.dz,
                count: count,
                openEnds: openEnds,
                alive: openEnds >= 2,
                cells: cells
            }]
    RETURN results
```

---

## 6. Save / Restore Data Format

### 6.1 SaveData Structure

```
STRUCT SaveData:
    id            : UUID string
    version       : "2.0.0"
    timestamp     : Integer (Unix ms)
    boardState    : Integer[layers][boardSize][boardSize]   // 3D array snapshot
    moves         : List<Move>                              // complete move history
    rules         : "gomoku" | "swap2"
    gameMode      : "pvp" | "pve"
    aiDifficulty  : "easy" | "medium" | "hard"?
    status        : "playing" | "finished"
    winner        : {0, BLACK, WHITE}
    currentPlayer : {BLACK, WHITE}
    focusZ        : Integer            // camera focus layer
    isDarkTheme   : Boolean
    playerColor   : {BLACK, WHITE}     // human player's color in PvE
    boardSize     : Integer
    layers        : Integer
    layerSpacing  : Real               // visual 3D layer spacing
```

### 6.2 Validation Rules

```
FUNCTION validateSaveData(data):
    IF data is not an object THEN RETURN error
    IF data.version is missing
       OR data.boardState is not Array
       OR data.moves is not Array
       OR boardSize <= 0 OR layers <= 0 THEN RETURN error

    IF boardState.length != layers THEN RETURN error
    FOR z := 0 TO layers - 1:
        IF boardState[z].length != boardSize THEN RETURN error
        IF boardState[z][0].length != boardSize THEN RETURN error

    RETURN OK
```

### 6.3 Serialization

Save data is serialized as JSON, then Base64-encoded for clipboard export/import.

### 6.4 Slots

Up to 6 save slots (0–5), where slot 5 is reserved for quick-save.
Each slot maps to a persistent storage key and holds either null (empty)
or a `SaveData` object.

---

## 7. Level Configuration

```
STRUCT LevelConfig:
    id            : String           // unique identifier
    name          : String           // i18n key
    boardSize     : Integer
    layers        : Integer
    winLength     : Integer          // default 5
    rules         : "standard" | "swap2"?  // default "standard"
    initialMoves  : List<Move>       // pre-placed pieces
```

Pre-defined levels include:

| ID         | Board  | Layers | Notes                              |
|------------|--------|--------|------------------------------------|
| `tutorial` | 9x9    | 1      | Flat board; no initial moves        |
| `residual` | 13x13  | 6      | 3 pre-placed pieces (puzzle mode)   |

A custom sandbox level can be configured at runtime with arbitrary
`boardSize` and `layers`.

---

## 8. AI Interface

```
INTERFACE IAIEngine:
    init(boardSize, layers, winLength)           -> void
    think(board)                                 -> Promise<Move | null>
    setDifficulty(difficulty: {Easy, Medium, Hard}) -> void
    cancel()                                     -> void
```

**Heuristic model (common to all difficulties):**

For each candidate cell, evaluate attack and defense scores by scanning
all 13 directions. For each direction `dir`, count the run length and open ends
that would result from placing a piece at the candidate cell, then sum
the pattern scores:

```
FUNCTION evaluateCell(board, cell, player):
    totalScore := 0
    FOR EACH dir IN DIRECTIONS:
        (runLen, openEnds) := scanRunWithVirtualPiece(board, cell, dir, player)
        totalScore := totalScore + patternScore(runLen, openEnds)
    RETURN totalScore
```

**Pattern score table:**

| Run Length | openEnds = 2             | openEnds = 1             | openEnds = 0 |
|------------|--------------------------|--------------------------|--------------|
| >= 5       | 1,000,000   (FIVE)       | —                        | —            |
| 4          | 100,000     (LIVE_FOUR)  | 10,000     (RUSH_FOUR)   | 0            |
| 3          | 10,000      (LIVE_THREE) | 1,000      (SLEEP_THREE) | 0            |
| 2          | 1,000       (LIVE_TWO)   | 100        (SLEEP_TWO)   | 0            |
| 1          | 10           (ONE)       | 10         (ONE)         | 0            |

**Final score:**

```
total := attackScore + 1.1 * defenseScore
```

Meaning defense is weighted 10% higher than attack to prioritize blocking
the opponent's threats.

**Difficulty differentiation:**

| Difficulty | Candidate scope                             | Think time    |
|------------|---------------------------------------------|---------------|
| Easy       | Random + immediate threat block only         | 200–500 ms    |
| Medium     | Empty cells within radius 1 of any piece     | 100–300 ms    |
| Hard       | Empty cells within radius 2 of any piece     | 50–200 ms     |

---

## Appendix A: 3D Coordinate Convention

```
     z (up)
      |     . (x, y, z)
      |    /|
      |   / |
      |  /  |
      | /   |
      |/    |
      +-----------> y (forward)
     /
    /
   v
  x (right)
```

- **x** = column (0 .. boardSize - 1)
- **y** = row    (0 .. boardSize - 1)
- **z** = layer  (0 .. layers - 1, z=0 is the bottom layer)

---

## Appendix B: Constants Summary

| Constant              | Value | Meaning                                         |
|-----------------------|-------|-------------------------------------------------|
| DEFAULT_BOARD_SIZE    | 13    | Side length of square grid                       |
| DEFAULT_LAYER_COUNT   | 6     | Number of vertical layers                        |
| WIN_LENGTH            | 5     | Pieces in a row needed to win                    |
| DEFAULT_LAYER_SPACING | 3.5   | Visual spacing between layers (arbitrary units)  |
| SAVE_SLOT_COUNT       | 6     | Total save slots                                 |
| QUICK_SAVE_INDEX      | 5     | Slot reserved for quick-save                     |
| CELL_EMPTY            | 0     | —                                                |
| CELL_BLACK            | 1     | —                                                |
| CELL_WHITE            | 2     | —                                                |
