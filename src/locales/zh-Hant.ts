// zh-Hant.ts
const zhHant = {
  // Game state & turns
  BLACK_TURN: "黑方回合",
  WHITE_TURN: "白方回合",
  AI_THINKING: "AI 思考中",

  // Save system (parametric)
  SAVE_SUCCESS: "已儲存到存檔 {0}",
  LOAD_SUCCESS: "已讀取存檔 {0}",
  DELETE_SUCCESS: "已刪除存檔 {0}",
  NO_SAVE: "沒有可讀取的存檔",
  INVALID_SAVE: "無效的存檔資料",
  SAVE_LOADED: "已載入存檔",
  SAVE_FAILED: "載入失敗",
  CONFIRM_DELETE: "確定要刪除存檔 {0} 嗎？此操作不可復原。",
  CONFIRM_OVERWRITE: "確定要覆蓋存檔 {0} 嗎？",
  EMPTY_SLOT: "空",
  OCCUPIED_SLOT: "已存檔",
  QUICK_SAVE_LABEL: "快速存檔",
  SAVE_SLOT_LABEL: "存檔 {0}",
  SLOT_MOVES: "{0} 步",

  // Buttons & menus
  BTN_START_GAME: "開始遊戲",
  BTN_NEW_GAME: "開始新遊戲",
  BTN_GUIDE: "快捷鍵說明",
  BTN_BACK: "返回標題",
  BTN_RESUME: "回到遊戲",
  BTN_RESTART: "重新開始",
  BTN_SAVE: "儲存進度",
  BTN_LOAD: "載入進度",
  SLOT_READ: "讀取",
  SLOT_OVERWRITE: "覆蓋",
  SLOT_QUICK: "存為快速存檔",
  SLOT_FILL: "填寫",
  SLOT_DELETE: "刪除",
  SLOT_CANCEL: "取消",
  CONFIRM_TITLE: "確認操作",
  CONFIRM_MSG: "確定要執行此操作嗎？",
  CONFIRM_YES: "確定",
  CONFIRM_NO: "取消",

  // Game settings
  SETTING_TITLE: "遊戲設定",
  SETTING_MODE: "對戰模式",
  SETTING_PVP: "雙人對戰 (PvP)",
  SETTING_PVE: "人機對戰 (PvE)",
  SETTING_DIFFICULTY: "AI 難度",
  SETTING_DIFF_EASY: "簡單",
  SETTING_DIFF_MEDIUM: "中等",
  SETTING_DIFF_HARD: "困難",
  SETTING_COLOR: "玩家顏色",
  SETTING_BLACK: "執黑 (先手)",
  SETTING_WHITE: "執白 (後手)",
  SETTING_VOLUME: "音量",
  MUTE_ON: "已靜音",
  MUTE_OFF: "已取消靜音",

  // Shortcut key descriptions
  KEY_Q: "旋轉 3D 視角",
  KEY_W: "推拉 3D 視角",
  KEY_A: "切換層級 (循環)",
  KEY_Z: "調整層間距",
  KEY_F: "翻轉 2D 主戰場",
  KEY_H: "開關輔助線",
  KEY_T: "切換 亮/暗 主題",
  KEY_R: "暫停/選單",
  KEY_X: "重設層間距",
  KEY_V: "切換色弱模式 (藍/黃)",
  KEY_M: "切換人機模式",

  // Colorblind mode
  COLORBLIND_ON: "色弱模式已開啟 (藍/黃)",
  COLORBLIND_OFF: "色弱模式已關閉 (紅/綠)",

  // Misc
  PASTE_PLACEHOLDER: "貼上 Base64 存檔資料",

  // Replay
  BTN_REPLAY: "復盤",
  BTN_REPLAY_PREV: "←上一步",
  BTN_REPLAY_NEXT: "下一步→",
  BTN_REPLAY_EXIT: "退出",
  REPLAY_ENTER: "復盤模式 - 共 {0} 步",
  REPLAY_EXIT: "已退出復盤模式",

  // Save validation
  SAVE_INVALID_STRUCTURE: "存檔資料結構無效",
  SAVE_INVALID_DIMENSIONS: "存檔棋盤尺寸不符",

  // Game over
  BLACK_WIN: "黑方獲勝！",
  WHITE_WIN: "白方獲勝！",
  GAME_OVER_SUBTITLE: "本局共 {0} 步",

  // Language
  SETTING_LANGUAGE: "語言",

  // Pause menu
  PAUSE_TITLE: "暫停",

  // Mouse hints
  MOUSE_HOVER: "🖱滑鼠懸停：查看輔助線",
  MOUSE_CLICK: "🖱滑鼠點擊：目前面落子",
  MOUSE_WHEEL: "🖱滑鼠滾輪：旋轉 3D 視角",

  // Guide screen
  GUIDE_TIP_PREFIX: "💡 遊戲開始後，按 ",
  GUIDE_TIP_SUFFIX: " 拉遠視角",

  // Save slots area
  SAVE_SLOTS_TITLE: "存檔槽位",
  SLOT_HINT: "按 L 快速讀取最新存檔",
  MUTE_HINT: "按 M 靜音/取消靜音",

  // Level system
  BTN_LEVEL_MODE: "關卡模式",
  LEVEL_SELECT_TITLE: "關卡選擇",

  // Custom Sandbox
  BTN_CUSTOM_SANDBOX: "自訂沙盒",
  CUSTOM_SANDBOX_TITLE: "自訂沙盒",
  BOARD_SIZE_LABEL: "棋盤規模 (奇數)",
  LAYER_COUNT_LABEL: "層數",
  BTN_START_CUSTOM: "開始自訂對局",


  WIN_LENGTH_LABEL: "獲勝連子數",

  // Swap2
  SWAP_PROMPT: "白方：選擇交換或跳過",
  BTN_SWAP: "交換",
  BTN_PASS: "跳過",
  SWAP_DONE: "顏色已交換！你現在是黑方。",
  PASS_DONE: "未交換。白方繼續。",
  // Opening rules
  GAME_RULE_LABEL: "開局規則",
  RULE_STANDARD: "標準五子棋",
  RULE_SWAP2: "Swap2 (開局交換)",

  // Swap decision modal
  SWAP_DECISION_TITLE: "開局交換決定",
  SWAP_DECISION_MSG: "白方是否選擇交換顏色？",

  LEVEL_LOADING: "正在載入: {0}",
  LEVEL_STARTING: "正在開始: {0}",

  SLOT_RULE_GOMOKU: "標準",
  SLOT_RULE_SWAP2: "Swap2",

} as const;

export default zhHant;