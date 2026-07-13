const zhCN = {
  // Game state & turns
  BLACK_TURN: "黑方回合",
  WHITE_TURN: "白方回合",
  AI_THINKING: "AI 思考中",

  // Save system (parametric)
  SAVE_SUCCESS: "已保存到存档 {0}",
  LOAD_SUCCESS: "已读取存档 {0}",
  DELETE_SUCCESS: "已删除存档 {0}",
  NO_SAVE: "没有可读取的存档",
  INVALID_SAVE: "无效的存档数据",
  SAVE_LOADED: "已加载存档",
  SAVE_FAILED: "加载失败",
  CONFIRM_DELETE: "确定要删除存档 {0} 吗？此操作不可恢复。",
  CONFIRM_OVERWRITE: "确定要覆盖存档 {0} 吗？",
  EMPTY_SLOT: "空",
  OCCUPIED_SLOT: "已存档",
  QUICK_SAVE_LABEL: "快速存档",
  SAVE_SLOT_LABEL: "存档 {0}",
  SLOT_MOVES: "{0} 步",

  // Buttons & menus
  BTN_START_GAME: "开始游戏",
  BTN_NEW_GAME: "开始新游戏",
  BTN_GUIDE: "快捷键说明",
  BTN_BACK: "返回标题",
  BTN_RESUME: "回到游戏",
  BTN_RESTART: "重新开始",
  BTN_SAVE: "保存进度",
  BTN_LOAD: "加载进度",
  SLOT_READ: "读取",
  SLOT_OVERWRITE: "覆盖",
  SLOT_QUICK: "存为快速存档",
  SLOT_FILL: "填写",
  SLOT_DELETE: "删除",
  SLOT_CANCEL: "取消",
  CONFIRM_TITLE: "确认操作",
  CONFIRM_MSG: "确定要执行此操作吗？",
  CONFIRM_YES: "确定",
  CONFIRM_NO: "取消",

  // Game settings
  SETTING_TITLE: "游戏设置",
  SETTING_MODE: "对战模式",
  SETTING_PVP: "双人对战 (PvP)",
  SETTING_PVE: "人机对战 (PvE)",
  SETTING_DIFFICULTY: "AI难度",
  SETTING_DIFF_EASY: "简单",
  SETTING_DIFF_MEDIUM: "中等",
  SETTING_DIFF_HARD: "困难",
  SETTING_COLOR: "玩家颜色",
  SETTING_BLACK: "执黑 (先手)",
  SETTING_WHITE: "执白 (后手)",
  SETTING_VOLUME: "音量",
  MUTE_ON: "已静音",
  MUTE_OFF: "已取消静音",

  // Shortcuts Legend
  LEGEND_BASE: "对战模式",
  LEGEND_REPLAY: "复盘模式",
  LEGEND_PAUSE: "暂停/菜单",
  LEGEND_BASE_REPLAY: "对战+复盘",
  LEGEND_BASE_PAUSE: "对战+暂停",
  LEGEND_GLOBAL: "全局（三种模式）",

  // Shortcuts
  KEY_Q: "旋转 3D 视角",
  KEY_W: "推拉 3D 视角",
  KEY_A: "切换层级 (循环)",
  KEY_Z: "调整层间距",
  KEY_X: "复位层间距",
  KEY_F: "翻转 2D 棋盘",
  KEY_V: "切换色弱模式",
  KEY_H: "开关辅助线",
  KEY_R: "重新开始对局",
  KEY_T: "切换亮/暗主题",
  KEY_M: "全局静音",
  KEY_ESC: "暂停 / 呼出菜单 或 关闭菜单/返回",
  KEY_REPLAY_PREV_NEXT: "上一步 / 下一步",
  KEY_SAVE_PAUSE: "存档（暂停下）",
  KEY_LOAD_ANY: "读档（开始/暂停页面均可）",
  KEY_GUIDE: "进入快捷键说明（指南页）",
  KEY_BACK_TITLE: "返回标题（暂停界面）",

  // Colorblind mode
  COLORBLIND_ON: "色弱模式已开启 (蓝/黄)",
  COLORBLIND_OFF: "色弱模式已关闭 (红/绿)",

  // Misc
  PASTE_PLACEHOLDER: "粘贴 Base64 存档数据",

  // Replay
  BTN_REPLAY: "复盘",
  BTN_REPLAY_PREV: "←上一步",
  BTN_REPLAY_NEXT: "下一步→",
  BTN_REPLAY_EXIT: "退出",
  REPLAY_ENTER: "复盘模式 - 共 {0} 步",
  REPLAY_EXIT: "已退出复盘模式",

  // Save validation
  SAVE_INVALID_STRUCTURE: "存档数据结构无效",
  SAVE_INVALID_DIMENSIONS: "存档棋盘尺寸不匹配",

  // Game over
  BLACK_WIN: "黑方获胜！",
  WHITE_WIN: "白方获胜！",
  GAME_OVER_SUBTITLE: "本局共 {0} 步",
  // Language
  SETTING_LANGUAGE: "语言",

  // Pause menu
  PAUSE_TITLE: "暂停",

  // Mouse hints
  MOUSE_HOVER: "🖱鼠标悬停：查看辅助线",
  MOUSE_CLICK: "🖱鼠标点击：当前面落子",
  MOUSE_WHEEL: "🖱鼠标滚轮：旋转 3D 视角",

  // Guide screen
  GUIDE_TIP_PREFIX: "💡 游戏开始后，按 ",
  GUIDE_TIP_SUFFIX: " 拉远视角",

  // Save slots area
  SAVE_SLOTS_TITLE: "存档槽位",
  SLOT_HINT: "按 L 快速读取最新存档",
  MUTE_HINT: "按 M 静音/取消静音",

  // Level system
  BTN_LEVEL_MODE: "关卡模式",
  LEVEL_SELECT_TITLE: "关卡选择",

  // Custom Sandbox
  BTN_CUSTOM_SANDBOX: "自定义沙盒",
  CUSTOM_SANDBOX_TITLE: "自定义沙盒",
  BOARD_SIZE_LABEL: "棋盘规模 (奇数)",
  LAYER_COUNT_LABEL: "层数",
  BTN_START_CUSTOM: "开始自定义对局",


  WIN_LENGTH_LABEL: "获胜连子数",

  // Swap2
  SWAP_PROMPT: "白方：选择交换或跳过",
  BTN_SWAP: "交换 (Swap)",
  BTN_PASS: "不交换 (Pass)",
  SWAP_DONE: "颜色已交换！你现在是黑方。",
  PASS_DONE: "未交换。白方继续。",


  // Opening rules
  GAME_RULE_LABEL: "开局规则",
  RULE_STANDARD: "标准五子棋",
  RULE_SWAP2: "Swap2 (开局交换)",

  // Swap decision modal
  SWAP_DECISION_TITLE: "开局交换决定",
  SWAP_DECISION_MSG: "白方是否选择交换颜色？",

  LEVEL_LOADING: "正在加载: {0}",
  LEVEL_STARTING: "开始: {0}",

  SLOT_RULE_GOMOKU: "标准",
  SLOT_RULE_SWAP2: "Swap2",

  LEVEL_TUTORIAL: "9x9 教程关",
  LEVEL_RESIDUAL: "13x13 残局挑战",

} as const;

export default zhCN;