import { StoreSnapshot } from "../store/state.js";
import { StorePersistence } from "./types.js";

export class MemoryPersistence implements StorePersistence {
  private snapshot: StoreSnapshot | null = null;

  load(): StoreSnapshot | null {
    return this.snapshot ? JSON.parse(JSON.stringify(this.snapshot)) : null;
  }

  save(snapshot: StoreSnapshot): void {
    this.snapshot = JSON.parse(JSON.stringify(snapshot));
  }
}
