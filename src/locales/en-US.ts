const enUS = {
  // Game state & turns
  BLACK_TURN: "Black's Turn",
  WHITE_TURN: "White's Turn",
  AI_THINKING: "AI Thinking...",

  // Save system (parametric)
  SAVE_SUCCESS: "Saved to Slot {0}",
  LOAD_SUCCESS: "Loaded Slot {0}",
  DELETE_SUCCESS: "Deleted Slot {0}",
  NO_SAVE: "No save data available",
  INVALID_SAVE: "Invalid save data",
  SAVE_LOADED: "Save loaded",
  SAVE_FAILED: "Load failed",
  CONFIRM_DELETE: "Delete Slot {0}? This cannot be undone.",
  CONFIRM_OVERWRITE: "Overwrite Slot {0}?",
  EMPTY_SLOT: "Empty",
  OCCUPIED_SLOT: "Occupied",
  QUICK_SAVE_LABEL: "Quick Save",
  SAVE_SLOT_LABEL: "Slot {0}",
  SLOT_MOVES: "{0} moves",

  // Buttons & menus
  BTN_START_GAME: "Start Game",
  BTN_NEW_GAME: "New Game",
  BTN_GUIDE: "Shortcut Keys",
  BTN_BACK: "Back to Title",
  BTN_RESUME: "Resume",
  BTN_RESTART: "Restart",
  BTN_SAVE: "Save Progress",
  BTN_LOAD: "Load Progress",
  SLOT_READ: "Load",
  SLOT_OVERWRITE: "Overwrite",
  SLOT_QUICK: "Quick Save",
  SLOT_FILL: "Import",
  SLOT_DELETE: "Delete",
  SLOT_CANCEL: "Cancel",
  CONFIRM_TITLE: "Confirm",
  CONFIRM_MSG: "Are you sure?",
  CONFIRM_YES: "Yes",
  CONFIRM_NO: "No",

  // Game settings
  SETTING_TITLE: "Game Settings",
  SETTING_MODE: "Game Mode",
  SETTING_PVP: "Player vs Player (PvP)",
  SETTING_PVE: "Player vs AI (PvE)",
  SETTING_DIFFICULTY: "AI Difficulty",
  SETTING_DIFF_EASY: "Easy",
  SETTING_DIFF_MEDIUM: "Medium",
  SETTING_DIFF_HARD: "Hard",
  SETTING_COLOR: "Player Color",
  SETTING_BLACK: "Black (First)",
  SETTING_WHITE: "White (Second)",
  SETTING_VOLUME: "Volume",
  MUTE_ON: "Muted",
  MUTE_OFF: "Unmuted",

  // Shortcut key descriptions
  KEY_Q: "Rotate 3D View",
  KEY_W: "Zoom 3D View",
  KEY_A: "Switch Layer (Cycle)",
  KEY_Z: "Adjust Layer Spacing",
  KEY_F: "Flip 2D Board",
  KEY_H: "Toggle Guide Lines",
  KEY_T: "Toggle Light/Dark Theme",
  KEY_R: "Pause / Menu",
  KEY_X: "Reset Layer Spacing",
  KEY_V: "Toggle Colorblind Mode (Blue/Yellow)",
  KEY_M: "Toggle Mute",

  // Colorblind mode
  COLORBLIND_ON: "Colorblind Mode: ON (Blue/Yellow)",
  COLORBLIND_OFF: "Colorblind Mode: OFF (Red/Green)",

  // Misc
  PASTE_PLACEHOLDER: "Paste Base64 save data",

  // Replay
  BTN_REPLAY: "Replay",
  BTN_REPLAY_PREV: "←Prev",
  BTN_REPLAY_NEXT: "Next→",
  BTN_REPLAY_EXIT: "Exit",
  REPLAY_ENTER: "Replay Mode - {0} moves",
  REPLAY_EXIT: "Replay exited",

  // Save validation
  SAVE_INVALID_STRUCTURE: "Invalid save data structure",
  SAVE_INVALID_DIMENSIONS: "Board size mismatch",

  // Game over
  BLACK_WIN: "Black Wins!",
  WHITE_WIN: "White Wins!",
  GAME_OVER_SUBTITLE: "{0} moves in total",
  // Language
  SETTING_LANGUAGE: "Language",

  // Pause menu
  PAUSE_TITLE: "Paused",

  // Mouse hints
  MOUSE_HOVER: "🖱 Hover: View guidelines",
  MOUSE_CLICK: "🖱 Click: Place stone",
  MOUSE_WHEEL: "🖱 Scroll: Rotate 3D view",

  // Guide screen
  GUIDE_TIP_PREFIX: "💡 Tip: After game starts, press ",
  GUIDE_TIP_SUFFIX: " to zoom out",

  // Save slots area
  SAVE_SLOTS_TITLE: "Save Slots",
  SLOT_HINT: "Press L to quick-load latest save",
  MUTE_HINT: "Press M to mute/unmute",

  // Level system
  BTN_LEVEL_MODE: "Level Mode",
  LEVEL_SELECT_TITLE: "Select Level",

  // Custom Sandbox
  BTN_CUSTOM_SANDBOX: "Custom Sandbox",
  CUSTOM_SANDBOX_TITLE: "Custom Sandbox",
  BOARD_SIZE_LABEL: "Board Size (Odd)",
  LAYER_COUNT_LABEL: "Layers",
  BTN_START_CUSTOM: "Start Custom Game",


  WIN_LENGTH_LABEL: "Win Length",

  // Swap2
  SWAP_PROMPT: "White: Choose Swap or Pass",
  BTN_SWAP: "Swap",
  BTN_PASS: "Pass",
  SWAP_DONE: "Colors swapped! You are now Black.",
  PASS_DONE: "No swap. White continues.",

} as const;

export default enUS;