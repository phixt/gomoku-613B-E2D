import type { IStorageAdapter, SlotMeta } from "./StorageAdapter";
import { SAVE_SLOT_COUNT, QUICK_SAVE_INDEX } from "./Config";
import { eventBus, Events } from "./EventBus";

export interface SaveData {
  id: string;
  version: string;
  timestamp: number;
  boardState: number[][][];
  moves: Array<{
    x: number; y: number; z: number; player: 1 | 2;
    timestamp?: number;
    evaluation?: number;
  }>;
  rules: 'gomoku' | 'renju' | 'swap2';
  gameMode: 'pvp' | 'pve';
  aiDifficulty?: 'easy' | 'medium' | 'hard';
  status: 'playing' | 'finished' | 'paused';
  winner?: 1 | 2 | 0;
  currentPlayer: 1 | 2;
  focusZ: number;
  isDarkTheme: boolean;
  playerColor: 1 | 2;
  boardSize: number;
  layers: number;
  layerSpacing: number;
}

export const TOTAL_SLOTS = SAVE_SLOT_COUNT;

export class SaveManager {
  private _slots: (SaveData | null)[] = [];
  private _slotIds: (string | null)[] = [];  // Maps slot index -> save id
  private storage: IStorageAdapter;
  private _ready = false;

  constructor(storage: IStorageAdapter) {
    this.storage = storage;
    this._slots = new Array(TOTAL_SLOTS).fill(null);
    this._slotIds = new Array(TOTAL_SLOTS).fill(null);
  }

  async init(): Promise<void> {
    await this.storage.init();
    await this.loadFromStorage();
    this._ready = true;
  }

  get ready(): boolean { return this._ready; }

  getSlots(): ReadonlyArray<SaveData | null> {
    return this._slots;
  }

  isSlotEmpty(index: number): boolean {
    return index < 0 || index >= TOTAL_SLOTS || this._slots[index] === null;
  }

  async save(index: number, data: SaveData): Promise<void> {
    if (index < 0 || index >= TOTAL_SLOTS) return;
    this._slots[index] = data;
    this._slotIds[index] = data.id;
    const meta: SlotMeta = {
      index,
      id: data.id,
      timestamp: data.timestamp,
      boardSize: data.boardSize,
      layers: data.layers,
      movesCount: data.moves ? data.moves.length : 0
    };
    await this.storage.setSave(data.id, JSON.stringify(data), meta);
    eventBus.emit(Events.SAVE_UPDATED, this.getSlots());
  }

  load(index: number): SaveData | null {
    if (index < 0 || index >= TOTAL_SLOTS) return null;
    return this._slots[index];
  }

  async delete(index: number): Promise<void> {
    if (index < 0 || index >= TOTAL_SLOTS) return;
    const id = this._slotIds[index];
    this._slots[index] = null;
    this._slotIds[index] = null;
    if (id) {
      await this.storage.deleteSave(id);
    }
    eventBus.emit(Events.SAVE_UPDATED, this.getSlots());
  }

  async quickSave(data: SaveData): Promise<void> {
    await this.save(QUICK_SAVE_INDEX, data);
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

  private async loadFromStorage(): Promise<void> {
    try {
      const index = await this.storage.getIndex();
      if (!index || index.length === 0) {
        this._slots = new Array(TOTAL_SLOTS).fill(null);
        this._slotIds = new Array(TOTAL_SLOTS).fill(null);
        return;
      }
      for (const meta of index) {
        if (meta.index < 0 || meta.index >= TOTAL_SLOTS) continue;
        const raw = await this.storage.getSave(meta.id);
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          this._slots[meta.index] = this.migrateData(parsed);
          this._slotIds[meta.index] = meta.id;
        } catch { /* skip corrupt save */ }
      }
    } catch {
      this._slots = new Array(TOTAL_SLOTS).fill(null);
      this._slotIds = new Array(TOTAL_SLOTS).fill(null);
    }
  }

  private migrateData(data: any): SaveData {
    if (!data.version || data.version < "2.0.0") {
      console.log("[SaveManager] Migrating legacy save to v2.0.0...");
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

  /**
   * Validate save data integrity before loading.
   * Now accepts any boardSize/layers (no dimension check against Config).
   */
  static validateSaveData(data: any): string | null {
    if (!data || typeof data !== "object") return "SAVE_INVALID_STRUCTURE";
    if (!data.version
        || !Array.isArray(data.boardState)
        || !Array.isArray(data.moves)
        || typeof data.boardSize !== "number" || data.boardSize <= 0
        || typeof data.layers !== "number" || data.layers <= 0) {
      return "SAVE_INVALID_STRUCTURE";
    }
    if (data.boardState.length !== data.layers) return "SAVE_INVALID_STRUCTURE";
    for (let z = 0; z < data.layers; z++) {
      const layer = data.boardState[z];
      if (!Array.isArray(layer) || layer.length !== data.boardSize) return "SAVE_INVALID_STRUCTURE";
      if (!Array.isArray(layer[0]) || layer[0].length !== data.boardSize) return "SAVE_INVALID_STRUCTURE";
    }
    return null;
  }

  static serializeToBase64(data: SaveData): string {
    try {
      return btoa(JSON.stringify(data));
    } catch {
      return "";
    }
  }

  static tryParseSaveData(input: string): SaveData | null {
    if (!input || !input.trim()) return null;
    let decoded: string;
    try { decoded = atob(input.trim()); } catch { return null; }
    let parsed: unknown;
    try { parsed = JSON.parse(decoded); } catch { return null; }
    if (!parsed || typeof parsed !== "object") return null;
    const data = parsed as Record<string, unknown>;
    if (!data.version || !Array.isArray(data.moves)) return null;
    if (typeof data.boardSize !== "number" || data.boardSize <= 0) return null;
    if (typeof data.layers !== "number" || data.layers <= 0) return null;
    return parsed as SaveData;
  }
}
