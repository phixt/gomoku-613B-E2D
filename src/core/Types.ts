export type CellState = 0 | 1 | 2;

export interface Vector3Int {
  x: number;
  y: number;
  z: number;
}

export interface Theme {
  name: "dark" | "light";
  bgColor: number;
  gridColor: number;
  focusGridColor: number;
  ghostGridColor: number;
  auxLineColor: number;
}

export const DARK_THEME: Theme = {
  name: "dark",
  bgColor: 0x1a2629,
  gridColor: 0x3a5a5e,
  focusGridColor: 0xc8e0e4,
  ghostGridColor: 0x555555,
  auxLineColor: 0xff8c00,
};

export const LIGHT_THEME: Theme = {
  name: "light",
  bgColor: 0xe8f4f5,
  gridColor: 0xa0c0c4,
  focusGridColor: 0x2c4a4e,
  ghostGridColor: 0xaaaaaa,
  auxLineColor: 0xd0021b,
};