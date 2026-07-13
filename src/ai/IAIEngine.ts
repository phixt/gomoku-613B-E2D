import type { Board } from "../core/Board";

export interface AIMove {
  x: number;
  y: number;
  z: number;
}

export interface IAIEngine {
  /** Initialize with current sandbox parameters. Called on every game start. */
  init(boardSize: number, layers: number, winLength: number): void;

  /** Compute the best move. Returns null if no legal move exists. */
  getBestMove(board: Board, currentPlayer: 1 | 2): Promise<AIMove | null>;

  /** Abort any in-progress computation. */
  cancel(): void;
}
