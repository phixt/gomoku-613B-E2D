import { eventBus, Events } from "./EventBus";

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

export const GENERAL_SLOT_COUNT = 5;
export const QUICK_SAVE_INDEX = 5;
export const TOTAL_SLOTS = 6;

const STORAGE_KEY = "gomoku_saves_v3";

class SaveManager {
    private _slots: (SaveData | null)[] = [];

    constructor() {
        this.loadFromStorage();
    }

    /** @deprecated Use getSlots() instead. */
    get slots(): ReadonlyArray<SlotEntry> {
        return this._slots.map((data, i) => ({
            type: i === QUICK_SAVE_INDEX ? "quick" : "general",
            data,
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
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed: (SaveData | null)[] = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length === TOTAL_SLOTS) {
                    this._slots = parsed;
                    return;
                }
            }
        } catch {
            /* corrupt data, reset */
        }
        this._slots = new Array(TOTAL_SLOTS).fill(null);
    }

    private persist(): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._slots));
        eventBus.emit(Events.SAVE_UPDATED, this.getSlots());
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

export const saveManager = new SaveManager();
