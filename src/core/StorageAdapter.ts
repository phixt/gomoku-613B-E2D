export interface SlotMeta {
  index: number;
  id: string;
  timestamp: number;
  boardSize: number;
  layers: number;
  movesCount: number;
}

export interface IStorageAdapter {
  init(): Promise<void>;
  getIndex(): Promise<SlotMeta[]>;
  getSave(id: string): Promise<string | null>;
  setSave(id: string, data: string, meta: SlotMeta): Promise<void>;
  deleteSave(id: string): Promise<void>;
  /** One-time migration: read old monolithic saves.json, split into sharded files. */
  tryMigrate?(getRawKey: (key: string) => string | null, deleteKey: (key: string) => void): Promise<boolean>;
}
