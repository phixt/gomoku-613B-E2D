// AIEngine.ts - 3D-aware heuristic AI opponent for Gomoku 613B-E2D
// Three difficulty levels differentiated by search scope, all using 13 3D directions.

import type { Board } from "../core/Board";
import { BOARD_SIZE, LAYER_COUNT } from "../core/Config";

export type Difficulty = "Easy" | "Medium" | "Hard";

export interface AIMove {
  x: number;
  y: number;
  z: number;
}

// ---- 13 Direction Vectors in 3D Space [dx, dy, dz] ----
const DIRECTIONS_3D: [number, number, number][] = [
  [1, 0, 0], [0, 1, 0], [0, 0, 1],           // X, Y, Z axes
  [1, 1, 0], [1, -1, 0],                       // XY diagonals
  [1, 0, 1], [1, 0, -1],                       // XZ diagonals
  [0, 1, 1], [0, 1, -1],                       // YZ diagonals
  [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], // 3D space diagonals
];

// ---- Heuristic Score Table (big gaps to ensure correct priority) ----
const SCORE_FIVE = 1000000;
const SCORE_LIVE_FOUR = 100000;
const SCORE_RUSH_FOUR = 10000;
const SCORE_LIVE_THREE = 10000;
const SCORE_SLEEP_THREE = 1000;
const SCORE_LIVE_TWO = 1000;
const SCORE_SLEEP_TWO = 100;
const SCORE_ONE = 10;

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
  //  PUBLIC think() -?all difficulties use DIRECTIONS_3D
  //  Difficulty is differentiated by candidate scope, not direction set.
  // ============================================================
  async think(board: Board): Promise<AIMove | null> {
    this.cancelled = false;

    if (this.difficulty === "Easy") {
      return this.thinkEasy(board);
    }

    const candidates = this.getCandidates(board);
    if (candidates.length === 0) return null;

    const aiPlayer = this.detectAIPlayer(board);
    const opponentPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;

    let bestMove: AIMove | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      if (this.cancelled) return null;

      const move = candidates[i];
      const attackScore = this.evaluatePoint(board, move.x, move.y, move.z, aiPlayer, DIRECTIONS_3D);
      const defenseScore = this.evaluatePoint(board, move.x, move.y, move.z, opponentPlayer, DIRECTIONS_3D);

      // Defense weighted higher -?blocking opponent's win is top priority
      const totalScore = attackScore + defenseScore * 1.1;

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestMove = move;
      }

      // Yield every 30 iterations to prevent UI freeze
      if (i % 30 === 0 && i > 0) {
        await new Promise<void>((r) => setTimeout(r, 0));
      }
    }

    await new Promise<void>((r) => setTimeout(r, this.getThinkTime()));
    return bestMove;
  }

  // ============================================================
  //  EASY: Random move with immediate 3D threat blocking
  // ============================================================
  private async thinkEasy(board: Board): Promise<AIMove | null> {
    const aiPlayer = this.detectAIPlayer(board);
    const opponentPlayer: 1 | 2 = aiPlayer === 1 ? 2 : 1;

    // 1. Block any opponent 4-in-a-row (using 3D directions)
    const blockMove = this.findImmediateThreat(board, opponentPlayer);
    if (blockMove) {
      await new Promise<void>((r) => setTimeout(r, this.getThinkTime()));
      return blockMove;
    }

    // 2. Pick a random cell near any existing piece (for a more interesting game)
    const candidates = this.getNearbyEmptyCells(board, 1);
    if (candidates.length > 0) {
      await new Promise<void>((r) => setTimeout(r, this.getThinkTime()));
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 3. Fallback: pure random
    const empty: AIMove[] = [];
    for (let z = 0; z < LAYER_COUNT; z++)
      for (let y = 0; y < BOARD_SIZE; y++)
        for (let x = 0; x < BOARD_SIZE; x++)
          if (board.get(x, y, z) === 0) empty.push({ x, y, z });
    if (empty.length === 0) return null;
    await new Promise<void>((r) => setTimeout(r, this.getThinkTime()));
    return empty[Math.floor(Math.random() * empty.length)];
  }

  // ============================================================
  //  Find a cell that blocks opponent's 4-in-a-row (3D-aware)
  // ============================================================
  private findImmediateThreat(board: Board, opponent: 1 | 2): AIMove | null {
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board.get(x, y, z) !== 0) continue;
          const score = this.evaluatePoint(board, x, y, z, opponent, DIRECTIONS_3D);
          if (score >= SCORE_RUSH_FOUR) return { x, y, z };
        }
      }
    }
    return null;
  }

  // ============================================================
  //  Detect AI's player number (the one with fewer pieces)
  // ============================================================
  private detectAIPlayer(board: Board): 1 | 2 {
    let c1 = 0, c2 = 0;
    for (let z = 0; z < LAYER_COUNT; z++)
      for (let y = 0; y < BOARD_SIZE; y++)
        for (let x = 0; x < BOARD_SIZE; x++) {
          const v = board.get(x, y, z);
          if (v === 1) c1++;
          else if (v === 2) c2++;
        }
    return c1 <= c2 ? 1 : 2;
  }

  // ============================================================
  //  Candidate Selection -?difficulty is differentiated HERE
  // ============================================================
  private getCandidates(board: Board): AIMove[] {
    if (!this.boardHasPieces(board)) {
      return [{ x: 6, y: 6, z: 2 }];
    }

    if (this.difficulty === "Medium") {
      // Medium: cells within 1 step of any existing piece (all layers)
      return this.getNearbyEmptyCells(board, 1);
    }

    // Hard: cells within 2 steps of any existing piece (spatial clustering)
    return this.getNearbyEmptyCells(board, 2);
  }

  /** Collect empty cells within `radius` steps of any placed piece. */
  private getNearbyEmptyCells(board: Board, radius: number): AIMove[] {
    const visited = new Set<number>();
    const result: AIMove[] = [];
    const key = (x: number, y: number, z: number) => x * 10000 + y * 100 + z;

    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          if (board.get(x, y, z) === 0) continue;

          // Found a piece -?add all empty cells within radius
          for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
              for (let dy = -radius; dy <= radius; dy++) {
                if (dx === 0 && dy === 0 && dz === 0) continue;
                const nx = x + dx, ny = y + dy, nz = z + dz;
                if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE || nz < 0 || nz >= LAYER_COUNT) continue;
                if (board.get(nx, ny, nz) !== 0) continue;
                const k = key(nx, ny, nz);
                if (visited.has(k)) continue;
                visited.add(k);
                result.push({ x: nx, y: ny, z: nz });
              }
            }
          }
        }
      }
    }

    return result;
  }

  private boardHasPieces(board: Board): boolean {
    for (let z = 0; z < LAYER_COUNT; z++)
      for (let y = 0; y < BOARD_SIZE; y++)
        for (let x = 0; x < BOARD_SIZE; x++)
          if (board.get(x, y, z) !== 0) return true;
    return false;
  }

  // ============================================================
  //  Core Heuristic Evaluator (3D, all 13 directions)
  // ============================================================
  private evaluatePoint(
    board: Board,
    x: number, y: number, z: number,
    player: 1 | 2,
    directions: [number, number, number][]
  ): number {
    let totalScore = 0;

    for (const [dx, dy, dz] of directions) {
      let count = 1;   // The piece we would place
      let openEnds = 0;

      // Scan forward
      let fx = x + dx, fy = y + dy, fz = z + dz;
      while (fx >= 0 && fx < BOARD_SIZE && fy >= 0 && fy < BOARD_SIZE && fz >= 0 && fz < LAYER_COUNT) {
        const v = board.get(fx, fy, fz);
        if (v === player) { count++; fx += dx; fy += dy; fz += dz; }
        else if (v === 0) { openEnds++; break; }
        else break;
      }

      // Scan backward
      let bx = x - dx, by = y - dy, bz = z - dz;
      while (bx >= 0 && bx < BOARD_SIZE && by >= 0 && by < BOARD_SIZE && bz >= 0 && bz < LAYER_COUNT) {
        const v = board.get(bx, by, bz);
        if (v === player) { count++; bx -= dx; by -= dy; bz -= dz; }
        else if (v === 0) { openEnds++; break; }
        else break;
      }

      totalScore += this.patternScore(count, openEnds);
    }

    return totalScore;
  }

  private patternScore(count: number, openEnds: number): number {
    if (count >= 5) return SCORE_FIVE;
    switch (count) {
      case 4: return openEnds === 2 ? SCORE_LIVE_FOUR : openEnds === 1 ? SCORE_RUSH_FOUR : 0;
      case 3: return openEnds === 2 ? SCORE_LIVE_THREE : openEnds === 1 ? SCORE_SLEEP_THREE : 0;
      case 2: return openEnds === 2 ? SCORE_LIVE_TWO : openEnds === 1 ? SCORE_SLEEP_TWO : 0;
      case 1: return openEnds >= 1 ? SCORE_ONE : 0;
      default: return 0;
    }
  }

  private getThinkTime(): number {
    switch (this.difficulty) {
      case "Easy":   return 200 + Math.random() * 300;
      case "Medium":  return 100 + Math.random() * 200;
      case "Hard":    return 50 + Math.random() * 150;
    }
  }
}
