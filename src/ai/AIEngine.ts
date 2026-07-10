// AIEngine.ts - Heuristic AI opponent for Gomoku 613B-E2D
// Supports three difficulty levels: Easy (random+block), Medium (2D greedy), Hard (3D greedy)

import type { Board } from "../core/Board";
import { BOARD_SIZE, LAYER_COUNT } from "../core/Config";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface AIMove {
  x: number;
  y: number;
  z: number;
}

// ---- 3D Direction Vectors (13 directions in 3D space) ----
const DIRECTIONS_3D: [number, number, number][] = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],
  [1, 1, 0], [1, -1, 0],
  [1, 0, 1], [1, 0, -1],
  [0, 1, 1], [0, 1, -1],
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
];

// ---- 2D Direction Vectors (only X, Y, and XY diagonals) ----
const DIRECTIONS_2D: [number, number, number][] = [
  [1, 0, 0], [0, 1, 0], [1, 1, 0], [1, -1, 0],
];

// ---- Heuristic Score Table ----
const SCORE_FIVE = 100000;
const SCORE_LIVE_FOUR = 10000;
const SCORE_RUSH_FOUR = 1000;
const SCORE_LIVE_THREE = 1000;
const SCORE_SLEEP_THREE = 100;
const SCORE_LIVE_TWO = 100;
const SCORE_SLEEP_TWO = 10;
const SCORE_ONE = 1;

export class AIEngine {
  private difficulty: Difficulty;
  private cancelled: boolean = false;
  private thinkingTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(difficulty: Difficulty = "Easy") {
    this.difficulty = difficulty;
  }

  setDifficulty(d: Difficulty): void {
    this.difficulty = d;
  }

  getDifficulty(): Difficulty {
    return this.difficulty;
  }

  cancel(): void {
    this.cancelled = true;
    if (this.thinkingTimeout !== null) {
      clearTimeout(this.thinkingTimeout);
      this.thinkingTimeout = null;
    }
  }

  // ============================================================
  //  PUBLIC think() - Main entry point
  // ============================================================
  async think(board: Board): Promise<AIMove | null> {
    this.cancelled = false;

    if (this.difficulty === "Easy") {
      return this.thinkEasy(board);
    }

    const candidates = this.getCandidates(board);
    if (candidates.length === 0) return null;

    const directions = this.difficulty === "Hard" ? DIRECTIONS_3D : DIRECTIONS_2D;
    const aiPlayer = this.detectAIPlayer(board);
    const opponentPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;

    let bestMove: AIMove | null = null;
    let bestScore = -Infinity;

    // Evaluate every batchSize candidates, then yield to avoid UI freeze
    const batchSize = 50;
    for (let i = 0; i < candidates.length; i++) {
      if (this.cancelled) return null;

      const move = candidates[i];
      const attackScore = this.evaluatePoint(board, move.x, move.y, move.z, aiPlayer, directions);
      const defenseScore = this.evaluatePoint(board, move.x, move.y, move.z, opponentPlayer, directions);
      const totalScore = attackScore * 1.1 + defenseScore;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMove = move;
      }

      // Yield every batchSize iterations
      if (i % batchSize === 0 && i > 0) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }

    // Simulate thinking delay based on difficulty
    await new Promise<void>((r) => setTimeout(r, this.getThinkTime()));

    return bestMove;
  }

  // ============================================================
  //  EASY: Random move, but block immediate 4-in-a-row threats
  // ============================================================
  private async thinkEasy(board: Board): Promise<AIMove | null> {
    // First, check if opponent has any 4-in-a-row threat and block it
    const aiPlayer = this.detectAIPlayer(board);
    const opponentPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;
    const blockMove = this.findImmediateThreat(board, opponentPlayer);
    if (blockMove) {
      await new Promise<void>((r) => setTimeout(r, this.getThinkTime()));
      return blockMove;
    }

    // Otherwise random move
    const emptyCells: AIMove[] = [];
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board.get(x, y, z) === 0) emptyCells.push({ x, y, z });
        }
      }
    }
    if (emptyCells.length === 0) return null;
    await new Promise<void>((r) => setTimeout(r, this.getThinkTime()));
    return emptyCells[Math.floor(Math.random() * emptyCells.length)];
  }

  // ============================================================
  //  Find a cell that blocks opponent's 4-in-a-row
  // ============================================================
  private findImmediateThreat(board: Board, opponent: 1 | 2): AIMove | null {
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board.get(x, y, z) !== 0) continue;
          // Check if placing opponent here would create 4 in a row
          const score = this.evaluatePoint(board, x, y, z, opponent, DIRECTIONS_2D);
          if (score >= SCORE_RUSH_FOUR) return { x, y, z };
        }
      }
    }
    return null;
  }

  // ============================================================
  //  Detect AI's player number (the one with fewer pieces on board)
  // ============================================================
  private detectAIPlayer(board: Board): 1 | 2 {
    let count1 = 0, count2 = 0;
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          const v = board.get(x, y, z);
          if (v === 1) count1++;
          else if (v === 2) count2++;
        }
      }
    }
    // AI is whichever player has fewer or equal pieces (i.e. the one to move next)
    return count1 <= count2 ? 1 : 2;
  }

  // ============================================================
  //  Candidate Selection (spatial filtering for performance)
  // ============================================================
  private getCandidates(board: Board): AIMove[] {
    const all: AIMove[] = [];
    const hasPieces = this.boardHasPieces(board);

    if (!hasPieces) {
      // Empty board: just pick center
      all.push({ x: 6, y: 6, z: 2 });
      return all;
    }

    const checked = new Set<number>();

    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board.get(x, y, z) !== 0) continue;

          // For Medium: only consider cells on or adjacent to the focus area
          if (this.difficulty === "Medium") {
            // Check if this empty cell has any neighbor within 1 step in XY plane
            let hasNeighbor = false;
            for (const [dx, dy] of [[1,0],[0,1],[-1,0],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && board.get(nx, ny, z) !== 0) {
                hasNeighbor = true;
                break;
              }
            }
            if (!hasNeighbor) continue;
          }

          // For Hard: need the cell to be within 2 steps of any piece (checked below)
          if (this.difficulty === "Hard") {
            let near = false;
            for (let dz = -2; dz <= 2 && !near; dz++) {
              for (let dy = -2; dy <= 2 && !near; dy++) {
                for (let dx = -2; dx <= 2 && !near; dx++) {
                  if (dx === 0 && dy === 0 && dz === 0) continue;
                  const nx = x + dx, ny = y + dy, nz = z + dz;
                  if (nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && nz >= 0 && nz < LAYER_COUNT) {
                    if (board.get(nx, ny, nz) !== 0) near = true;
                  }
                }
              }
            }
            if (!near) continue;
          }

          const key = x * 10000 + y * 100 + z;
          if (!checked.has(key)) {
            checked.add(key);
            all.push({ x, y, z });
          }
        }
      }
    }

    // If no candidates found (shouldn't happen), fallback to all empty cells
    if (all.length === 0) {
      for (let z = 0; z < LAYER_COUNT; z++) {
        for (let y = 0; y < BOARD_SIZE; y++) {
          for (let x = 0; x < BOARD_SIZE; x++) {
            if (board.get(x, y, z) === 0) all.push({ x, y, z });
          }
        }
      }
    }

    return all;
  }

  private boardHasPieces(board: Board): boolean {
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board.get(x, y, z) !== 0) return true;
        }
      }
    }
    return false;
  }

  // ============================================================
  //  Core Heuristic Evaluator
  // ============================================================
  private evaluatePoint(
    board: Board,
    x: number, y: number, z: number,
    player: 1 | 2,
    directions: [number, number, number][]
  ): number {
    let totalScore = 0;

    for (const [dx, dy, dz] of directions) {
      // Count consecutive pieces in positive direction
      let count = 1; // The piece we would place
      let openEnds = 0;

      // Scan forward
      let fx = x + dx, fy = y + dy, fz = z + dz;
      while (fx >= 0 && fx < BOARD_SIZE && fy >= 0 && fy < BOARD_SIZE && fz >= 0 && fz < LAYER_COUNT) {
        const v = board.get(fx, fy, fz);
        if (v === player) {
          count++;
          fx += dx; fy += dy; fz += dz;
        } else if (v === 0) {
          openEnds++;
          break;
        } else {
          break;
        }
      }

      // Scan backward
      let bx = x - dx, by = y - dy, bz = z - dz;
      while (bx >= 0 && bx < BOARD_SIZE && by >= 0 && by < BOARD_SIZE && bz >= 0 && bz < LAYER_COUNT) {
        const v = board.get(bx, by, bz);
        if (v === player) {
          count++;
          bx -= dx; by -= dy; bz -= dz;
        } else if (v === 0) {
          openEnds++;
          break;
        } else {
          break;
        }
      }

      totalScore += this.patternScore(count, openEnds);
    }

    return totalScore;
  }

  private patternScore(count: number, openEnds: number): number {
    if (count >= 5) return SCORE_FIVE;
    switch (count) {
      case 4:
        return openEnds === 2 ? SCORE_LIVE_FOUR : openEnds === 1 ? SCORE_RUSH_FOUR : 0;
      case 3:
        return openEnds === 2 ? SCORE_LIVE_THREE : openEnds === 1 ? SCORE_SLEEP_THREE : 0;
      case 2:
        return openEnds === 2 ? SCORE_LIVE_TWO : openEnds === 1 ? SCORE_SLEEP_TWO : 0;
      case 1:
        return openEnds >= 1 ? SCORE_ONE : 0;
      default:
        return 0;
    }
  }

  /** Return thinking delay in ms based on difficulty. */
  private getThinkTime(): number {
    switch (this.difficulty) {
      case "Easy":
        return 200 + Math.random() * 300;
      case "Medium":
        return 100 + Math.random() * 200;
      case "Hard":
        return 50 + Math.random() * 150;
    }
  }
}
