import { StoreSnapshot } from "../store/state.js";

export enum StorageBackend {
  MEMORY = "MEMORY",
  DB = "DB",
}

export interface StorePersistence {
  load(): StoreSnapshot | null;
  save(snapshot: StoreSnapshot): void;
}

export interface RuntimeConfig {
  backend: StorageBackend;
  path?: string;
}
