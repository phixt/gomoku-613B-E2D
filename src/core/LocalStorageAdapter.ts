import type { IStorageAdapter } from "./StorageAdapter";

/** Web environment adapter using localStorage. */
export class LocalStorageAdapter implements IStorageAdapter {
    get(key: string): string | null {
        return localStorage.getItem(key);
    }
    set(key: string, value: string): void {
        localStorage.setItem(key, value);
    }
    remove(key: string): void {
        localStorage.removeItem(key);
    }
}
