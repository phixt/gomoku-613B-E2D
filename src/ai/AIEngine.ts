// AIEngine.ts — AI opponent engine for Gomoku 613B-E2D
// Current implementation: random valid moves (Minimax upgrade planned).

import type { Board } from "../core/Board";
import { BOARD_SIZE, LAYER_COUNT } from "../core/Config";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface AIMove {
  x: number;
  y: number;
  z: number;
}

export class AIEngine {
  private difficulty: Difficulty;
  private cancelled: boolean = false;
  private thinkingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(difficulty: Difficulty = "Easy") {
    this.difficulty = difficulty;
  }

  /** Set difficulty level. */
  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
  }

  /** Get current difficulty setting. */
  getDifficulty(): Difficulty {
    return this.difficulty;
  }

  /**
   * Compute the next AI move asynchronously.
   * Returns a Promise that resolves to {x, y, z}.
   */
  async think(board: Board): Promise<AIMove> {
    this.cancelled = false;

    // Collect all empty cells
    const emptyCells: AIMove[] = [];
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board.get(x, y, z) === 0) {
            emptyCells.push({ x, y, z });
          }
        }
      }
    }

    if (emptyCells.length === 0) {
      throw new Error("No valid moves available");
    }

    // Simulate thinking time based on difficulty
    const thinkTime = this.getThinkTime();

    return new Promise<AIMove>((resolve, reject) => {
      this.thinkingTimeout = setTimeout(() => {
        if (this.cancelled) {
          reject(new Error("AI thinking cancelled"));
          return;
        }
        const idx = Math.floor(Math.random() * emptyCells.length);
        resolve(emptyCells[idx]);
      }, thinkTime);
    });
  }

  /** Cancel the current thinking operation. */
  cancel(): void {
    this.cancelled = true;
    if (this.thinkingTimeout !== null) {
      clearTimeout(this.thinkingTimeout);
      this.thinkingTimeout = null;
    }
  }

  /** Return thinking delay in ms based on difficulty. */
  private getThinkTime(): number {
    switch (this.difficulty) {
      case "Easy":
        return 400 + Math.random() * 400; // 400–800ms
      case "Medium":
        return 200 + Math.random() * 300; // 200–500ms
      case "Hard":
        return 100 + Math.random() * 200; // 100–300ms
    }
  }
}