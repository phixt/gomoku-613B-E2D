import type { Board } from "../Board";
import type { Move } from "../Types";

export interface TurnState {
  nextPlayer: 1 | 2;
  isSwapPhase: boolean;
  message: string;
}

export interface IRuleEngine {
  checkWin(x: number, y: number, z: number, player: 1 | 2, board: Board): boolean;
  isLegalMove(x: number, y: number, z: number, player: 1 | 2, history: Move[], board: Board): boolean;
  getNextTurnState(history: Move[], currentPlayer: 1 | 2): TurnState;
}