import type { IStorageAdapter, SlotMeta } from "./StorageAdapter";

const INDEX_KEY = "gomoku_save_index";
const SAVE_PREFIX = "gomoku_save_";
const LEGACY_KEY = "gomoku_saves_v3";

export class LocalStorageAdapter implements IStorageAdapter {
  async init(): Promise<void> {
    // Try migration from legacy format on init
    await this.tryMigrate();
  }

  async getIndex(): Promise<SlotMeta[]> {
    try {
      const raw = localStorage.getItem(INDEX_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SlotMeta[];
    } catch { /* corrupt */ }
    return [];
  }

  async getSave(id: string): Promise<string | null> {
    return localStorage.getItem(SAVE_PREFIX + id);
  }

  async setSave(id: string, data: string, meta: SlotMeta): Promise<void> {
    localStorage.setItem(SAVE_PREFIX + id, data);
    // Update index
    const index = await this.getIndex();
    const existing = index.findIndex((m) => m.id === id);
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.push(meta);
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  }

  async deleteSave(id: string): Promise<void> {
    localStorage.removeItem(SAVE_PREFIX + id);
    const index = await this.getIndex();
    const filtered = index.filter((m) => m.id !== id);
    localStorage.setItem(INDEX_KEY, JSON.stringify(filtered));
  }

  /** Migrate from old monolithic saves.json to sharded format. */
  async tryMigrate(): Promise<boolean> {
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (!legacyRaw) return false;
    try {
      const parsed = JSON.parse(legacyRaw);
      if (!Array.isArray(parsed)) return false;
      console.log("[LocalStorageAdapter] Migrating legacy saves.json to sharded format...");
      const index: SlotMeta[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const data = parsed[i];
        if (!data || !data.id) continue;
        const id = data.id;
        localStorage.setItem(SAVE_PREFIX + id, JSON.stringify(data));
        index.push({
          index: i,
          id,
          timestamp: data.timestamp || Date.now(),
          boardSize: data.boardSize || 13,
          layers: data.layers || 6,
          movesCount: data.moves ? data.moves.length : 0
        });
      }
      localStorage.setItem(INDEX_KEY, JSON.stringify(index));
      localStorage.removeItem(LEGACY_KEY);
      console.log("[LocalStorageAdapter] Migration complete:", index.length, "saves");
      return true;
    } catch (e) {
      console.error("[LocalStorageAdapter] Migration failed:", e);
      return false;
    }
  }
}
