import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { StoreSnapshot } from "../store/state.js";
import { StorePersistence } from "./types.js";

export class JsonFilePersistence implements StorePersistence {
  constructor(private path: string) {}

  load(): StoreSnapshot | null {
    try {
      const raw = readFileSync(this.path, "utf-8");
      return JSON.parse(raw);
    } catch (err: any) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  save(snapshot: StoreSnapshot): void {
    const dir = dirname(this.path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(this.path, JSON.stringify(snapshot, null, 2), "utf-8");
  }
}
