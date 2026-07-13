const jaJP = {
  // Game state & turns
  BLACK_TURN: "黒の番",
  WHITE_TURN: "白の番",
  AI_THINKING: "AI 思考中",

  // Save system (parametric)
  SAVE_SUCCESS: "スロット {0} に保存しました",
  LOAD_SUCCESS: "スロット {0} を読み込みました",
  DELETE_SUCCESS: "スロット {0} を削除しました",
  NO_SAVE: "読み込めるセーブデータがありません",
  INVALID_SAVE: "無効なセーブデータ",
  SAVE_LOADED: "セーブデータを読み込みました",
  SAVE_FAILED: "読み込みに失敗しました",
  CONFIRM_DELETE: "スロット {0} を削除しますか？この操作は元に戻せません。",
  CONFIRM_OVERWRITE: "スロット {0} を上書きしますか？",
  EMPTY_SLOT: "空",
  OCCUPIED_SLOT: "保存済み",
  QUICK_SAVE_LABEL: "クイックセーブ",
  SAVE_SLOT_LABEL: "スロット {0}",
  SLOT_MOVES: "{0} 手",

  // Buttons & menus
  BTN_START_GAME: "ゲーム開始",
  BTN_NEW_GAME: "新しいゲーム",
  BTN_GUIDE: "ショートカットキー",
  BTN_BACK: "タイトルに戻る",
  BTN_RESUME: "ゲームに戻る",
  BTN_RESTART: "最初から",
  BTN_SAVE: "セーブ",
  BTN_LOAD: "ロード",
  SLOT_READ: "読み込み",
  SLOT_OVERWRITE: "上書き",
  SLOT_QUICK: "クイックセーブ",
  SLOT_FILL: "インポート",
  SLOT_DELETE: "削除",
  SLOT_CANCEL: "キャンセル",
  CONFIRM_TITLE: "確認",
  CONFIRM_MSG: "この操作を実行しますか？",
  CONFIRM_YES: "はい",
  CONFIRM_NO: "いいえ",

  // Game settings
  SETTING_TITLE: "ゲーム設定",
  SETTING_MODE: "対戦モード",
  SETTING_PVP: "二人対戦 (PvP)",
  SETTING_PVE: "CPU対戦 (PvE)",
  SETTING_DIFFICULTY: "AI 難易度",
  SETTING_DIFF_EASY: "簡単",
  SETTING_DIFF_MEDIUM: "普通",
  SETTING_DIFF_HARD: "難しい",
  SETTING_COLOR: "プレイヤーの色",
  SETTING_BLACK: "黒 (先手)",
  SETTING_WHITE: "白 (後手)",
  SETTING_VOLUME: "音量",
  MUTE_ON: "ミュート中",
  MUTE_OFF: "ミュート解除",

  // Shortcut key descriptions
  KEY_Q: "3D 視点を回転",
  KEY_W: "3D 視点をズーム",
  KEY_A: "レイヤー切り替え (循環)",
  KEY_Z: "レイヤー間隔を調整",
  KEY_F: "2D ボードを反転",
  KEY_H: "補助線の表示切り替え",
  KEY_T: "テーマ切り替え (ライト/ダーク)",
  KEY_R: "一時停止 / メニュー",
  KEY_X: "レイヤー間隔をリセット",
  KEY_V: "色弱モード切り替え (青/黄)",
  KEY_M: "ミュート切り替え",

  // Colorblind mode
  COLORBLIND_ON: "色弱モード ON (青/黄)",
  COLORBLIND_OFF: "色弱モード OFF (赤/緑)",

  // Misc
  PASTE_PLACEHOLDER: "Base64 セーブデータを貼り付け",

  // Replay
  BTN_REPLAY: "リプレイ",
  BTN_REPLAY_PREV: "←前の手",
  BTN_REPLAY_NEXT: "次の手→",
  BTN_REPLAY_EXIT: "終了",
  REPLAY_ENTER: "リプレイモード - 全 {0} 手",
  REPLAY_EXIT: "リプレイモードを終了しました",

  // Save validation
  SAVE_INVALID_STRUCTURE: "セーブデータの構造が無効です",
  SAVE_INVALID_DIMENSIONS: "ボードサイズが一致しません",

  // Game over
  BLACK_WIN: "黒の勝ち！",
  WHITE_WIN: "白の勝ち！",
  GAME_OVER_SUBTITLE: "全 {0} 手",

  // Language
  SETTING_LANGUAGE: "言語",

  // Pause menu
  PAUSE_TITLE: "一時停止",

  // Mouse hints
  MOUSE_HOVER: "🖱 ホバー：補助線を表示",
  MOUSE_CLICK: "🖱 クリック：現在の面に着手",
  MOUSE_WHEEL: "🖱 スクロール：3D 視点を回転",

  // Guide screen
  GUIDE_TIP_PREFIX: "💡 ゲーム開始後、",
  GUIDE_TIP_SUFFIX: " でズームアウト",

  // Save slots area
  SAVE_SLOTS_TITLE: "セーブスロット",
  SLOT_HINT: "L キーで最新セーブを読み込み",
  MUTE_HINT: "M キーでミュート切り替え",

  // Level system
  BTN_LEVEL_MODE: "ステージモード",
  LEVEL_SELECT_TITLE: "ステージ選択",

  // Custom Sandbox
  BTN_CUSTOM_SANDBOX: "カスタムサンドボックス",
  CUSTOM_SANDBOX_TITLE: "カスタムサンドボックス",
  BOARD_SIZE_LABEL: "盤面サイズ (奇数)",
  LAYER_COUNT_LABEL: "層数",
  BTN_START_CUSTOM: "カスタム対局を開始",


  WIN_LENGTH_LABEL: "勝利連子数",

  // Swap2
  SWAP_PROMPT: "白：スワップまたはパスを選択",
  BTN_SWAP: "スワップ",
  BTN_PASS: "パス",
  SWAP_DONE: "色が入れ替わりました！あなたは黒になりました。",
  PASS_DONE: "スワップなし。白が続行。",
  // Opening rules
  GAME_RULE_LABEL: "開始ルール",
  RULE_STANDARD: "標準五目並べ",
  RULE_SWAP2: "Swap2 (開始交換)",

  // Swap decision modal
  SWAP_DECISION_TITLE: "開始交換の決定",
  SWAP_DECISION_MSG: "白は色を交換しますか？",

  LEVEL_LOADING: "読み込み中: {0}",
  LEVEL_STARTING: "開始中: {0}",

  SLOT_RULE_GOMOKU: "標準",
  SLOT_RULE_SWAP2: "Swap2",

} as const;

export default jaJP;