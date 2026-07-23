# Core Conceptual Layer: Domain Model

## 1. Core Entities

An **entity** has a distinct identity that persists through state changes.
Two entities with identical attribute values are still different entities
if they have different identities.

---

### 1.1 Game

The central aggregate root. A Game represents a single match from initiation
to completion.

| Property             | Type              | Description                                              |
|----------------------|-------------------|----------------------------------------------------------|
| Identity             | Game ID           | Unique identifier for this match                         |
| Board                | Board             | The playing field (see 1.2)                              |
| Move History         | collection of Move| All moves played in order (see 1.4)                      |
| Current Turn State   | Turn State        | Whose turn, and whether a special phase is active        |
| Status               | Game Status       | One of: NotStarted, InProgress, Paused, Finished         |
| Rule Set             | Rule Set          | Which rules govern this match (see 3.4)                  |
| Winner               | PlayerColor or none| Set when the game ends with a win                        |
| Started At           | Timestamp         | When the game transitioned to InProgress                 |
| Finished At          | Timestamp or none | When the game ended                                      |

**Lifecycle:**

    NotStarted  -->  InProgress  -->  Finished
                       |    ^
                       v    |
                      Paused

- A Game begins in `NotStarted`.
- Transitioning to `InProgress` requires a valid Board and Rule Set.
- Transitioning to `Paused` is only valid from `InProgress`.
- Transitioning to `Finished` occurs when a win is detected or a player resigns.

---

### 1.2 Board

The playing field. A Board has a fixed configuration at creation time and
does not change its dimensions during a game.

| Property          | Type                    | Description                                   |
|-------------------|-------------------------|-----------------------------------------------|
| Identity          | Board ID                | Unique identifier                             |
| Configuration     | Board Configuration     | Size, layers, spacing (see 2.3)               |
| Placed Pieces     | collection of Piece     | All stones currently on the board (see 2.5)   |

**Invariants:**

- The Board always contains exactly the pieces that correspond to the Move History
  replayed in order. There is never a divergence between the Move History and
  the Placed Pieces.
- Two Pieces may not occupy the same Coordinate3D.
- Every Piece's Coordinate3D must be within the Board's bounds.

**Operations (conceptual):**

- Place a Piece at a Coordinate3D (enforces invariants).
- Remove the most recently placed Piece (undo).
- Clear all Pieces (reset).
- Query: what Piece, if any, occupies a given Coordinate3D?
- Query: how many Pieces of a given color are on the Board?

---

### 1.3 Move

A Move is an immutable record of a single stone placement. Once recorded,
a Move is never modified (except during a Swap2 color exchange — see 3.4.2).

| Property      | Type            | Description                                   |
|---------------|-----------------|-----------------------------------------------|
| Identity      | Move Index       | Position in the Move History (0-based ordinal) |
| Coordinate    | Coordinate3D    | Where the stone was placed (see 2.1)           |
| Player        | PlayerColor     | Who placed the stone (see 2.4)                 |
| Timestamp     | Timestamp       | When the move was submitted                    |

**Identity note:** A Move's identity is its ordinal position in the history.
Move 0 is the first move of the game, move 1 is the second, and so on.

---

### 1.4 Move History

An ordered collection of Moves representing the complete sequence of play.

**Properties:**

- Moves are strictly ordered by submission time.
- The sequence is append-only during normal play.
- During a Swap2 color exchange, all existing Moves have their PlayerColor
  inverted (the only mutation allowed).

**Queries:**

- How many moves have been played?
- What was the most recent move?
- What was the move at ordinal position k?
- Replay: what would the Board look like after the first k moves?

---

## 2. Value Objects

A **value object** has no identity. Two value objects with identical
attribute values are considered equal and interchangeable.

---

### 2.1 Coordinate3D

A point in the board's 3D logical space.

| Attribute | Type    | Constraints                          |
|-----------|---------|--------------------------------------|
| x         | integer | column: 0 <= x < boardSize           |
| y         | integer | row:    0 <= y < boardSize           |
| z         | integer | layer:  0 <= z < layers              |

**Equality:** Two Coordinate3D values are equal if they have the same x, y,
and z values.

---

### 2.2 Board Configuration

The immutable dimensional parameters of a Board.

| Attribute    | Type    | Constraints                      |
|--------------|---------|----------------------------------|
| boardSize    | integer | odd, >= 5                        |
| layers       | integer | >= 1                             |
| layerSpacing | real    | > 0 (visual only, no gameplay effect) |

**Note:** `layerSpacing` affects only the visual rendering of the board and
has no impact on game logic, win detection, or move legality.

---

### 2.3 PlayerColor

An enumeration with two values:

- **BLACK** — the first player (traditional black stones)
- **WHITE** — the second player (traditional white stones)

**Operation:** `opponent(color)` returns the other color.

---

### 2.4 Piece

A stone placed on the Board. A Piece is fully defined by its attributes.

| Attribute  | Type          | Description                     |
|------------|---------------|---------------------------------|
| coordinate | Coordinate3D  | Where the stone sits            |
| color      | PlayerColor   | BLACK or WHITE                  |

A Piece is always associated with exactly one Board and corresponds to
exactly one Move in the Move History.

---

### 2.5 Turn State

Describes whose turn it is and whether any special phase is active.

| Attribute    | Type                     | Description                              |
|--------------|--------------------------|------------------------------------------|
| nextPlayer   | PlayerColor              | The player expected to act next          |
| isSwapPhase  | boolean                  | True if the Swap2 decision is pending    |
| message      | text (human-readable)    | Hint for the UI during special phases    |

---

### 2.6 Rule Set

Defines which rules of play are enforced. Three variants exist:

| Variant    | Key Characteristic                                      |
|------------|---------------------------------------------------------|
| Standard   | Basic Gomoku: alternate turns, first to winLength wins   |
| Swap2      | Standard rules plus a color-swap decision after move 1  |
| Connect6   | Black places 1 stone, then each player places 2 per turn |

The Rule Set determines:
- How win conditions are checked (which run length)
- How turn alternation works
- Whether special phases (e.g., swap) are triggered

---

### 2.7 Game Status

An enumeration:

| Value       | Meaning                                        |
|-------------|------------------------------------------------|
| NotStarted  | Game exists but no moves have been submitted   |
| InProgress  | Game is active; accepting moves                |
| Paused      | Game is temporarily suspended                  |
| Finished    | Game ended by win, draw, or resignation        |

---

### 2.8 Win Condition

Defines the victory threshold.

| Attribute  | Type    | Default | Description                              |
|------------|---------|---------|------------------------------------------|
| winLength  | integer | 5       | Consecutive same-color pieces to win     |

The Win Condition is independent of the Rule Set (e.g., a Standard game can
use winLength=6 for a variant, or a Connect6 game uses winLength=6 by default).

---

## 3. Domain Events

Domain events capture significant state transitions. They are immutable facts
about what happened at a point in time.

---

### 3.1 GameInitialized

**When:** A new Game is created with a Board and Rule Set, ready for the first move.

**Payload:**

| Field           | Type                  |
|-----------------|-----------------------|
| gameId          | Game ID               |
| boardConfig     | Board Configuration   |
| ruleSet         | Rule Set              |
| winCondition    | Win Condition         |
| initialMoves    | collection of Move    | May be empty or contain pre-placed pieces |

---

### 3.2 MoveSubmitted

**When:** A player places a stone on the Board. This is the most frequent event.

**Payload:**

| Field       | Type          |
|-------------|---------------|
| gameId      | Game ID        |
| move        | Move           |
| moveIndex   | integer        | Ordinal position in the history |

**Side effects:**

- The Board's Placed Pieces collection gains a new Piece.
- The Move History grows by one entry.
- Win detection is triggered (may produce WinDetected).

---

### 3.3 TurnEnded

**When:** The turn state advances to the next player without triggering any
special phase.

**Payload:**

| Field         | Type         |
|---------------|--------------|
| gameId        | Game ID       |
| previousPlayer| PlayerColor   |
| nextPlayer    | PlayerColor   |

---

### 3.4 SwapPhaseTriggered

**When:** The Swap2 rule set determines that the swap decision must be presented
to White after Black's first move. This event is only raised if the game
started with an empty board (no pre-placed pieces).

**Payload:**

| Field         | Type         |
|---------------|--------------|
| gameId        | Game ID       |
| decidingPlayer| PlayerColor   | Always WHITE |
| message       | text          | "Choose Swap or Pass" |

---

### 3.5 SwapExecuted

**When:** White chooses to swap colors during the swap phase.

**Payload:**

| Field         | Type         |
|---------------|--------------|
| gameId        | Game ID       |
| decidingPlayer| PlayerColor   | Always WHITE |

**Side effects:**

- All existing Moves have their PlayerColor inverted.
- The Board's Placed Pieces are rebuilt with the inverted colors.
- The game continues with the next player.

---

### 3.6 SwapPassed

**When:** White chooses to pass (not swap) during the swap phase.

**Payload:**

| Field         | Type         |
|---------------|--------------|
| gameId        | Game ID       |
| decidingPlayer| PlayerColor   | Always WHITE |

**Side effects:**

- No state changes beyond advancing to the next turn.

---

### 3.7 WinDetected

**When:** After a Move is submitted, the win condition is satisfied.

**Payload:**

| Field         | Type         |
|---------------|--------------|
| gameId        | Game ID       |
| winner        | PlayerColor   |
| winningCells  | collection of Coordinate3D | The run that triggered the win |

**Side effects:**

- The Game transitions to `Finished`.
- The `winner` field of the Game is set.
- `GameFinished` is raised.

---

### 3.8 GameFinished

**When:** The Game transitions to `Finished` (after a win, draw, or resignation).

**Payload:**

| Field         | Type               |
|---------------|--------------------|
| gameId        | Game ID             |
| outcome       | Win | Draw | Resign |
| winner        | PlayerColor or none |

---

### 3.9 GamePaused

**When:** The Game is suspended (e.g., player opens the menu).

**Payload:**

| Field         | Type         |
|---------------|--------------|
| gameId        | Game ID       |

---

### 3.10 GameResumed

**When:** The Game returns from `Paused` to `InProgress`.

**Payload:**

| Field         | Type         |
|---------------|--------------|
| gameId        | Game ID       |

---

### 3.11 GameReset

**When:** The Game is deliberately restarted, clearing all state.

**Payload:**

| Field         | Type                  |
|---------------|-----------------------|
| gameId        | Game ID                |
| boardConfig   | Board Configuration    | May be the same or a new configuration |
| ruleSet       | Rule Set               |

---

## 4. Business Rules & Invariants

Business rules are facts that must always be true. Invariants are conditions
that hold before and after every operation.

---

### 4.1 Board Bounds

- **Rule:** Every Coordinate3D referenced in a Move or Piece must satisfy
  `0 <= x < boardSize`, `0 <= y < boardSize`, `0 <= z < layers`.
- **Enforcement:** Failed at Move submission; the operation is rejected before
  any state change.

---

### 4.2 Cell Occupancy

- **Rule:** No two Pieces may occupy the same Coordinate3D.
- **Rule:** A Move may only be submitted to an empty cell (the cell must not
  already contain a Piece).
- **Enforcement:** Checked at Move submission. If the target cell is occupied,
  the move is illegal and rejected.

---

### 4.3 Turn Alternation (Standard)

- **Rule:** Players alternate: BLACK, then WHITE, then BLACK, and so on.
- **Rule:** A player may not submit two consecutive moves.
- **Enforcement:** The `nextPlayer` field of TurnState determines who may act.
  Only that player's submissions are accepted.

---

### 4.4 Turn Alternation (Connect6)

- **Rule:** BLACK places exactly 1 stone on the first turn.
- **Rule:** Thereafter, each player places exactly 2 stones per turn.
- **Rule:** A player's turn ends after both stones are placed (or the game ends).

---

### 4.5 Win Condition

- **Rule:** A player wins when their most recently placed stone creates a
  continuous line of `winLength` or more same-colored stones along any
  of the 13 valid 3D directions.
- **Rule:** Win detection is performed after every Move submission, at the
  coordinate of the most recent Move only.
- **Rule:** If both players would simultaneously satisfy the win condition
  (theoretically impossible under standard rules), the player who just moved
  is declared the winner.

---

### 4.6 Swap2 Protocol

- **Rule:** The swap decision is triggered only after exactly one Move has
  been submitted (Black's opening move).
- **Rule:** The swap decision is **not** triggered if the Game started with
  pre-placed pieces (i.e., the Board was not empty at game initialization).
  Puzzle levels, tutorial levels, and loaded save games skip the swap phase
  entirely.
- **Rule:** During the swap phase, White may choose either "Swap" or "Pass".
  No new Moves are accepted until this choice is made.
- **Rule:** If Swap is chosen, all existing Moves and Pieces exchange colors
  (BLACK becomes WHITE and vice versa). The Move History length remains unchanged.
- **Rule:** If Pass is chosen, no state changes beyond advancing the turn.

---

### 4.7 Pre-Placed Pieces Guard

- **Rule:** Any level configuration may include initial pieces (e.g., puzzle
  setups, tutorial scenarios). These are placed before the first player turn.
- **Rule:** Pre-placed pieces are recorded as Moves in the Move History with
  the appropriate PlayerColor. They count toward win detection normally.
- **Rule:** The Swap2 protocol is disabled when pre-placed pieces exist,
  because the game is already in progress and swapping mid-game would
  invalidate the puzzle.

---

### 4.8 Undo

- **Rule:** The most recent Move may be undone (removed from the Board and
  the Move History), returning the Game to the state before that Move.
- **Rule:** Undo is subject to the Rule Set: in Connect6, undoing one stone
  of a two-stone turn undoes both stones.
- **Rule:** After undo, the TurnState is recalculated from the remaining
  Move History.

---

### 4.9 Draw

- **Rule:** A draw occurs when the Board is completely filled (all cells
  occupied) and no player has satisfied the win condition.
- **Enforcement:** Checked after every Move submission when the Move count
  equals `boardSize * boardSize * layers`.

---

## 5. Entity Relationship Summary

    Game (aggregate root)
      |-- owns --> Board (1:1)
      |               |-- contains --> Piece (1:*)
      |-- owns --> Move History (1:1)
      |               |-- contains --> Move (1:*)
      |-- references --> Rule Set (1:1)
      |-- references --> Win Condition (1:1)
      |-- has --> Turn State (1:1)
      |-- has --> Game Status (1:1)

    Coordinate3D  -- referenced by --> Piece, Move
    PlayerColor   -- referenced by --> Piece, Move, Turn State
    Board Configuration -- owned by --> Board

**Relationship cardinalities:**

- A Game has exactly one Board; a Board belongs to exactly one Game.
- A Board contains zero or more Pieces; a Piece belongs to exactly one Board.
- A Move History contains zero or more Moves in strict order.
- Each Move references exactly one Coordinate3D and one PlayerColor.
- A Game uses exactly one Rule Set and one Win Condition at a time.

---

## 6. Cross-Reference to Architecture Documents

| Concept            | Detailed in                     |
|--------------------|---------------------------------|
| Board state storage| Phase 1, section 1              |
| Move History       | Phase 1, section 2              |
| State Machine      | Phase 1, section 3              |
| Save Data format   | Phase 1, section 6              |
| Win Detection      | Phase 2, section 1              |
| Rule Engines       | Phase 2, section 2              |
| Swap2 Logic        | Phase 2, section 3              |
| AI Scoring         | Phase 2, section 4              |
| Camera System      | Phase 3                         |
| Coordinate Mapping | Phase 3, section 2              |
