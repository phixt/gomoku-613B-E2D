export type CellState = 0 | 1 | 2;

export const BLACK = 1;
export const WHITE = 2;

export interface Vector3Int {
  x: number;
  y: number;
  z: number;
}

/** 3D auxiliary line segment (world coords, Z pre-multiplied by layerSpacing). */
export interface Line3DData {
  startX: number; startY: number; startZ: number;
  endX: number;   endY: number;   endZ: number;
  color: number;
}

/** 3D highlight dot (enemy stones, empty-line-ends, etc.). */
export interface HighlightPoint3D {
  x: number; y: number; z: number;
  color: number;
}

export interface AuxData3D {
  lines: Line3DData[];
  points: HighlightPoint3D[];
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