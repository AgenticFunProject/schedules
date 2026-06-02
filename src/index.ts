import { SchedulesStore } from "./store.js";
import { buildServer } from "./server.js";
import { loadBearerAuthConfig } from "./auth.js";
import { createPersistence, loadRuntimeConfig } from "./persistence/index.js";

const port = parseInt(process.env["PORT"] ?? "3000", 10);
const host = process.env["HOST"] ?? "0.0.0.0";

const rtConfig = loadRuntimeConfig();
const persistence = createPersistence(rtConfig);
const snapshot = persistence.load();
const store = new SchedulesStore(snapshot ?? undefined, persistence);
const auth = loadBearerAuthConfig();

const app = buildServer({ store, auth, label: process.env["SCHEDULES_LABEL"] });

app.listen({ port, host }).then((address) => {
  console.error(`Schedules service listening on ${address}`);
});
