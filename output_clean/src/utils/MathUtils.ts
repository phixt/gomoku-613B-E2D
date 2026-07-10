export interface Vector3Int {
  x: number;
  y: number;
  z: number;
}

// 13 base directions for 3D Gomoku
export const DIRECTIONS_3D: Vector3Int[] = [
// Axial
{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 },
// Face Diagonals
{ x: 1, y: 1, z: 0 }, { x: 1, y: -1, z: 0 },
{ x: 1, y: 0, z: 1 }, { x: 1, y: 0, z: -1 },
{ x: 0, y: 1, z: 1 }, { x: 0, y: 1, z: -1 },
// Body Diagonals
{ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: -1 },
{ x: 1, y: -1, z: 1 }, { x: 1, y: -1, z: -1 }];