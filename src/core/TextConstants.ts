// src/core/TextConstants.ts
// 集中管理所有 UI 文本，彻底消除硬编码中文导致的编码乱码问题
// 
// 【术语统一说明】
// 1. "辅助线"：统一替代 "战术辅助线"、"战术线"、"开关辅助线"。
// 2. "快速存档"：名词统一替代 "快速档"；动词统一为 "存为快速存档" (替代 "存为快速档")。
// 3. "双人对战"：统一替代 "玩家对战模式"。
// 4. "色弱模式"：提示语统一为完整句式 "色弱模式已开启 (蓝/黄)" / "色弱模式已关闭 (红/绿)"。
// 5. "存档操作"：统一使用 "已保存到存档"、"已读取存档"、"已删除存档"。

export const UI_TEXT = {
    // ================= 游戏状态与回合 =================
    BLACK_TURN: "黑方回合",
    WHITE_TURN: "白方回合",
    AI_THINKING: "AI 思考中",
    
    // ================= 存档系统 (带变量的函数) =================
    // 注意：调用时需传入槽位号或名称，如 UI_TEXT.SAVE_SUCCESS(1) 或 UI_TEXT.SAVE_SUCCESS("快速存档")
    SAVE_SUCCESS: (slot: number | string) => `已保存到存档 ${slot}`,
    LOAD_SUCCESS: (slot: number | string) => `已读取存档 ${slot}`,
    DELETE_SUCCESS: (slot: number | string) => `已删除存档 ${slot}`,
    
    NO_SAVE: "没有可读取的存档",
    INVALID_SAVE: "无效的存档数据",
    SAVE_LOADED: "已加载存档",
    SAVE_FAILED: "加载失败",
    
    CONFIRM_DELETE: (slot: number | string) => `确定要删除存档 ${slot} 吗？此操作不可恢复。`,
    CONFIRM_OVERWRITE: (slot: number | string) => `确定要覆盖存档 ${slot} 吗？`,
    
    EMPTY_SLOT: "空",
    OCCUPIED_SLOT: "已存档",
    QUICK_SAVE_LABEL: "快速存档", // 替代 "快速档"
    SAVE_SLOT_LABEL: (index: number) => `存档 ${index}`,

    // ================= 按钮与菜单 =================
    BTN_START_GAME: "开始游戏",
    BTN_NEW_GAME: "开始新游戏",
    BTN_GUIDE: "快捷键说明",
    BTN_BACK: "返回标题",
    BTN_RESUME: "回到游戏", // 替代 "继续游戏"
    BTN_RESTART: "重新开始",
    BTN_SAVE: "保存进度",
    BTN_LOAD: "加载进度",
    
    SLOT_READ: "读取",
    SLOT_OVERWRITE: "覆盖",
    SLOT_QUICK: "存为快速存档", // 替代 "存为快速档"
    SLOT_FILL: "填写",
    SLOT_DELETE: "删除",
    SLOT_CANCEL: "取消",
    
    CONFIRM_TITLE: "确认操作",
    CONFIRM_MSG: "确定要执行此操作吗？",
    CONFIRM_YES: "确定",
    CONFIRM_NO: "取消",

    // ================= 游戏设置 =================
    SETTING_TITLE: "游戏设置",
    SETTING_MODE: "对战模式",
    SETTING_PVP: "双人对战 (PvP)", // 替代 "玩家对战模式"
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

    // ================= 快捷键说明 =================
    KEY_Q: "旋转 3D 视角",
    KEY_W: "推拉 3D 视角",
    KEY_A: "切换层级 (循环)",
    KEY_Z: "调整层间距",
    KEY_F: "翻转 2D 主战场",
    KEY_H: "开关辅助线", // 替代 "开关战术辅助线"
    KEY_T: "切换 亮/暗 主题",
    KEY_R: "暂停/菜单",
    KEY_X: "复位层间距",
    KEY_V: "切换色弱模式 (蓝/黄)", // 替代 "切换色弱模式"
    KEY_M: "切换人机模式",

    // ================= 色弱模式提示 =================
    COLORBLIND_ON: "色弱模式已开启 (蓝/黄)", // 替代 "模式已开启" + "蓝" + "黄"
    COLORBLIND_OFF: "色弱模式已关闭 (红/绿)", // 替代 "色弱模式已关闭" + "红" + "绿"

    // ================= 其他 =================
    PASTE_PLACEHOLDER: "粘贴 Base64 存档数据", // 替代 "粘贴" + "存档数据"

    // ================= replay =================
    BTN_REPLAY: "复盘",
    BTN_REPLAY_PREV: "上一步",
    BTN_REPLAY_NEXT: "下一步",
    BTN_REPLAY_EXIT: "退出",
    REPLAY_ENTER: "复盘模式 - 共 {0} 步",
    REPLAY_EXIT: "已退出复盘模式",

    // ================= save validation =================
    SAVE_INVALID_STRUCTURE: "存档数据结构无效",
    SAVE_INVALID_DIMENSIONS: "存档棋盘尺寸不匹配",

    // ================= game over =================
    BLACK_WIN: "黑方获胜！",
    WHITE_WIN: "白方获胜！",
    GAME_OVER_SUBTITLE: (moves: number) => `本局共 ${moves} 步`,
} as const;