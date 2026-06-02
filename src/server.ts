import Fastify, { FastifyInstance } from "fastify";
import { SchedulesStore } from "./store.js";
import { AuthConfig, authenticateBearerToken, createBearerToken, ensureScope, loadBearerAuthConfig, Scope, TokenPayload } from "./auth.js";
import { ScheduleStatus, SearchSchedulesParams } from "./types.js";

export interface ServerOptions {
  store: SchedulesStore;
  auth: AuthConfig;
  label?: string;
}

function getBearerToken(request: any): string | null {
  const header = request.headers["authorization"];
  if (!header || typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function parseAuthError(err: Error): { statusCode: number; message: string } {
  const msg = err.message.toLowerCase();
  if (msg.includes("expired")) return { statusCode: 401, message: err.message };
  if (msg.includes("signature") || msg.includes("issuer") || msg.includes("audience") || msg.includes("format") || msg.includes("body")) {
    return { statusCode: 401, message: err.message };
  }
  if (msg.includes("scope")) return { statusCode: 403, message: err.message };
  return { statusCode: 401, message: err.message };
}

function employeeRoutes(app: FastifyInstance, store: SchedulesStore, auth: AuthConfig): void {
  app.post("/schedules", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.status(401).send({ error: "Missing authorization token" });
    let payload: TokenPayload;
    try {
      payload = authenticateBearerToken(token, auth);
      ensureScope(payload, Scope.MODIFY);
    } catch (err: any) {
      const e = parseAuthError(err);
      return reply.status(e.statusCode).send({ error: e.message });
    }
    const body = request.body as any;
    if (!body.vesselName || !body.voyageNumber || !body.originPort || !body.destinationPort ||
        !body.etd || !body.eta || !body.cargoCutOff || !body.docsCutOff || body.capacityTEU === undefined) {
      return reply.status(422).send({ error: "required" });
    }
    try {
      const schedule = store.createSchedule(body, payload.sub);
      return reply.status(201).send({ schedule: { ...schedule, availableCapacityTEU: schedule.capacityTEU - schedule.bookedTEU } });
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.put("/schedules/:id", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.status(401).send({ error: "Missing authorization token" });
    let payload: TokenPayload;
    try {
      payload = authenticateBearerToken(token, auth);
      ensureScope(payload, Scope.MODIFY);
    } catch (err: any) {
      const e = parseAuthError(err);
      return reply.status(e.statusCode).send({ error: e.message });
    }
    try {
      const { id } = request.params as any;
      const schedule = store.updateSchedule(id, request.body as any);
      return reply.send({ schedule: { ...schedule, availableCapacityTEU: schedule.capacityTEU - schedule.bookedTEU } });
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.patch("/schedules/:id/close", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.status(401).send({ error: "Missing authorization token" });
    let payload: TokenPayload;
    try {
      payload = authenticateBearerToken(token, auth);
      ensureScope(payload, Scope.MODIFY);
    } catch (err: any) {
      const e = parseAuthError(err);
      return reply.status(e.statusCode).send({ error: e.message });
    }
    try {
      const { id } = request.params as any;
      const schedule = store.closeSchedule(id);
      return reply.send({ schedule: { ...schedule, availableCapacityTEU: schedule.capacityTEU - schedule.bookedTEU } });
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.patch("/schedules/:id/open", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.status(401).send({ error: "Missing authorization token" });
    let payload: TokenPayload;
    try {
      payload = authenticateBearerToken(token, auth);
      ensureScope(payload, Scope.MODIFY);
    } catch (err: any) {
      const e = parseAuthError(err);
      return reply.status(e.statusCode).send({ error: e.message });
    }
    try {
      const { id } = request.params as any;
      const schedule = store.openSchedule(id);
      return reply.send({ schedule: { ...schedule, availableCapacityTEU: schedule.capacityTEU - schedule.bookedTEU } });
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.delete("/schedules/:id", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.status(401).send({ error: "Missing authorization token" });
    let payload: TokenPayload;
    try {
      payload = authenticateBearerToken(token, auth);
      ensureScope(payload, Scope.MODIFY);
    } catch (err: any) {
      const e = parseAuthError(err);
      return reply.status(e.statusCode).send({ error: e.message });
    }
    try {
      const { id } = request.params as any;
      store.deleteSchedule(id);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });
}

function publicRoutes(app: FastifyInstance, store: SchedulesStore, auth: AuthConfig): void {
  app.get("/schedules/:id", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.status(401).send({ error: "Missing authorization token" });
    try {
      authenticateBearerToken(token, auth);
    } catch (err: any) {
      const e = parseAuthError(err);
      return reply.status(e.statusCode).send({ error: e.message });
    }
    try {
      const { id } = request.params as any;
      const schedule = store.getSchedule(id);
      return reply.send(schedule);
    } catch (err: any) {
      return reply.status(err.statusCode || 500).send({ error: err.message });
    }
  });

  app.get("/schedules", async (request, reply) => {
    const token = getBearerToken(request);
    if (!token) return reply.status(401).send({ error: "Missing authorization token" });
    let payload: TokenPayload | null = null;
    try {
      payload = authenticateBearerToken(token, auth);
    } catch (err: any) {
      const e = parseAuthError(err);
      return reply.status(e.statusCode).send({ error: e.message });
    }
    const query = request.query as any;
    const isEmployee = payload.scope.includes(Scope.MODIFY);
    const params: SearchSchedulesParams = {};
    if (query.originPort) params.originPort = query.originPort;
    if (query.destinationPort) params.destinationPort = query.destinationPort;
    if (query.departureDateFrom) params.departureDateFrom = query.departureDateFrom;
    if (query.departureDateTo) params.departureDateTo = query.departureDateTo;
    if (query.status && isEmployee) {
      params.status = query.status as ScheduleStatus;
    }
    const schedules = store.listSchedules(params, isEmployee);
    return reply.send({ schedules });
  });
}

export function buildServer(options: ServerOptions): FastifyInstance {
  const { store, auth } = options;
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ status: "ok" }));

  app.get("/playground", async (_request, reply) => {
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(Buffer.from(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Schedules API Playground</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:-apple-system,BlinkMacSystemFont,sans-serif; background:#f5f5f5; color:#333; line-height:1.6; }
  .container { max-width:800px; margin:2rem auto; padding:0 1rem; }
  h1 { font-size:1.8rem; margin-bottom:.5rem; }
  .subtitle { color:#666; margin-bottom:2rem; }
  .card { background:#fff; border-radius:8px; padding:1.5rem; margin-bottom:1rem; box-shadow:0 1px 3px rgba(0,0,0,.1); }
  .card h2 { font-size:1.2rem; margin-bottom:.75rem; }
  .endpoint { background:#f0f7ff; border-left:3px solid #0066cc; padding:.75rem 1rem; margin-bottom:.5rem; border-radius:0 4px 4px 0; }
  .endpoint .method { display:inline-block; font-weight:700; color:#0066cc; min-width:5rem; }
  .endpoint .path { font-family:monospace; }
  .endpoint .desc { color:#555; font-size:.9rem; margin-top:.25rem; }
  .status { display:inline-block; padding:.25rem .75rem; border-radius:4px; font-weight:600; font-size:.85rem; }
  .status.ok { background:#d4edda; color:#155724; }
  .status.info { background:#fff3cd; color:#856404; }
  a { color:#0066cc; }
  .token-box { background:#263238; color:#e0e0e0; padding:1rem; border-radius:4px; font-family:monospace; font-size:.85rem; margin-top:.5rem; word-break:break-all; }
  .btn { display:inline-block; background:#0066cc; color:#fff; border:none; padding:.5rem 1rem; border-radius:4px; cursor:pointer; font-size:.9rem; }
  .btn:hover { background:#0052a3; }
  input, select { padding:.5rem; border:1px solid #ccc; border-radius:4px; font-size:.9rem; width:100%; margin-bottom:.5rem; }
  label { display:block; font-weight:600; margin-bottom:.25rem; font-size:.9rem; }
  .row { display:flex; gap:.75rem; }
  .row > * { flex:1; }
</style>
</head>
<body>
<div class="container">
  <h1>Schedules API Playground</h1>
  <p class="subtitle">Vessel sailing schedules service — try the API endpoints below</p>

  <div class="card">
    <h2>Service Status</h2>
    <p><span class="status ok">Healthy</span> <span id="health-msg"></span></p>
    <p style="margin-top:.5rem;font-size:.9rem;color:#666;">Service: <code id="service-url">https://app-schedules-prod-9e31c1.azurewebsites.net</code></p>
  </div>

  <div class="card">
    <h2>API Endpoints</h2>
    <div class="endpoint"><span class="method">GET</span> <span class="path">/health</span><div class="desc">Health check</div></div>
    <div class="endpoint"><span class="method">GET</span> <span class="path">/schedules?originPort=...&destinationPort=...&departureDateFrom=...&departureDateTo=...</span><div class="desc">Search public schedules</div></div>
    <div class="endpoint"><span class="method">GET</span> <span class="path">/schedules/:id</span><div class="desc">Get schedule by ID</div></div>
    <div class="endpoint"><span class="method">POST</span> <span class="path">/schedules</span><div class="desc">Create schedule (requires auth)</div></div>
    <div class="endpoint"><span class="method">PUT</span> <span class="path">/schedules/:id</span><div class="desc">Update schedule (requires auth)</div></div>
    <div class="endpoint"><span class="method">PATCH</span> <span class="path">/schedules/:id/status</span><div class="desc">Transition status (requires auth)</div></div>
    <div class="endpoint"><span class="method">DELETE</span> <span class="path">/schedules/:id</span><div class="desc">Delete schedule (requires auth)</div></div>
  </div>

  <div class="card">
    <h2>Test Public Search</h2>
    <div class="row">
      <div><label>Origin Port</label><input id="origin" placeholder="e.g. CNSHA" value="NLRTM"></div>
      <div><label>Destination Port</label><input id="dest" placeholder="e.g. NLRTM" value="SGSIN"></div>
    </div>
    <div class="row">
      <div><label>From Date</label><input id="date-from" type="date" value="2026-06-01"></div>
      <div><label>To Date</label><input id="date-to" type="date" value="2026-06-30"></div>
    </div>
    <button class="btn" id="search-btn">Search Schedules</button>
    <pre id="search-result" class="token-box" style="margin-top:.75rem;display:none;"></pre>
  </div>

  <div class="card">
    <h2>Get Schedule by ID</h2>
    <label>Schedule ID</label>
    <input id="schedule-id" placeholder="Paste a schedule UUID from the search results">
    <button class="btn" id="get-btn">Get Schedule</button>
    <pre id="get-result" class="token-box" style="margin-top:.75rem;display:none;"></pre>
  </div>

  <div class="card">
    <h2>Generate Dev Token</h2>
    <label>Scope</label>
    <select id="token-scope"><option value="schedules:read">Read-only</option><option value="schedules:read schedules:modify">Read + Modify</option></select>
    <button class="btn" id="token-btn">Generate Token</button>
    <pre id="token-result" class="token-box" style="margin-top:.75rem;display:none;"></pre>
  </div>
</div>

<script>
const BASE = window.location.origin;

document.getElementById("search-btn").onclick = async () => {
  const origin = document.getElementById("origin").value;
  const dest = document.getElementById("dest").value;
  const from = document.getElementById("date-from").value;
  const to = document.getElementById("date-to").value;
  const params = new URLSearchParams({ originPort: origin, destinationPort: dest, departureDateFrom: from, departureDateTo: to });
  const res = await fetch(BASE + "/schedules?" + params);
  const data = await res.json();
  const el = document.getElementById("search-result");
  el.style.display = "block";
  el.textContent = JSON.stringify(data, null, 2);
};

document.getElementById("get-btn").onclick = async () => {
  const id = document.getElementById("schedule-id").value.trim();
  if (!id) return;
  const res = await fetch(BASE + "/schedules/" + id);
  const data = await res.json();
  const el = document.getElementById("get-result");
  el.style.display = "block";
  el.textContent = JSON.stringify(data, null, 2);
};

document.getElementById("token-btn").onclick = async () => {
  const scope = document.getElementById("token-scope").value;
  const res = await fetch(BASE + "/dev/generate-token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
  const data = await res.json();
  const el = document.getElementById("token-result");
  el.style.display = "block";
  el.textContent = JSON.stringify(data, null, 2);
};
</script>
</body>
</html>`));
  });

  app.post("/dev/generate-token", async (request, reply) => {
    const body = request.body as any;
    const sub = body?.sub ?? "anonymous";
    const scope = body?.scope ?? Scope.READ;
    const token = createBearerToken(
      { sub, scope: typeof scope === "string" ? scope : scope.join(" "), iss: auth.issuer, aud: auth.audience },
      auth,
    );
    return reply.send({ token });
  });

  publicRoutes(app, store, auth);
  employeeRoutes(app, store, auth);

  app.setErrorHandler((error: any, _request, reply) => {
    reply.status(error.statusCode ?? 500).send({ error: error.message });
  });

  return app;
}
