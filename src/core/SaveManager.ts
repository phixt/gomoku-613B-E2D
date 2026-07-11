import type { IStorageAdapter } from "./StorageAdapter";
import { SAVE_SLOT_COUNT, QUICK_SAVE_INDEX, BOARD_SIZE, LAYER_COUNT } from "./Config";
import { eventBus, Events } from "./EventBus";

export interface SaveData {
  // ================= 1. 核心标识 =================
  id: string;              // 唯一存档ID (UUID或时间戳+随机数)，用于管理/分享
  version: string;         // 存档结构版本号 (如 "2.0.0")，用于迁移兼容
  timestamp: number;       // 创建/最后修改时间
  
  // ================= 2. 棋盘快照 (性能优化) =================
  // moves 用于复盘，boardState 用于“秒开”渲染和合法性校验
  // 3D 数组: [z][x][y] -> 0(空), 1(黑), 2(白)
  boardState: number[][][]; 
  
  // ================= 3. 对局历史 (复盘/禁手/悔棋核心) =================
  moves: Array<{
    x: number; 
    y: number; 
    z: number; 
    player: 1 | 2; 
    timestamp?: number;    // 可选：记录每步耗时，用于高级复盘分析
    evaluation?: number;   // 可选：AI 评估分数 (未来功能)
  }>;
  
  // ================= 4. 规则与配置 (禁手/联机同步刚需) =================
  rules: 'gomoku' | 'renju' | 'swap2'; // 当前对局规则
  gameMode: 'pvp' | 'pve';
  aiDifficulty?: 'easy' | 'medium' | 'hard';
  
  // ================= 5. 状态与元数据 =================
  status: 'playing' | 'finished' | 'paused';
  winner?: 1 | 2 | 0;      // 0=平局或无结果
  currentPlayer: 1 | 2;    // 下一手该谁
  focusZ: number;          // 存档时的视角层级
  isDarkTheme: boolean;    // 主题偏好
  playerColor: 1 | 2;
  
  // 3D 物理配置 (防止未来默认值变更导致旧存档错位)
  boardSize: number;       // 13
  layers: number;          // 6
  layerSpacing: number;    // 层间距
}
export interface SlotEntry {
  type: "general" | "quick";
  data: SaveData | null;
}

// Derived from imported Config.ts constants
export const TOTAL_SLOTS = SAVE_SLOT_COUNT;
export const GENERAL_SLOT_COUNT = SAVE_SLOT_COUNT - 1;
const STORAGE_KEY = "gomoku_saves_v3";

export class SaveManager {
  private _slots: (SaveData | null)[] = [];
  private storage: IStorageAdapter;

  constructor(storage: IStorageAdapter) {
    this.storage = storage;
    this.loadFromStorage();
  }

  /** @deprecated Use getSlots() instead. */
  get slots(): ReadonlyArray<SlotEntry> {
    return this._slots.map((data, i) => ({
      type: i === QUICK_SAVE_INDEX ? "quick" : "general",
      data
    }));
  }

  getSlots(): ReadonlyArray<SaveData | null> {
    return this._slots;
  }

  isSlotEmpty(index: number): boolean {
    return index < 0 || index >= TOTAL_SLOTS || this._slots[index] === null;
  }

  save(index: number, data: SaveData): void {
    if (index < 0 || index >= TOTAL_SLOTS) return;
    this._slots[index] = data;
    this.persist();
  }

  load(index: number): SaveData | null {
    if (index < 0 || index >= TOTAL_SLOTS) return null;
    return this._slots[index];
  }

  delete(index: number): void {
    if (index < 0 || index >= TOTAL_SLOTS) return;
    this._slots[index] = null;
    this.persist();
  }

  quickSave(data: SaveData): void {
    this.save(QUICK_SAVE_INDEX, data);
  }

  quickLoad(): SaveData | null {
    return this.load(QUICK_SAVE_INDEX);
  }

  getLatestIndex(): number {
    let latest = -1;
    let latestTs = 0;
    for (let i = 0; i < TOTAL_SLOTS; i++) {
      const d = this._slots[i];
      if (d && d.timestamp > latestTs) {
        latestTs = d.timestamp;
        latest = i;
      }
    }
    return latest;
  }

    private loadFromStorage(): void {
    try {
      const raw = this.storage.get(STORAGE_KEY);
      if (raw) {
        const parsed: (SaveData | null)[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === TOTAL_SLOTS) {
          // Run migration on each slot
          this._slots = parsed.map((data) => data ? this.migrateData(data) : null);
          return;
        }
      }
    } catch {
      /* corrupt data, reset */
    }
    this._slots = new Array(TOTAL_SLOTS).fill(null);
  }

  /**
   * Migrate legacy save data to the latest version (2.0.0).
   */
  private migrateData(data: any): SaveData {
    if (!data.version || data.version < "2.0.0") {
      console.log("[SaveManager] Migrating legacy save data to v2.0.0...");
      // Reconstruct boardState from moves if missing
      const boardSize = data.boardSize || 13;
      const layers = data.layers || 6;
      const boardState: number[][][] = [];
      for (let z = 0; z < layers; z++) {
        const layer: number[][] = [];
        for (let y = 0; y < boardSize; y++) {
          layer.push(new Array(boardSize).fill(0));
        }
        boardState.push(layer);
      }
      // Populate boardState from moves
      if (data.moves && Array.isArray(data.moves)) {
        for (const move of data.moves) {
          if (move.x >= 0 && move.x < boardSize && move.y >= 0 && move.y < boardSize && move.z >= 0 && move.z < layers) {
            boardState[move.z][move.y][move.x] = move.player;
          }
        }
      }
      return {
        id: data.id || crypto.randomUUID(),
        version: "2.0.0",
        timestamp: data.timestamp || Date.now(),
        boardState,
        moves: data.moves || [],
        rules: data.rules || "gomoku",
        gameMode: data.gameMode || "pvp",
        status: data.status || "playing",
        winner: data.winner || 0,
        currentPlayer: data.currentPlayer || 1,
        focusZ: data.focusZ || 0,
        isDarkTheme: data.isDarkTheme || false,
        playerColor: data.playerColor || 1,
        boardSize,
        layers,
        layerSpacing: data.layerSpacing || 3.5,
      } as SaveData;
    }
    return data as SaveData;
  }

  private persist(): void {
    this.storage.set(STORAGE_KEY, JSON.stringify(this._slots));
    eventBus.emit(Events.SAVE_UPDATED, this.getSlots());
  }


  /**
   * Deep validation of save data integrity. Returns an error message key (from UI_TEXT)
   * on failure, or null if the data passes all checks.
   */
  /**
   * Validate save data integrity before loading.
   * Returns an error message key (from UI_TEXT) on failure, or null if valid.
   */
  static validateSaveData(data: any): string | null {
    // Stage 1: Structure validation ? required fields must exist with correct types
    if (!data || typeof data !== "object") return "SAVE_INVALID_STRUCTURE";
    if (!data.version
        || !Array.isArray(data.boardState)
        || !Array.isArray(data.moves)
        || typeof data.boardSize !== "number" || data.boardSize <= 0
        || typeof data.layers !== "number" || data.layers <= 0) {
      return "SAVE_INVALID_STRUCTURE";
    }
    // Verify boardState dimensions match declared size
    if (data.boardState.length !== data.layers) return "SAVE_INVALID_STRUCTURE";
    for (let z = 0; z < data.layers; z++) {
      const layer = data.boardState[z];
      if (!Array.isArray(layer) || layer.length !== data.boardSize) return "SAVE_INVALID_STRUCTURE";
      // Spot-check first row of each layer (full scan is too expensive)
      if (!Array.isArray(layer[0]) || layer[0].length !== data.boardSize) return "SAVE_INVALID_STRUCTURE";
    }

    // Stage 2: Dimension validation ? must match current Config
    if (data.boardSize !== BOARD_SIZE || data.layers !== LAYER_COUNT) {
      return "SAVE_INVALID_DIMENSIONS";
    }

    return null;
  }

  static serializeToBase64(data: SaveData): string {
    try {
      const json = JSON.stringify(data);
      return btoa(encodeURIComponent(json));
    } catch {
      return "";
    }
  }

  static deserializeFromBase64(base64: string): SaveData | null {
    try {
      const json = decodeURIComponent(atob(base64));
      return JSON.parse(json) as SaveData;
    } catch {
      return null;
    }
  }
}

