import type { Board } from "./Board";
import { DIRECTIONS_3D } from "../utils/MathUtils";
import { BOARD_SIZE, LAYER_COUNT } from "./Config";

export interface PatternCell3D {
  x: number;
  y: number;
  z: number;
}

export interface Pattern3D {
  dx: number;
  dy: number;
  dz: number;
  count: number;
  openEnds: number;
  alive: boolean;
  cells: PatternCell3D[];
}

/** Check all 13 directions from (x, y, z) and return patterns found (count >= 2). */
export function checkPatterns3D(
  board: Board, x: number, y: number, z: number,
): Pattern3D[] {
  const state = board.get(x, y, z);
  if (state === 0) return [];

  const dirs: [number, number, number][] = DIRECTIONS_3D.map((d) => [d.x, d.y, d.z]);

  const results: Pattern3D[] = [];

  for (const [dx, dy, dz] of dirs) {
    const cells: PatternCell3D[] = [{ x, y, z }];
    let count = 1;

    let px = x + dx, py = y + dy, pz = z + dz;
    while (
      px >= 0 && px < BOARD_SIZE && py >= 0 && py < BOARD_SIZE && pz >= 0 && pz < LAYER_COUNT &&
      board.get(px, py, pz) === state
    ) { cells.push({ x: px, y: py, z: pz }); count++; px += dx; py += dy; pz += dz; }
    const e1 = px >= 0 && px < BOARD_SIZE && py >= 0 && py < BOARD_SIZE && pz >= 0 && pz < LAYER_COUNT && board.get(px, py, pz) === 0;

    let nx = x - dx, ny = y - dy, nz = z - dz;
    while (
      nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && nz >= 0 && nz < LAYER_COUNT &&
      board.get(nx, ny, nz) === state
    ) { cells.unshift({ x: nx, y: ny, z: nz }); count++; nx -= dx; ny -= dy; nz -= dz; }
    const e2 = nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && nz >= 0 && nz < LAYER_COUNT && board.get(nx, ny, nz) === 0;

    const oe = (e1 ? 1 : 0) + (e2 ? 1 : 0);
    if (count >= 2) results.push({ dx, dy, dz, count, openEnds: oe, alive: oe >= 2, cells });
  }
  return results;
}

/** Collect all unique patterns on a single layer. */
export function collectLayerPatterns3D(board: Board, z: number): Pattern3D[] {
  const dirs: [number, number, number][] = DIRECTIONS_3D.map((d) => [d.x, d.y, d.z]);
  const r: Pattern3D[] = [];

  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const s = board.get(x, y, z);
      if (s === 0) continue;
      for (const [dx, dy, dz] of dirs) {
        const px = x - dx, py = y - dy, pz = z - dz;
        if (px >= 0 && px < BOARD_SIZE && py >= 0 && py < BOARD_SIZE && pz >= 0 && pz < LAYER_COUNT && board.get(px, py, pz) === s) continue;
        const cells: PatternCell3D[] = [{ x, y, z }];
        let c = 1;
        let qx = x + dx, qy = y + dy, qz = z + dz;
        while (qx >= 0 && qx < BOARD_SIZE && qy >= 0 && qy < BOARD_SIZE && qz >= 0 && qz < LAYER_COUNT && board.get(qx, qy, qz) === s) {
          cells.push({ x: qx, y: qy, z: qz }); c++; qx += dx; qy += dy; qz += dz;
        }
        const e1 = qx >= 0 && qx < BOARD_SIZE && qy >= 0 && qy < BOARD_SIZE && qz >= 0 && qz < LAYER_COUNT && board.get(qx, qy, qz) === 0;
        const e2 = px >= 0 && px < BOARD_SIZE && py >= 0 && py < BOARD_SIZE && pz >= 0 && pz < LAYER_COUNT && board.get(px, py, pz) === 0;
        const oe = (e1 ? 1 : 0) + (e2 ? 1 : 0);
        if (c >= 2) r.push({ dx, dy, dz, count: c, openEnds: oe, alive: oe >= 2, cells });
      }
    }
  }
  return r;
}

export function checkWinPatterns(patterns: Pattern3D[]): boolean {
  return patterns.some((p) => p.count >= 5);
}

/** Check if the stone at (x,y,z) produces a win. Returns BLACK (1), WHITE (2), or 0. */
export function checkWinner(board: Board, x: number, y: number, z: number): 0 | 1 | 2 {
  const state = board.get(x, y, z);
  if (state === 0) return 0;
  return checkWinPatterns(checkPatterns3D(board, x, y, z)) ? state : 0;
}