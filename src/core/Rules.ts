import type { Board } from "./Board";

export interface PatternCell {
  x: number;
  y: number;
}

export interface Pattern {
  count: number;
  openEnds: number;
  alive: boolean;
  cells: PatternCell[];
}

const BOARD_SIZE = 13;

/**
 * Check all 4 directions from (x, y, z) for consecutive same-color stones
 * and return the patterns found.  Only patterns with count >= 2 are reported.
 */
export function checkPatterns(
  board: Board,
  x: number,
  y: number,
  z: number,
): Pattern[] {
  const state = board.get(x, y, z);
  if (state === 0) return [];

  const dirs: [number, number][] = [
    [1, 0],  // horizontal
    [0, 1],  // vertical
    [1, 1],  // diagonal ↘
    [1, -1], // diagonal ↗
  ];

  const results: Pattern[] = [];

  for (const [dx, dy] of dirs) {
    const cells: PatternCell[] = [{ x, y }];
    let count = 1;

    // Positive direction
    let px = x + dx;
    let py = y + dy;
    while (
      px >= 0 && px < BOARD_SIZE &&
      py >= 0 && py < BOARD_SIZE &&
      board.get(px, py, z) === state
    ) {
      cells.push({ x: px, y: py });
      count++;
      px += dx;
      py += dy;
    }
    const end1Open =
      px >= 0 && px < BOARD_SIZE &&
      py >= 0 && py < BOARD_SIZE &&
      board.get(px, py, z) === 0;

    // Negative direction
    let nx = x - dx;
    let ny = y - dy;
    while (
      nx >= 0 && nx < BOARD_SIZE &&
      ny >= 0 && ny < BOARD_SIZE &&
      board.get(nx, ny, z) === state
    ) {
      cells.unshift({ x: nx, y: ny });
      count++;
      nx -= dx;
      ny -= dy;
    }
    const end2Open =
      nx >= 0 && nx < BOARD_SIZE &&
      ny >= 0 && ny < BOARD_SIZE &&
      board.get(nx, ny, z) === 0;

    const openEnds = (end1Open ? 1 : 0) + (end2Open ? 1 : 0);

    if (count >= 2) {
      results.push({
        count,
        openEnds,
        alive: openEnds >= 2,
        cells,
      });
    }
  }

  return results;
}

/**
 * Determine if a pattern represents a winning play.
 */
export function isWin(pattern: Pattern): boolean {
  return pattern.count >= 5;
}