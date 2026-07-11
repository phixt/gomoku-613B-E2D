import { Store } from "@tauri-apps/plugin-store";
import type { IStorageAdapter } from "./StorageAdapter";

/** Tauri environment adapter using @tauri-apps/plugin-store. */
export class TauriStoreAdapter implements IStorageAdapter {
  private store!: Store;
  private cache = new Map<string, string>();

  /** Load all keys from disk into in-memory cache. Must be called before read. */
  public async init(): Promise<void> {
    this.store = await Store.load("saves.json");
    const keys = await this.store.keys();
    for (const key of keys) {
      const val = await this.store.get<string>(key);
      if (val !== undefined && val !== null) {
        this.cache.set(key, val);
      }
    }
    console.log("[TauriStoreAdapter] ✅ Loaded from disk, keys:", keys.length);
  }

  /** Synchronous read from in-memory cache. */
  get(key: string): string | null {
    return this.cache.get(key) ?? null;
  }

  /** Update cache immediately, persist to disk in background. */
  set(key: string, value: string): void {
    this.cache.set(key, value);
    this.saveToDisk(key, value);
  }

  /** Remove from cache immediately, persist to disk in background. */
  remove(key: string): void {
    this.cache.delete(key);
    this.saveToDisk(key, null);
  }

  private async saveToDisk(key: string, value: string | null): Promise<void> {
    try {
      if (value === null) {
        await this.store.delete(key);
      } else {
        await this.store.set(key, value);
      }
      await this.store.save();
    } catch (e) {
      console.error("[TauriStoreAdapter] Failed to persist", e);
    }
  }
}
