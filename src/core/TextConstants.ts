// src/core/TextConstants.ts
// 所有 UI 文本常量集中管理，避免编码混乱

export const UI_TEXT = {
    // 游戏状态
    BLACK_TURN: "黑方回合",
    WHITE_TURN: "白方回合",
    AI_THINKING: "AI 思考中",
    
    // 存档提示
    SAVE_SUCCESS: (slot: number) => `已保存到存档 ${slot}`,
    LOAD_SUCCESS: (slot: number) => `已读取存档 ${slot}`,
    DELETE_SUCCESS: (slot: number) => `已删除存档 ${slot}`,
    NO_SAVE: "没有可读取的存档",
    INVALID_SAVE: "无效的存档数据",
    
    // 确认对话框
    CONFIRM_DELETE: (slot: number) => `确定要删除存档 ${slot} 吗？此操作不可恢复。`,
    CONFIRM_OVERWRITE: (slot: number) => `确定要覆盖存档 ${slot} 吗？`,
    
    // 按钮文本
    BTN_START_GAME: "开始游戏",
    BTN_GUIDE: "快捷键说明",
    BTN_BACK: "返回标题",
    BTN_RESUME: "继续游戏",
    BTN_RESTART: "重新开始",
    BTN_SAVE: "保存进度",
    BTN_LOAD: "加载进度",
    
    // 设置
    SETTING_MODE: "对战模式",
    SETTING_PVP: "双人对战 (PvP)",
    SETTING_PVE: "人机对战 (PvE)",
    SETTING_DIFFICULTY: "AI难度",
    SETTING_COLOR: "玩家颜色",
    SETTING_BLACK: "执黑 (先手)",
    SETTING_WHITE: "执白 (后手)",
    SETTING_VOLUME: "音量",
    
    // 快捷键说明
    KEY_Q: "旋转 3D 视角",
    KEY_W: "推拉 3D 视角",
    KEY_A: "切换层级 (循环)",
    KEY_Z: "调整层间距",
    KEY_F: "翻转 2D 主战场",
    KEY_H: "开关辅助线",
    KEY_T: "切换 亮/暗 主题",
    KEY_R: "暂停/菜单",
    KEY_X: "复位层间距",
    KEY_V: "切换色弱模式 (蓝/黄)",
    
    // 槽位菜单
    SLOT_READ: "读取",
    SLOT_OVERWRITE: "覆盖",
    SLOT_QUICK: "存为快速档",
    SLOT_FILL: "填写",
    SLOT_DELETE: "删除",
    SLOT_CANCEL: "取消",
    
    // 确认对话框
    CONFIRM_TITLE: "确认操作",
    CONFIRM_MSG: "确定要执行此操作吗？",
    CONFIRM_YES: "确定",
    CONFIRM_NO: "取消",
    
    // 其他
    EMPTY_SLOT: "空",
    OCCUPIED_SLOT: "已存档",
    QUICK_SAVE_LABEL: "快速存档",
} as const;