import { StorageBackend, RuntimeConfig } from "./types.js";

const STORAGE_BACKEND_ENV = "STORAGE_BACKEND";
const STORAGE_PATH_ENV = "STORAGE_PATH";

function normalizeBackend(value: string | undefined): StorageBackend {
  switch (value?.toUpperCase()) {
    case "MEMORY":
      return StorageBackend.MEMORY;
    case "JSON":
    case "DB":
      return StorageBackend.DB;
    default:
      return StorageBackend.MEMORY;
  }
}

export function loadRuntimeConfig(): RuntimeConfig {
  const backend = normalizeBackend(process.env[STORAGE_BACKEND_ENV]);
  const path = process.env[STORAGE_PATH_ENV] ?? "./schedules-data.json";
  return { backend, path };
}
