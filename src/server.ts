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
