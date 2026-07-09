import { eventBus, Events } from "./EventBus";
import { SAVE_SLOT_COUNT } from "./Config";

export interface SaveData {
  version: string;
  timestamp: number;
  boardSize: number;
  layers: number;
  layerSpacing: number;
  moves: Array<{ x: number; y: number; z: number; player: number }>;
  focusZ: number;
  isDarkTheme: boolean;
  currentPlayer: number;
}

export interface SlotEntry {
  type: "general" | "quick";
  data: SaveData | null;
}

const STORAGE_KEY = "gomoku_saves_v2";
const QUICK_INDEX = SAVE_SLOT_COUNT - 1; // 4 (0-based), general slots 0-3

class SaveManager {
  private _slots: SlotEntry[] = [];

  constructor() {
    this.loadFromStorage();
  }

  get slots(): ReadonlyArray<SlotEntry> {
    return this._slots;
  }

  getSlots(): (SaveData | null)[] {
    return this._slots.map(s => s.data);
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SlotEntry[] = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length === SAVE_SLOT_COUNT) {
          this._slots = parsed;
          return;
        }
      }
    } catch { /* corrupt data, reset */ }
    this.initSlots();
  }

  private initSlots(): void {
    this._slots = [];
    for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
      this._slots.push({ type: i === QUICK_INDEX ? "quick" : "general", data: null });
    }
    this.persist();
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._slots));
    eventBus.emit(Events.SAVE_UPDATED, [...this._slots]);
  }

save(index: number, data: SaveData): void {
    if (index < 0 || index >= SAVE_SLOT_COUNT) return;
    this._slots[index] = {
      type: index === QUICK_INDEX ? "quick" : "general",
      data,
    };
    this.persist();
  }

  load(index: number): SaveData | null {
    if (index < 0 || index >= SAVE_SLOT_COUNT) return null;
    return this._slots[index]?.data ?? null;
  }

  delete(index: number): void {
    if (index < 0 || index >= SAVE_SLOT_COUNT) return;
    this._slots[index] = {
      type: index === QUICK_INDEX ? "quick" : "general",
      data: null,
    };
    this.persist();
  }

  quickSave(data: SaveData): void {
    this.save(QUICK_INDEX, data);
  }

  quickLoad(): SaveData | null {
    return this.load(QUICK_INDEX);
  }

  getLatestIndex(): number {
    let latest = -1;
    let latestTs = 0;
    for (let i = 0; i < SAVE_SLOT_COUNT; i++) {
      const d = this._slots[i]?.data;
      if (d && d.timestamp > latestTs) {
        latestTs = d.timestamp;
        latest = i;
      }
    }
    return latest;
  }
}

export const saveManager = new SaveManager();
