import type { CellState, Vector3Int } from "./Types";

const BOARD_SIZE = 13;
const LAYER_COUNT = 6;
const CELL_TOTAL = BOARD_SIZE * BOARD_SIZE * LAYER_COUNT; // 1014

export class Board {
  private data: Uint8Array;

  constructor() {
    this.data = new Uint8Array(CELL_TOTAL);
  }

  private index(x: number, y: number, z: number): number {
    return z * BOARD_SIZE * BOARD_SIZE + y * BOARD_SIZE + x;
  }

  get(x: number, y: number, z: number): CellState {
    return this.data[this.index(x, y, z)] as CellState;
  }

  set(x: number, y: number, z: number, state: CellState): void {
    this.data[this.index(x, y, z)] = state;
  }

  getAt(v: Vector3Int): CellState {
    return this.get(v.x, v.y, v.z);
  }

  setAt(v: Vector3Int, state: CellState): void {
    this.set(v.x, v.y, v.z, state);
  }

  forEach(fn: (x: number, y: number, z: number, state: CellState) => void): void {
    for (let z = 0; z < LAYER_COUNT; z++) {
      for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
          fn(x, y, z, this.get(x, y, z));
        }
      }
    }
  }

  reset(): void {
    this.data.fill(0);
  }

  get size(): number {
    return BOARD_SIZE;
  }

  get layers(): number {
    return LAYER_COUNT;
  }
}