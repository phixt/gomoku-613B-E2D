import { Store } from "@tauri-apps/plugin-store";
import type { IStorageAdapter, SlotMeta } from "./StorageAdapter";

const INDEX_KEY = "index";
const SAVE_PREFIX = "save_";
const LEGACY_KEY = "__gomoku_saves";

export class TauriStoreAdapter implements IStorageAdapter {
  private indexStore!: Store;
  private dataStore!: Store;

  public async init(): Promise<void> {
    this.indexStore = await Store.load("index.json");
    this.dataStore = await Store.load("saves.json");
    await this.tryMigrate();
  }

  async getIndex(): Promise<SlotMeta[]> {
    try {
      const raw = await this.indexStore.get<string>(INDEX_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as SlotMeta[];
    } catch { /* corrupt */ }
    return [];
  }

  async getSave(id: string): Promise<string | null> {
    const val = await this.dataStore.get<string>(SAVE_PREFIX + id);
    return val ?? null;
  }

  async setSave(id: string, data: string, meta: SlotMeta): Promise<void> {
    await this.dataStore.set(SAVE_PREFIX + id, data);
    const index = await this.getIndex();
    const existing = index.findIndex((m) => m.id === id);
    if (existing >= 0) {
      index[existing] = meta;
    } else {
      index.push(meta);
    }
    await this.indexStore.set(INDEX_KEY, JSON.stringify(index));
    await this.indexStore.save();
    await this.dataStore.save();
  }

  async deleteSave(id: string): Promise<void> {
    await this.dataStore.delete(SAVE_PREFIX + id);
    const index = await this.getIndex();
    const filtered = index.filter((m) => m.id !== id);
    await this.indexStore.set(INDEX_KEY, JSON.stringify(filtered));
    await this.indexStore.save();
    await this.dataStore.save();
  }

  /** Migrate from old monolithic saves.json in Tauri store. */
  async tryMigrate(): Promise<boolean> {
    try {
      const raw = await this.dataStore.get<string>(LEGACY_KEY);
      if (!raw) return false;
      // Check if it's the old array format
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return false;
      console.log("[TauriStoreAdapter] Migrating legacy saves to sharded format...");
      const index: SlotMeta[] = [];
      for (let i = 0; i < parsed.length; i++) {
        const data = parsed[i];
        if (!data || !data.id) continue;
        const id = data.id;
        await this.dataStore.set(SAVE_PREFIX + id, JSON.stringify(data));
        index.push({
          index: i,
          id,
          timestamp: data.timestamp || Date.now(),
          boardSize: data.boardSize || 13,
          layers: data.layers || 6,
          movesCount: data.moves ? data.moves.length : 0
        });
      }
      await this.indexStore.set(INDEX_KEY, JSON.stringify(index));
      await this.dataStore.delete(LEGACY_KEY);
      await this.indexStore.save();
      await this.dataStore.save();
      console.log("[TauriStoreAdapter] Migration complete:", index.length, "saves");
      return true;
    } catch (e) {
      console.error("[TauriStoreAdapter] Migration failed:", e);
      return false;
    }
  }
}
