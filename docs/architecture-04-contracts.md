# Phase 4: Interface Contract Layer

## 1. Module Architecture

The system is partitioned into five decoupled modules. Each module exposes
a contract that its consumers depend on, never its internal implementation.

```
+-------------------+       +-------------------+
|    UI / View      |       |  AI Opponent      |
| (rendering, input)|       | (heuristic search)|
+--------+----------+       +---------+---------+
         |                            |
         |  IOverlayManager           |  IAIEngine
         |  KeyboardShortcutMap       |
         |                            |
         v                            v
+--------------------------------------------------+
|                Game Core (Logic)                  |
|  Board + Rules + Turn Management + State Machine  |
+------------------------+-------------------------+
                         |
                         |  IStorageAdapter
                         |
                         v
                +-------------------+
                |  Persistence      |
                | (local/cloud)     |
                +-------------------+
```

**Dependency direction:** UI and AI depend on Game Core. Game Core depends on
Persistence. No module depends on a module above it. Communication across
module boundaries uses only the contracts defined below.

---

## 2. Core Engine Contracts

### 2.1 IRuleEngine

Defines how the game logic layer determines move legality, win conditions,
and turn progression. Every rule variant (Standard, Swap2, Connect6)
implements this contract.

#### 2.1.1 CheckWin

```
CheckWin(
    x        : integer,      // 0 <= x < boardSize
    y        : integer,      // 0 <= y < boardSize
    z        : integer,      // 0 <= z < layers
    player   : PlayerColor,
    board    : BoardState
) -> BOOLEAN
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `(x, y, z)` is within board bounds; cell contains `player`'s piece |
| Post-condition| Returns TRUE iff `player` has `winLength`+ consecutive pieces  |
|               | along any of the 13 3D directions passing through `(x, y, z)`  |
| Side effects  | None. Pure read-only query.                                    |
| Performance   | O(13 * winLength) cell reads; must complete in < 1 ms          |

**Error conditions:** None. Out-of-bounds coordinates return FALSE.

#### 2.1.2 IsLegalMove

```
IsLegalMove(
    x        : integer,
    y        : integer,
    z        : integer,
    player   : PlayerColor,
    history  : MoveHistory,
    board    : BoardState
) -> BOOLEAN
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `history` contains all moves played so far, in order           |
| Post-condition| Returns TRUE iff `player` may legally place a stone at         |
|               | `(x, y, z)` under the current rule set                         |
| Side effects  | None. Pure read-only query.                                    |

**Base legality check (all rule sets):**

1. `(x, y, z)` is within board bounds.
2. `board[x][y][z]` is empty.

Additional checks per rule set:

| Rule Set  | Extra Condition                                               |
|-----------|---------------------------------------------------------------|
| Standard  | None beyond base                                              |
| Swap2     | None beyond base; blocked during active swap decision phase   |
| Connect6  | Player has not exceeded their per-turn stone allowance        |

#### 2.1.3 GetNextTurnState

```
GetNextTurnState(
    history        : MoveHistory,
    currentPlayer  : PlayerColor,
    levelConfig    : LevelConfig         // see section 3.3
) -> TurnState
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `history` is consistent with the current board state           |
| Post-condition| Returns the TurnState describing who acts next and whether     |
|               | any special phase (swap) is active                             |
| Side effects  | None. Pure function of history + config.                       |

**TurnState structure:**

```
TurnState:
    nextPlayer  : PlayerColor    // the player expected to act next
    isSwapPhase : Boolean        // TRUE if a swap decision is pending
    message     : String         // human-readable hint for the UI
```

**Contractual guarantees:**

- `nextPlayer` is always BLACK or WHITE (never null/empty).
- If `isSwapPhase` is TRUE, no new Move may be submitted until the swap
  decision is resolved via the Swap2 flow.
- The `message` field is localizable; consumers should treat it as an opaque
  display string.

**Swap2 specific:**

- Reaches `isSwapPhase = TRUE` only when `history.length = 1`
  AND `levelConfig.initialMoves` is empty (the game started from scratch).
- If `levelConfig.initialMoves` is non-empty, `isSwapPhase` is always FALSE.

---

### 2.2 IAIEngine

Defines how the AI opponent module plugs into the game loop. The AI is
asynchronous and cancellable to avoid blocking the UI thread.

#### 2.2.1 Initialize

```
Initialize(
    boardSize   : integer,     // >= 5, odd
    layers      : integer,     // >= 1
    winLength   : integer      // >= 3, typically 5
) -> void
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | Called once before the first call to `GetBestMove`             |
| Post-condition| AI internal data structures are sized for the given board      |
| Side effects  | Resets any cached state from a previous game                   |
| Idempotency   | May be called multiple times; each call fully resets the AI    |

**Contract:** After `Initialize`, the AI must be ready to accept `GetBestMove`
calls for a board of the given dimensions.

#### 2.2.2 GetBestMove

```
GetBestMove(
    board          : BoardState,
    currentPlayer  : PlayerColor     // the AI's color
) -> Promise<Coordinate3D | null>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `Initialize` has been called with matching board dimensions    |
|               | `currentPlayer` has at least one legal move available          |
| Post-condition| Returns a Coordinate3D of a legal move, or null if no legal    |
|               | move exists (board full) or computation was cancelled          |
| Side effects  | None observable from outside. May update internal caches.      |
| Concurrency   | Only one `GetBestMove` may be in flight at a time.             |
|               | Calling again while a previous call is pending is undefined.   |
| Time budget   | Easy: 200-500 ms. Medium: 100-300 ms. Hard: 50-200 ms.        |

**Return value guarantees:**

- If non-null, the returned coordinate satisfies `IsLegalMove` at the time
  of computation.
- The caller must re-verify legality before applying the move (the board
  state may have changed if the AI ran concurrently with user input).

#### 2.2.3 Cancel

```
Cancel() -> void
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | None. Safe to call at any time.                                |
| Post-condition| Any in-flight `GetBestMove` returns null as soon as possible   |
| Side effects  | May leave internal state in a consistent but empty state       |
| Idempotency   | Safe to call multiple times; subsequent calls are no-ops       |

---

## 3. Storage & Persistence Contract

### 3.1 IStorageAdapter

Abstracts the persistence backend. Implementations exist for browser
localStorage, Tauri filesystem, and a future cloud API. The Game Core
never knows which backend is active.

#### 3.1.1 Initialize

```
Initialize() -> Promise<void>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | Called once before any other method                            |
| Post-condition| Storage backend is ready for read/write operations             |
| Side effects  | May create directories, open database connections, etc.        |
| Error handling| Rejects promise if backend is unavailable; caller must handle   |

#### 3.1.2 GetIndex

```
GetIndex() -> Promise<SlotMeta[]>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `Initialize` has completed successfully                        |
| Post-condition| Returns metadata for all saved games, ordered by slot index    |
| Side effects  | None. Read-only.                                               |

**SlotMeta structure:**

```
SlotMeta:
    index       : integer       // slot number (0-based)
    id          : String        // unique save identifier (UUID)
    timestamp   : integer       // Unix milliseconds
    boardSize   : integer       // board dimension at save time
    layers      : integer       // layer count at save time
    movesCount  : integer       // number of moves in the saved game
```

**Contract:** `GetIndex` must return quickly (< 50 ms) as it is called for
UI rendering. The returned array length is exactly `SAVE_SLOT_COUNT` (6),
with null entries for empty slots.

#### 3.1.3 GetSave

```
GetSave(id: String) -> Promise<String | null>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `id` is a valid UUID from a previous `SetSave` or `GetIndex`   |
| Post-condition| Returns the serialized `SaveData` JSON string, or null if not   |
|               | found (deleted or never existed)                               |
| Side effects  | None. Read-only.                                               |

**Contract:** The returned string, when parsed, must conform to the `SaveData`
schema (section 3.3). The storage layer does not validate the content;
validation is the caller's responsibility.

#### 3.1.4 SetSave

```
SetSave(
    id      : String,       // UUID for this save
    data    : String,       // JSON-serialized SaveData
    meta    : SlotMeta      // index metadata for the index
) -> Promise<void>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `data` is a valid JSON string conforming to SaveData schema    |
|               | `meta.index` is in [0, SAVE_SLOT_COUNT)                        |
| Post-condition| Save is durably stored; subsequent `GetIndex` includes this     |
|               | entry at the given index                                       |
| Side effects  | Overwrites any existing save at the same index                 |

**Atomicity:** The `data` and `meta` write must be atomic — either both
succeed or neither. A partial write (meta updated but data missing) is
a contract violation.

#### 3.1.5 DeleteSave

```
DeleteSave(id: String) -> Promise<void>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `id` was previously stored via `SetSave`                       |
| Post-condition| Save data and its index entry are removed; subsequent           |
|               | `GetSave(id)` returns null; `GetIndex` omits this entry         |
| Side effects  | Irreversible. Storage space is reclaimed.                      |
| Idempotency   | Deleting an already-deleted save is a no-op (no error)         |

---

### 3.2 SaveManager (Game Core Facade)

The SaveManager is not itself a contract boundary — it is part of Game Core
and consumes `IStorageAdapter`. However, its public API forms the contract
between Game Core and the UI for save/load operations.

#### 3.2.1 Save

```
Save(index: integer, data: SaveData) -> Promise<void>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `index` in [0, SAVE_SLOT_COUNT)                                |
|               | `data` passes `ValidateSaveData`                               |
| Post-condition| Data stored via IStorageAdapter; UI notified via SaveUpdated    |
|               | event                                                        |

#### 3.2.2 Load

```
Load(index: integer) -> SaveData | null
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Post-condition| Returns the SaveData at the given index, or null if empty       |
| Side effects  | None. In-memory read from the slot cache.                      |

#### 3.2.3 Delete

```
Delete(index: integer) -> Promise<void>
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | `index` in [0, SAVE_SLOT_COUNT)                                |
| Post-condition| Slot cleared; storage adapter notified; UI notified            |

#### 3.2.4 QuickSave / QuickLoad

Convenience methods that alias to `Save(QUICK_SAVE_INDEX, ...)` and
`Load(QUICK_SAVE_INDEX)` respectively. `QUICK_SAVE_INDEX = 5`.

#### 3.2.5 ValidateSaveData

```
ValidateSaveData(data: any) -> String | null
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Post-condition| Returns null if valid; an error code string if invalid          |
| Side effects  | None. Pure static function.                                    |

**Validation rules:** See Phase 1, section 6.2.

---

### 3.3 SaveData Schema

This is the canonical data contract for serialized game state. Any producer
or consumer of save data must conform to this schema.

```
SaveData:
    id              : String            // UUID v4
    version         : String            // "2.0.0"
    timestamp       : integer           // Unix milliseconds
    boardState      : integer[layers][boardSize][boardSize]
    moves           : MoveRecord[]
    rules           : "gomoku" | "swap2"
    gameMode        : "pvp" | "pve"
    aiDifficulty    : "easy" | "medium" | "hard" | absent
    status          : "playing" | "finished"
    winner          : 0 | 1 | 2         // 0=none, 1=BLACK, 2=WHITE
    currentPlayer   : 1 | 2
    focusZ          : integer           // DEPRECATED — ignored on load
    isDarkTheme     : boolean
    playerColor     : 1 | 2             // human color in PvE mode
    boardSize       : integer           // >= 5, odd
    layers          : integer           // >= 1
    layerSpacing    : number            // >= 2.0, <= 6.0

MoveRecord:
    x               : integer
    y               : integer
    z               : integer
    player          : 1 | 2
    timestamp       : integer?          // optional
    evaluation      : number?           // optional, AI heuristic score
```

**Serialization format:** JSON string, optionally Base64-encoded for transport.

**Compatibility note:** The `focusZ` field is present for backward compatibility
with version < 2.0.0 saves. Loaders must ignore it and compute camera state
from `boardSize`, `layers`, and `layerSpacing` instead (see Phase 3, section 10).

**LevelConfig** (for initializing new games and validating Swap2 eligibility):

```
LevelConfig:
    id              : String
    name            : String            // i18n key
    boardSize       : integer
    layers          : integer
    winLength       : integer           // default 5
    rules           : "standard" | "swap2"   // default "standard"
    initialMoves    : MoveRecord[]      // may be empty
```

---

## 4. UI Interaction Contracts

### 4.1 IOverlayManager

The UI layer exposes modal dialogs and notifications through a single
contract consumed by Game Core. This decouples game logic from the
presentation framework (DOM, Godot UI, etc.).

#### 4.1.1 ShowConfirmDialog

```
ShowConfirmDialog(
    title    : String,       // dialog title (already localized)
    message  : String,       // body text (already localized)
    onYes    : callback()    // invoked when user clicks "Yes"/"OK"
) -> void
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | No other modal is currently visible                            |
| Post-condition| A modal dialog is displayed with the given title and message   |
|               | and two buttons: affirmative and negative                       |
| Side effects  | Blocks further game interaction until the user responds        |
| Callback      | `onYes` is invoked exactly once if the user confirms;           |
|               | if the user cancels, `onYes` is never called                   |

**Behavioral contract:**

- The dialog must support keyboard dismissal (Escape = cancel).
- The "Yes" button must be focusable and respond to Enter.
- Calling `ShowConfirmDialog` while another dialog is open is an error;
  the implementation must either queue or reject the second call.

#### 4.1.2 ShowInputDialog

```
ShowInputDialog(
    title      : String,
    message    : String,
    placeholder: String,        // hint text inside the input field
    onSubmit   : callback(String)
) -> void
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Pre-condition | No other modal is currently visible                            |
| Post-condition| A modal dialog with a single-line text input is displayed      |
| Side effects  | Blocks further game interaction until the user responds        |
| Callback      | `onSubmit(value)` is invoked with the trimmed input string if   |
|               | the user confirms; never invoked if the user cancels            |

**Behavioral contract:**

- The input field receives focus automatically.
- Pressing Enter in the input field triggers confirmation.
- The callback receives the raw trimmed string. Validation is the
  caller's responsibility.
- An empty or whitespace-only input is still submitted; the caller
  decides whether to reject it.

#### 4.1.3 ShowToast

```
ShowToast(
    message  : String,       // already localized
    isError  : Boolean       // default false
) -> void
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Post-condition| A non-blocking notification appears briefly and auto-dismisses  |
| Side effects  | None. Does not block input.                                    |

**Behavioral contract:**

- Toasts stack vertically. Multiple toasts may be visible simultaneously.
- Each toast auto-dismisses after a fixed duration (recommended: 2-3 seconds).
- Error toasts (isError = TRUE) use a visually distinct style (e.g., red).
- Toasts must not steal focus or block keyboard/mouse input.

#### 4.1.4 CloseAll

```
CloseAll() -> void
```

| Aspect        | Description                                                    |
|---------------|----------------------------------------------------------------|
| Post-condition| All open modals and dialogs are dismissed; any pending          |
|               | callbacks are discarded (not invoked)                          |

---

### 4.2 KeyboardShortcutMap

Defines how physical key presses map to game actions. This contract is
consumed by the input handling layer and produced by the configuration.

#### 4.2.1 Schema

```
KeyboardShortcutMap:
    bindings : KeyBinding[]

KeyBinding:
    keys        : String[]       // e.g., ["Escape"], ["Control", "S"]
    action      : String         // semantic action name (see below)
    contexts    : String[]       // game states where this binding is active
    description : String         // human-readable (for settings UI)
```

#### 4.2.2 Standard Action Names

| Action            | Contexts              | Default Keys     | Description                       |
|-------------------|-----------------------|------------------|-----------------------------------|
| `pause`           | PLAYING               | Escape, R        | Open pause menu                   |
| `resume`          | PAUSED                | Escape            | Close pause menu, resume game     |
| `confirm`         | TITLE                 | Space, Enter      | Start game                        |
| `load_latest`     | TITLE, PAUSED         | L                 | Load most recent save             |
| `quick_save`      | PLAYING               | Ctrl+S            | Save to quick-save slot           |
| `restart`         | PAUSED                | R                 | Restart current game              |
| `return_to_title` | PAUSED                | B                 | Return to title screen            |
| `open_guide`      | PAUSED                | G                 | Open guide/tutorial               |
| `toggle_theme`    | ALL                   | T                 | Toggle dark/light theme           |
| `toggle_mute`     | ALL                   | M                 | Toggle audio mute                 |
| `undo`            | PLAYING               | Ctrl+Z            | Undo last move                    |
| `layer_prev`      | PLAYING               | A                 | Shift view to previous layer      |
| `layer_next`      | PLAYING               | D                 | Shift view to next layer          |
| `rotate_left`     | PLAYING, REPLAY       | Q                 | Orbit camera left                 |
| `rotate_right`    | PLAYING, REPLAY       | E                 | Orbit camera right                |
| `zoom_in`         | PLAYING, REPLAY       | W, ArrowUp        | Zoom camera in                    |
| `zoom_out`        | PLAYING, REPLAY       | S, ArrowDown      | Zoom camera out                   |
| `replay_prev`     | REPLAY                | ArrowLeft         | Previous replay step              |
| `replay_next`     | REPLAY                | ArrowRight        | Next replay step                  |
| `exit_replay`     | REPLAY                | Escape, R         | Exit replay mode                  |

#### 4.2.3 Context Values

| Context           | Active when Game.Status is...                                  |
|-------------------|----------------------------------------------------------------|
| ALL               | Any state                                                      |
| TITLE             | NotStarted                                                     |
| PLAYING           | InProgress                                                     |
| PAUSED            | Paused                                                         |
| REPLAY            | A replay session is active                                     |

#### 4.2.4 Processing Contract

```
FUNCTION ProcessKeyEvent(key: String, context: String) -> String | null:
    // Returns the matching action name, or null if no binding matches
    // Context is the current Game.Status value
    // Conflicts (multiple bindings for same key+context) must be
    // resolved by priority (first match wins)
```

**Contractual guarantees:**

- A key binding is only active if all keys in `keys` are simultaneously held.
  (e.g., "Control+S" requires both keys).
- If a key event matches a binding, the event is consumed (not propagated).
- If no binding matches, the event is passed through to the default handler.
- Bindings must not conflict within the same context. If two bindings claim
  the same key combination in the same context, the first defined binding
  takes priority.

---

## 5. Event Bus Contract

The internal Game Core uses an event bus for decoupled communication between
its sub-components. External modules (UI, AI) may subscribe to these events
but must not publish on the bus directly.

### 5.1 Event Names and Payloads

| Event                    | Payload                         | When Emitted                                  |
|--------------------------|---------------------------------|-----------------------------------------------|
| `THEME_TOGGLED`          | `isDark: Boolean`               | User toggles theme (T key)                    |
| `LAYER_CHANGED`          | `layerIndex: integer`           | User switches visible layer (A/D keys)        |
| `BOARD_UPDATED`          | none                            | Board state changed (move placed or loaded)   |
| `GAME_RESET`             | none                            | Game reset to initial state                   |
| `SAVE_UPDATED`           | `slots: SaveData[]`             | Save slot contents changed                    |
| `COLORBLIND_MODE_TOGGLED`| `enabled: Boolean`              | Colorblind mode toggled                       |
| `AI_MOVE_REQUEST`        | none                            | AI begins computing (for UI spinner)          |
| `PLAY_SOUND`             | `soundId: String, volume: Real` | Sound effect requested                        |

### 5.2 Subscription Contract

```
Subscribe(eventName: String, callback: Function) -> void
Unsubscribe(eventName: String, callback: Function) -> void
```

- Subscribers receive events in the order they were emitted.
- Callbacks are invoked synchronously.
- Subscribers must not modify event payloads.
- Unsubscribing with a callback that was never subscribed is a no-op.

---

## 6. Contract Compliance Checklist

For each module implementation to be considered compliant with this
specification, it must pass the following checks:

### 6.1 IRuleEngine Implementation

- [ ] `CheckWin` returns FALSE for out-of-bounds coordinates
- [ ] `CheckWin` returns FALSE for an empty cell
- [ ] `CheckWin` correctly identifies wins in all 13 directions
- [ ] `IsLegalMove` rejects occupied cells
- [ ] `IsLegalMove` rejects out-of-bounds coordinates
- [ ] `GetNextTurnState` never returns a null or invalid `nextPlayer`
- [ ] `GetNextTurnState` triggers Swap2 only when appropriate

### 6.2 IAIEngine Implementation

- [ ] `Initialize` can be called multiple times without leaking memory
- [ ] `GetBestMove` always returns a legal move or null
- [ ] `Cancel` causes in-flight `GetBestMove` to return null within 100 ms
- [ ] `GetBestMove` respects the time budget for its difficulty level

### 6.3 IStorageAdapter Implementation

- [ ] `Initialize` completes before any other method is called
- [ ] `SetSave` + `GetSave` round-trip: data saved equals data loaded
- [ ] `DeleteSave` + `GetSave` returns null
- [ ] `GetIndex` returns correct slot count
- [ ] Concurrent writes to different indices do not corrupt each other

### 6.4 IOverlayManager Implementation

- [ ] `ShowConfirmDialog` invokes callback on confirm, not on cancel
- [ ] `ShowInputDialog` invokes callback with trimmed input
- [ ] `ShowToast` auto-dismisses without blocking input
- [ ] `CloseAll` discards pending callbacks

### 6.5 KeyboardShortcutMap Implementation

- [ ] No conflicting bindings in the same context
- [ ] Key events not matching any binding are passed through
- [ ] Modifier combinations (Ctrl, Shift) are correctly detected
