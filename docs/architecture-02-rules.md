# Phase 2: Rule Engine & Algorithms

## 1. Win Condition Algorithm

### 1.1 Core Principle

A player wins when `winLength` or more consecutive same-color pieces exist in any
of the 13 independent 3D directions. The check is performed after every move
at the most recently placed stone.

### 1.2 Direction Vectors (13 total)

```
DIRECTIONS = [
    ( 1,  0,  0),  ( 0,  1,  0),  ( 0,  0,  1),     // axial
    ( 1,  1,  0),  ( 1, -1,  0),                     // face diagonal (XY)
    ( 1,  0,  1),  ( 1,  0, -1),                     // face diagonal (XZ)
    ( 0,  1,  1),  ( 0,  1, -1),                     // face diagonal (YZ)
    ( 1,  1,  1),  ( 1,  1, -1),
    ( 1, -1,  1),  ( 1, -1, -1)                      // space diagonal
]
```

Why 13 and not 26? Each direction `(dx, dy, dz)` covers both the positive and
negative ray from the origin. The antipode `(-dx, -dy, -dz)` is redundant because
the algorithm scans both ways from the placed stone.

### 1.3 Win Check Pseudocode

```
FUNCTION checkWinner(board, x, y, z):
    state := Get(board, x, y, z)
    IF state = CELL_EMPTY THEN
        RETURN 0

    FOR EACH dir IN DIRECTIONS:
        count := 1    // start with the stone at (x, y, z)

        // Scan positive direction
        (px, py, pz) := (x + dir.dx, y + dir.dy, z + dir.dz)
        WHILE inBounds(px, py, pz)
              AND Get(board, px, py, pz) = state:
            count := count + 1
            (px, py, pz) := (px + dir.dx, py + dir.dy, pz + dir.dz)

        // Scan negative direction
        (nx, ny, nz) := (x - dir.dx, y - dir.dy, z - dir.dz)
        WHILE inBounds(nx, ny, nz)
              AND Get(board, nx, ny, nz) = state:
            count := count + 1
            (nx, ny, nz) := (nx - dir.dx, ny - dir.dy, nz - dir.dz)

        IF count >= winLength THEN
            RETURN state

    RETURN 0
```

**Auxiliary function:**

```
FUNCTION inBounds(x, y, z):
    RETURN 0 <= x < boardSize
       AND 0 <= y < boardSize
       AND 0 <= z < layers
```

### 1.4 Complexity

- Per check: O(|DIRECTIONS| * winLength) = O(13 * winLength)
- With default winLength = 5: at most 13 * 10 = 130 cell reads
- Checks only the cell just placed, not the entire board

### 1.5 Variable winLength

The `winLength` parameter is configurable (default 5). The same algorithm works
for any positive `winLength`. Examples:

- `winLength = 5`: standard Gomoku, Connect5
- `winLength = 6`: Connect6 variant (see section 2.4)
- `winLength = 4`: training / tutorial mode

### 1.6 Pattern Classification

Beyond binary win/loss, the engine classifies runs by their **open ends**:

```
FUNCTION classifyRun(board, x, y, z, dir, state):
    count      := 1
    openEnds   := 0

    // Positive scan
    (px, py, pz) := (x + dir.dx, y + dir.dy, z + dir.dz)
    WHILE inBounds(px, py, pz) AND Get(board, px, py, pz) = state:
        count      := count + 1
        (px, py, pz) := (px + dir.dx, py + dir.dy, pz + dir.dz)
    IF inBounds(px, py, pz) AND Get(board, px, py, pz) = CELL_EMPTY THEN
        openEnds := openEnds + 1

    // Negative scan
    (nx, ny, nz) := (x - dir.dx, y - dir.dy, z - dir.dz)
    WHILE inBounds(nx, ny, nz) AND Get(board, nx, ny, nz) = state:
        count      := count + 1
        (nx, ny, nz) := (nx - dir.dx, ny - dir.dy, nz - dir.dz)
    IF inBounds(nx, ny, nz) AND Get(board, nx, ny, nz) = CELL_EMPTY THEN
        openEnds := openEnds + 1

    RETURN (count, openEnds)
```

**Pattern nomenclature:**

| openEnds | Meaning                                        |
|----------|------------------------------------------------|
| 2        | **Alive** — both ends open; can grow in both directions |
| 1        | **Half-open** — one end blocked by board edge or opponent |
| 0        | **Dead** — both ends blocked; cannot grow         |

---

## 2. Rule Engine Interface

### 2.1 Abstract Interface

All rule sets implement the same interface, making the game logic independent
of the chosen rules:

```
INTERFACE IRuleEngine:
    checkWin(x, y, z, player, board)               -> Boolean
    isLegalMove(x, y, z, player, history, board)   -> Boolean
    getNextTurnState(history, currentPlayer, levelConfig)        -> TurnState
```

### 2.2 TurnState

```
STRUCT TurnState:
    nextPlayer  : {BLACK, WHITE}
    isSwapPhase : Boolean
    message     : String   // UI hint during special phases
```

### 2.3 Move Legality

```
FUNCTION isLegalMove(x, y, z, player, history, board):
    IF NOT inBounds(x, y, z) THEN
        RETURN false
    IF Get(board, x, y, z) != CELL_EMPTY THEN
        RETURN false
    // Rule-specific additional checks go here (e.g., forbidden moves in Renju)
    RETURN true
```

The base legality check — "cell must be empty and within bounds" — is common
to all rule sets. Specific rule sets may add further restrictions.

### 2.4 Concrete Rule Sets

#### StandardEngine (Gomoku / Freestyle)

The simplest rule set: players alternate placing stones. First to get
`winLength` in a row wins.

```
IMPLEMENTS IRuleEngine AS StandardEngine:

    FUNCTION checkWin(x, y, z, player, board):
        RETURN hasRunOfLength(board, x, y, z, player, winLength)

    FUNCTION isLegalMove(x, y, z, player, history, board):
        RETURN Get(board, x, y, z) = CELL_EMPTY

    FUNCTION getNextTurnState(history, currentPlayer):
        RETURN TurnState(
            nextPlayer  := opponent(currentPlayer),
            isSwapPhase := false,
            message     := ""
        )
```

**Helper:**

```
FUNCTION opponent(player):
    RETURN IF player = CELL_BLACK THEN CELL_WHITE ELSE CELL_BLACK
```

#### SwapEngine (Swap2 Opening Rule)

Extends standard rules with the Swap2 opening protocol. After Black's opening
move, White may choose to swap colors:

```
IMPLEMENTS IRuleEngine AS SwapEngine:

    FUNCTION checkWin(x, y, z, player, board):
        RETURN hasRunOfLength(board, x, y, z, player, winLength)

    FUNCTION isLegalMove(x, y, z, player, history, board):
        RETURN Get(board, x, y, z) = CELL_EMPTY

    FUNCTION getNextTurnState(history, currentPlayer, levelConfig):
        // Guard: Swap2 only applies to a completely fresh game.
        // If the level has pre-placed pieces, skip the swap phase.
        IF levelConfig.initialMoves.length > 0 THEN
            RETURN TurnState(
                nextPlayer  := opponent(currentPlayer),
                isSwapPhase := false,
                message     := ""
            )

        IF history.length = 1 THEN
            // After Black's first move, White decides: swap or pass
            RETURN TurnState(
                nextPlayer  := currentPlayer,   // same player (White) decides
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

**Important guard condition:**

The swap phase is only triggered when `initialMoves.length = 0`
(i.e., no pre-placed pieces). Puzzle levels and tutorial levels with
pre-configured board states never enter the swap phase regardless of
the rule engine selected.

**Color-flipping (Swap action):**

When White chooses "Swap", all existing pieces on the board and in history
exchange colors:

```
FUNCTION applySwap(history, board):
    // Flip colors in the move history
    FOR EACH move IN history:
        move.player := opponent(move.player)

    // Rebuild the board from the flipped history
    board.Reset()
    FOR EACH move IN history:
        Set(board, move.x, move.y, move.z, move.player)
```

After a swap, the player who was Black becomes White and vice versa,
and play continues with the next player.

**Swap decision flow:**

```
After move[0] (Black's first stone):
    White is prompted: Swap or Pass?

    IF White chooses Swap:
        applySwap(history, board)
        // Now White (original) has Black pieces
        // Original Black now holds White pieces
        // Continue with the next logical player

    IF White chooses Pass:
        // No change; normal alternation resumes
```

#### Connect6Engine (Extension Point)

The interface supports adding Connect6 rules with minimal changes:

```
IMPLEMENTS IRuleEngine AS Connect6Engine:

    FUNCTION checkWin(x, y, z, player, board):
        RETURN hasRunOfLength(board, x, y, z, player, 6)

    FUNCTION isLegalMove(x, y, z, player, history, board):
        IF Get(board, x, y, z) != CELL_EMPTY THEN
            RETURN false
        // Connect6: Black places 1 stone on move 0, then 2 stones each turn
        IF history.length = 0 THEN
            RETURN true    // first move: 1 stone
        moveCountThisTurn := countMovesSinceLastTurnChange(history)
        RETURN moveCountThisTurn < 2

    FUNCTION getNextTurnState(history, currentPlayer):
        ... // logic to track 2-move turns

    FUNCTION countMovesSinceLastTurnChange(history):
        IF history.length = 0 THEN RETURN 0
        lastPlayer := history[history.length - 1].player
        count := 0
        FOR i := history.length - 1 DOWNTO 0:
            IF history[i].player = lastPlayer THEN
                count := count + 1
            ELSE
                BREAK
        RETURN count
```

---

## 3. Swap2 Decision Logic (Detailed)

### 3.1 Mathematical Model

The Swap2 rule introduces a single decision point after the first move,
but only when the game starts from an empty board. If the level configuration
has pre-placed pieces (`initialMoves.length > 0`), the swap phase is skipped
entirely ? the game is already in progress.

Let the initial move history be `history = [move[0]]` where `move[0].player = BLACK`.

White is presented with a binary choice:

- **Choice S (Swap):** Apply the transformation `T_swap` to the game state.
- **Choice P (Pass):** Apply identity; game continues with `nextPlayer = BLACK`.

### 3.2 Swap Transformation

```
T_swap(history, board):
    FOR EACH move IN history:
        move.player := opponent(move.player)

    board := emptyBoard(boardSize, layers)
    FOR EACH move IN history:
        placeStone(board, move)

    // The player identities are swapped for the remainder of the game.
    // Visual representation: White now controls the black stones.
```

### 3.3 Invariants

- After `T_swap`, the board configuration is identical except colors are inverted.
- The number of placed stones is unchanged.
- The game can still be won by either player under the standard win condition.
- No move is added to history during the swap; only existing moves are mutated.

### 3.4 Pseudocode for the Full Flow

```
FUNCTION handleSwapPhase(history, board, currentPlayer):
    // Show decision UI to the human (White) or auto-decide for AI

    ON_CHOICE_SWAP:
        applySwap(history, board)
        // After swap, currentPlayer still refers to the same "role"
        // The actual color ownership has been exchanged
        NOTIFY "Colors swapped"

    ON_CHOICE_PASS:
        // Nothing changes
        NOTIFY "Pass — colors unchanged"

    currentPlayer := opponent(currentPlayer)
    // Proceed to next turn
```

---

## 4. AI Heuristic Scoring Algorithm

### 4.1 Overview

The AI evaluates candidate cells by simulating a hypothetical piece placement
at each candidate and scoring the resulting patterns along all 13 directions.

### 4.2 Core Evaluation Function

```
FUNCTION evaluateCell(board, cellX, cellY, cellZ, player):
    totalScore := 0

    FOR EACH dir IN DIRECTIONS:
        // Simulate placing a piece at (cellX, cellY, cellZ)
        count      := 1     // the virtual piece
        openEnds   := 0

        // Scan positive direction
        (px, py, pz) := (cellX + dir.dx, cellY + dir.dy, cellZ + dir.dz)
        WHILE inBounds(px, py, pz):
            v := Get(board, px, py, pz)
            IF v = player THEN
                count := count + 1
                (px, py, pz) := (px + dir.dx, py + dir.dy, pz + dir.dz)
            ELSE IF v = CELL_EMPTY THEN
                openEnds := openEnds + 1
                BREAK
            ELSE
                BREAK

        // Scan negative direction
        (nx, ny, nz) := (cellX - dir.dx, cellY - dir.dy, cellZ - dir.dz)
        WHILE inBounds(nx, ny, nz):
            v := Get(board, nx, ny, nz)
            IF v = player THEN
                count := count + 1
                (nx, ny, nz) := (nx - dir.dx, ny - dir.dy, nz - dir.dz)
            ELSE IF v = CELL_EMPTY THEN
                openEnds := openEnds + 1
                BREAK
            ELSE
                BREAK

        totalScore := totalScore + patternScore(count, openEnds)

    RETURN totalScore
```

### 4.3 Pattern Score Table

The pattern score uses exponentially spaced values to ensure correct priority:
blocking a win always outranks building a weaker threat.

```
FUNCTION patternScore(count, openEnds):
    IF count >= winLength THEN RETURN 1000000       // FIVE — instant win

    IF count = 4 THEN
        IF openEnds = 2 THEN RETURN 100000           // LIVE_FOUR
        IF openEnds = 1 THEN RETURN 10000            // RUSH_FOUR
        RETURN 0

    IF count = 3 THEN
        IF openEnds = 2 THEN RETURN 10000            // LIVE_THREE
        IF openEnds = 1 THEN RETURN 1000             // SLEEP_THREE
        RETURN 0

    IF count = 2 THEN
        IF openEnds = 2 THEN RETURN 1000             // LIVE_TWO
        IF openEnds = 1 THEN RETURN 100              // SLEEP_TWO
        RETURN 0

    IF count = 1 THEN
        IF openEnds >= 1 THEN RETURN 10              // ONE
        RETURN 0

    RETURN 0
```

**Score gap rationale:** Each threat level is approximately 10x the level below,
ensuring no combination of weaker patterns can outweigh a single stronger one.

### 4.4 Composite Score

For each candidate cell, the AI calculates two scores and combines them:

```
FUNCTION scoreCandidate(board, cell, aiPlayer):
    opponent := IF aiPlayer = CELL_BLACK THEN CELL_WHITE ELSE CELL_BLACK

    attackScore  := evaluateCell(board, cell.x, cell.y, cell.z, aiPlayer)
    defenseScore := evaluateCell(board, cell.x, cell.y, cell.z, opponent)

    total := attackScore + 1.1 * defenseScore

    RETURN total
```

The 1.1 multiplier on defense means blocking an opponent's threat is prioritized
10% higher than building an equivalent attack of one's own.

### 4.5 Immediate Threat Detection

Used by the Easy AI to quickly find a must-block move:

```
FUNCTION findImmediateThreat(board, opponent):
    FOR z := 0 TO layers - 1:
        FOR y := 0 TO boardSize - 1:
            FOR x := 0 TO boardSize - 1:
                IF Get(board, x, y, z) != CELL_EMPTY THEN CONTINUE

                score := evaluateCell(board, x, y, z, opponent)
                IF score >= 10000 THEN     // RUSH_FOUR or higher
                    RETURN (x, y, z)

    RETURN null   // no immediate threat found
```

A score of 10000 means the opponent would have a RUSH_FOUR (forcing win)
or better if they were to place a stone there, so the cell must be blocked.

### 4.6 Candidate Selection by Difficulty

```
FUNCTION getCandidates(board, difficulty):
    IF board is empty THEN
        centerX := floor(boardSize / 2)
        centerZ := floor(layers / 2)
        RETURN [(centerX, centerX, centerZ)]

    IF difficulty = MEDIUM THEN
        RETURN getNearbyEmptyCells(board, radius := 1)

    IF difficulty = HARD THEN
        RETURN getNearbyEmptyCells(board, radius := 2)
```

```
FUNCTION getNearbyEmptyCells(board, radius):
    visited := new Set()
    result  := []

    FOR EACH cell (x, y, z) where Get(board, x, y, z) != CELL_EMPTY:
        FOR dz := -radius TO radius:
            FOR dy := -radius TO radius:
                FOR dx := -radius TO radius:
                    IF dx = 0 AND dy = 0 AND dz = 0 THEN CONTINUE
                    (nx, ny, nz) := (x + dx, y + dy, z + dz)
                    IF NOT inBounds(nx, ny, nz) THEN CONTINUE
                    IF Get(board, nx, ny, nz) != CELL_EMPTY THEN CONTINUE
                    key := hash(nx, ny, nz)
                    IF visited DOES NOT CONTAIN key THEN
                        visited.ADD(key)
                        result.ADD((nx, ny, nz))

    RETURN result
```

---

## 5. Unique Pattern Collection (Auxiliary Display)

### 5.1 Purpose

Collect all unique runs of 2 or more same-color pieces on a given layer,
used for rendering auxiliary tactical lines (c.f. Phase 3 visual layer).

### 5.2 Algorithm

```
FUNCTION collectLayerPatterns3D(board, layerZ):
    results := []

    FOR y := 0 TO boardSize - 1:
        FOR x := 0 TO boardSize - 1:
            state := Get(board, x, y, layerZ)
            IF state = CELL_EMPTY THEN CONTINUE

            FOR EACH dir IN DIRECTIONS:
                // Only start a pattern if the cell before it
                // in the negative direction is NOT the same color
                // (avoids duplicate counting)
                (px, py, pz) := (x - dir.dx, y - dir.dy, layerZ - dir.dz)
                IF inBounds(px, py, pz)
                   AND Get(board, px, py, pz) = state THEN
                    CONTINUE   // this pattern was already counted

                // Scan positive direction
                cells := [(x, y, layerZ)]
                count := 1
                (qx, qy, qz) := (x + dir.dx, y + dir.dy, layerZ + dir.dz)
                WHILE inBounds(qx, qy, qz)
                      AND Get(board, qx, qy, qz) = state:
                    cells.ADD((qx, qy, qz))
                    count := count + 1
                    (qx, qy, qz) := (qx + dir.dx, qy + dir.dy, qz + dir.dz)

                // Count open ends
                openEndPos := (qx, qy, qz)
                openEndNeg := (px, py, pz)
                openEnds := 0
                IF inBounds(openEndPos) AND Get(board, ...) = CELL_EMPTY THEN
                    openEnds := openEnds + 1
                IF inBounds(openEndNeg) AND Get(board, ...) = CELL_EMPTY THEN
                    openEnds := openEnds + 1

                IF count >= 2 THEN
                    results.ADD(Pattern3D(
                        dx: dir.dx, dy: dir.dy, dz: dir.dz,
                        count: count,
                        openEnds: openEnds,
                        alive: openEnds >= 2,
                        cells: cells
                    ))

    RETURN results
```

---

## 6. Rule Engine Integration Flow

### 6.1 Turn Lifecycle

```
1. Player clicks / AI selects cell (x, y, z)

2. isLegalMove(x, y, z, currentPlayer, history, board)
   IF false THEN reject click / re-evaluate AI

3. Set(board, x, y, z, currentPlayer)
   history.ADD(Move(x, y, z, currentPlayer))

4. IF checkWin(x, y, z, currentPlayer, board) THEN
       game over — declare winner
       RETURN

5. turnState := getNextTurnState(history, currentPlayer)

6. IF turnState.isSwapPhase THEN
       // Guard clause: only trigger if the game started from empty board
       present swap decision UI
       WAIT for user choice
       IF swap chosen THEN applySwap(history, board)

7. currentPlayer := turnState.nextPlayer
   GOTO step 1
```

### 6.2 Rule-Agnostic Design

The game loop (steps 1–7) is identical regardless of the rule set. Only the
three interface methods (`checkWin`, `isLegalMove`, `getNextTurnState`) change
behavior between Standard, Swap2, Connect6, or future rule sets.

This means:
- The UI layer never needs to know which rule set is active
- Adding a new rule set requires implementing only 3 functions
- The AI can be reused across rule sets (it only needs `checkWin` to verify
  terminal states)

---

## Appendix A: Threat Classification Reference

| Name          | Run Length | openEnds | Score      | Description                                      |
|---------------|------------|----------|------------|--------------------------------------------------|
| FIVE          | >= 5       | any      | 1,000,000  | Instant win                                       |
| LIVE_FOUR     | 4          | 2        | 100,000    | Unblockable; guarantees win next turn             |
| RUSH_FOUR     | 4          | 1        | 10,000     | Forcing; opponent must block immediately          |
| LIVE_THREE    | 3          | 2        | 10,000     | Strong threat; can become LIVE_FOUR next turn     |
| SLEEP_THREE   | 3          | 1        | 1,000      | Moderate threat; one end blocked                  |
| LIVE_TWO      | 2          | 2        | 1,000      | Developing; can grow in both directions           |
| SLEEP_TWO     | 2          | 1        | 100        | Weak; one end blocked                             |
| ONE           | 1          | 1 or 2   | 10         | Isolated stone with at least one open neighbor    |

---

## Appendix B: Rule Set Comparison

| Feature               | Standard (Gomoku) | Swap2        | Connect6 (extensible) |
|-----------------------|-------------------|--------------|------------------------|
| Win length            | 5 (configurable)  | 5            | 6                      |
| Opening protocol      | None              | Swap2        | Black: 1, then 2/turn  |
| Turn alternation      | Strict            | Strict       | Two moves per turn     |
| Swap phase            | No                | Yes (move 1) | No                     |
| Legal move check      | Cell empty        | Cell empty   | Cell empty + count     |
| checkWin complexity   | O(1) per move     | O(1)         | O(1)                   |
