export const BOARD_SIZE = 13;

// Runtime validation: board size must be odd for a proper center point
if (BOARD_SIZE % 2 !== 1) {
  throw new Error("BOARD_SIZE must be an odd number (got " + BOARD_SIZE + ")");
}

export const LAYER_COUNT = 6;
export const DEFAULT_LAYER_SPACING = 3.5;
export const MIN_LAYER_SPACING = 2.0;
export const MAX_LAYER_SPACING = 6.0;
export const PANEL_RATIO = 0.5;
export const PIECE_RADIUS = 0.42;
export const SAVE_SLOT_COUNT = 6;
export const QUICK_SAVE_INDEX = 5;


// Layer opacity constants for non-focus (ghost) rendering
export const GHOST_PIECE_OPACITY = 0.25;       // 3D ghost piece sprites in LeftPanel
export const GHOST_GRID_OPACITY = 0.4;         // 3D ghost layer grid lines in LeftPanel
export const GHOST_CONNECTOR_OPACITY = 0.35;   // 3D inter-layer connector lines in LeftPanel
export const HOVER_PIECE_OPACITY = 0.35;       // 2D hover ghost piece in RightPanel

export const COLOR_SELF_NORMAL = 0x00FF00;
export const COLOR_ENEMY_NORMAL = 0xFF0000;
export const COLOR_SELF_BLIND = 0x0088FF;
export const COLOR_ENEMY_BLIND = 0xFFCC00;
// Auxiliary element colors (for center dots, star points, crosshairs)
export const COLOR_AUX_RED = 0xCC0000;
export const COLOR_AUX_GREEN = 0x00FF00;
export const COLOR_AUX_BLUE = 0x0088FF;
export const COLOR_AUX_YELLOW = 0xFFCC00;
