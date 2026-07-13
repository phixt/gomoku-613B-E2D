import type { Board } from "../Board";
import { WIN_LENGTH } from "../Config";
import { DIRECTIONS_3D } from "../../utils/MathUtils";
import type { Move } from "../Types";
import type { IRuleEngine, TurnState } from "./IRuleEngine";

export class SwapEngine implements IRuleEngine {
  checkWin(x: number, y: number, z: number, player: 1 | 2, board: Board): boolean {
    return this._hasLine(board, x, y, z, player, WIN_LENGTH);
  }

  isLegalMove(x: number, y: number, z: number, _player: 1 | 2, _history: Move[], board: Board): boolean {
    if (board.get(x, y, z) !== 0) return false;
    return true;
  }

  /** Swap2 flow state machine. */
  getNextTurnState(history: Move[], currentPlayer: 1 | 2): TurnState {
    const moveCount = history.length;

    if (moveCount === 1) {
      return {
        nextPlayer: currentPlayer,
        isSwapPhase: true,
        message: "White: Choose Swap or Pass"
      };
    }

    return {
      nextPlayer: currentPlayer === 1 ? 2 : 1,
      isSwapPhase: false,
      message: ""
    };
  }

  /** Flip all piece colors in history and on the board. Called when White chooses Swap. */
  applySwap(history: Move[], board: Board): void {
    for (const m of history) {
      m.player = m.player === 1 ? 2 : 1;
    }
    board.reset();
    for (const m of history) {
      board.set(m.x, m.y, m.z, m.player);
    }
  }

  private _hasLine(board: Board, x: number, y: number, z: number, player: 1 | 2, target: number): boolean {
    const size = board.size;
    const layers = board.layers;
    for (const d of DIRECTIONS_3D) {
      let count = 1;
      let px = x + d.x, py = y + d.y, pz = z + d.z;
      while (px >= 0 && px < size && py >= 0 && py < size && pz >= 0 && pz < layers && board.get(px, py, pz) === player) {
        count++;
        px += d.x; py += d.y; pz += d.z;
      }
      let nx = x - d.x, ny = y - d.y, nz = z - d.z;
      while (nx >= 0 && nx < size && ny >= 0 && ny < size && nz >= 0 && nz < layers && board.get(nx, ny, nz) === player) {
        count++;
        nx -= d.x; ny -= d.y; nz -= d.z;
      }
      if (count >= target) return true;
    }
    return false;
  }
}