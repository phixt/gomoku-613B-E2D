import type { CellState, Vector3Int } from "./Types";
import { BOARD_SIZE, LAYER_COUNT } from "./Config";

export class Board {
  private data: Uint8Array;
  private _size: number;
  private _layers: number;

  constructor(size: number = BOARD_SIZE, layers: number = LAYER_COUNT) {
    this._size = size;
    this._layers = layers;
    this.data = new Uint8Array(size * size * layers);
  }

  private index(x: number, y: number, z: number): number {
    return z * this._size * this._size + y * this._size + x;
  }

  get(x: number, y: number, z: number): CellState {
    if (x < 0 || x >= this._size || y < 0 || y >= this._size || z < 0 || z >= this._layers) {
      return 0;
    }
    return this.data[this.index(x, y, z)] as CellState;
  }

  set(x: number, y: number, z: number, state: CellState): void {
    if (x < 0 || x >= this._size || y < 0 || y >= this._size || z < 0 || z >= this._layers) {
      return;
    }
    this.data[this.index(x, y, z)] = state;
  }

  getAt(v: Vector3Int): CellState {
    return this.get(v.x, v.y, v.z);
  }

  setAt(v: Vector3Int, state: CellState): void {
    this.set(v.x, v.y, v.z, state);
  }

  forEach(fn: (x: number, y: number, z: number, state: CellState) => void): void {
    for (let z = 0; z < this._layers; z++) {
      for (let y = 0; y < this._size; y++) {
        for (let x = 0; x < this._size; x++) {
          fn(x, y, z, this.get(x, y, z));
        }
      }
    }
  }

  reset(): void {
    this.data.fill(0);
  }

  get size(): number {
    return this._size;
  }

  get layers(): number {
    return this._layers;
  }
}