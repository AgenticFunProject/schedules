import { RuntimeConfig, StorageBackend, StorePersistence } from "./types.js";
import { MemoryPersistence } from "./memory.js";
import { JsonFilePersistence } from "./json-file.js";

export { loadRuntimeConfig } from "./runtime-config.js";
export type { RuntimeConfig, StorePersistence } from "./types.js";

export function createPersistence(config: RuntimeConfig): StorePersistence {
  switch (config.backend) {
    case StorageBackend.MEMORY:
      return new MemoryPersistence();
    case StorageBackend.DB:
      return new JsonFilePersistence(config.path!);
    default:
      return new MemoryPersistence();
  }
}
