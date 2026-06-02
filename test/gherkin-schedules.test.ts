import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { FastifyInstance } from "fastify";

import { loadBearerAuthConfig, Scope } from "../src/auth.js";
import { buildServer } from "../src/server.js";
import { SchedulesStore } from "../src/store.js";
import { AuthConfig } from "../src/auth.js";

const authConfig: AuthConfig = loadBearerAuthConfig();

interface GherkinState {
  app: FastifyInstance | null;
  store: SchedulesStore | null;
  latestStatusCode: number | null;
  latestBody: any;
  latestHeaders: Record<string, string> | null;
  latestRawBody: string | null;
  latestScheduleId: string | null;
  scheduleIds: Map<string, string>;
  scheduleStatuses: Map<string, string>;
}

function initState(): GherkinState {
  return { app: null, store: null, latestStatusCode: null, latestBody: null, latestHeaders: null, latestRawBody: null, latestScheduleId: null, scheduleIds: new Map(), scheduleStatuses: new Map() };
}

interface StepDefinition {
  pattern: RegExp;
  run: (state: GherkinState, ...captures: string[]) => Promise<void>;
}

test("Schedules Gherkin scenarios", async (t) => {
  const scenarios = parseFeature(join(import.meta.dirname, "features", "schedules.feature"));

  for (let i = 0; i < scenarios.length; i++) {
    await t.test(`scenario ${i + 1}`, async () => {
      const state = initState();
      try {
        await runScenario(scenarios[i], state);
      } finally {
        await state.app?.close();
      }
    });
  }
});

interface ParsedStep {
  text: string;
  table: string;
}

interface ScenarioData {
  background: ParsedStep[];
  steps: ParsedStep[];
}

function parseFeature(path: string): ScenarioData[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const scenarios: ScenarioData[] = [];
  let background: ParsedStep[] = [];
  let currentSteps: ParsedStep[] | null = null;
  let currentStep: ParsedStep | null = null;

  function flushStep() {
    if (currentStep) {
      if (currentSteps) currentSteps.push(currentStep);
      else background.push(currentStep);
      currentStep = null;
    }
  }

  for (const raw of lines) {
    const line = raw.trim();
    if (/^(Given|When|Then|And) /.test(line)) {
      flushStep();
      const text = line.replace(/^(Given|When|Then|And) /, "");
      currentStep = { text, table: "" };
    } else if (line.startsWith("|")) {
      if (currentStep) currentStep.table += line + "\n";
    } else if (line.startsWith("Scenario:")) {
      flushStep();
      currentSteps = [];
      scenarios.push({ background: [...background], steps: currentSteps });
    } else if (line.startsWith("Feature:") || line.startsWith("Background:")) {
      flushStep();
    } else if (line === "" || line.startsWith("#")) {
      flushStep();
    }
  }
  flushStep();
  return scenarios;
}

async function runStep(step: ParsedStep, state: GherkinState): Promise<void> {
  for (const definition of stepDefinitions) {
    const match = step.text.match(definition.pattern);
    if (!match) continue;
    const args = [...match.slice(1)];
    if (step.table) args.push(step.table.trimEnd());
    await definition.run(state, ...args);
    return;
  }
  throw new Error(`No step definition matched: ${step.text}`);
}

async function runScenario(scenario: ScenarioData, state: GherkinState): Promise<void> {
  for (const step of scenario.background) {
    await runStep(step, state);
  }
  for (const step of scenario.steps) {
    await runStep(step, state);
  }
}

function authHeader(method: string, sub = "employee-1") {
  const scopes = method === "GET" ? [Scope.READ] : [Scope.MODIFY];
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub, iss: authConfig.issuer, aud: authConfig.audience, exp: now + 3600, scope: scopes.join(" ") };
  const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const bodyB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", authConfig.secret).update(`${headerB64}.${bodyB64}`).digest("base64url");
  return { authorization: `Bearer ${headerB64}.${bodyB64}.${sig}` };
}

function employeeAuth() {
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: "employee-1", iss: authConfig.issuer, aud: authConfig.audience, exp: now + 3600, scope: `${Scope.READ} ${Scope.MODIFY}` };
  const headerB64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const bodyB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", authConfig.secret).update(`${headerB64}.${bodyB64}`).digest("base64url");
  return { authorization: `Bearer ${headerB64}.${bodyB64}.${sig}` };
}

async function request(state: GherkinState, method: string, url: string, payload?: any, headers?: any): Promise<void> {
  assert.ok(state.app);
  const response = await state.app.inject({ method, url, payload, headers: headers ?? authHeader(method) } as any);
  state.latestStatusCode = response.statusCode;
  state.latestHeaders = Object.fromEntries(Object.entries(response.headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
  state.latestRawBody = response.payload.toString();
  try {
    state.latestBody = response.json();
  } catch {
    state.latestBody = null;
  }
}

function latestBody<T>(state: GherkinState): T {
  return state.latestBody as T;
}

function tableToObj(table: string): Record<string, string> {
  const rows = table.trim().split("\n").map((r) => r.trim()).filter(Boolean);
  const result: Record<string, string> = {};
  for (const row of rows) {
    const match = row.match(/^\s*\|([^|]+)\|([^|]+)\|\s*$/);
    if (match) {
      result[match[1].trim()] = match[2].trim();
    }
  }
  return result;
}

function tableToArray(table: string): Array<Record<string, string>> {
  const rows = table.trim().split("\n").map((r) => r.trim()).filter(Boolean);
  if (rows.length < 2) return [];
  const headers = rows[0].split("|").map((h) => h.trim()).filter(Boolean);
  const result: Array<Record<string, string>> = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i].split("|").map((v) => v.trim()).filter(Boolean);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] ?? ""; });
    result.push(row);
  }
  return result;
}

const stepDefinitions: StepDefinition[] = [
  {
    pattern: /^the schedules service is running$/,
    run: async (state) => {
      state.store = new SchedulesStore();
      state.app = buildServer({ store: state.store, auth: authConfig });
    },
  },
  {
    pattern: /^the database contains no schedules$/,
    run: async () => {},
  },
  {
    pattern: /^a schedule exists with voyageNumber "([^"]+)"(?: and status "([^"]+)")?$/,
    run: async (state, voyageNumber, status) => {
      if (!status) status = "DRAFT";
      const res = await state.app!.inject({
        method: "POST",
        url: "/schedules",
        headers: employeeAuth(),
        payload: {
          vesselName: "Ever Given",
          voyageNumber,
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(res.payload).schedule.id;
      state.latestScheduleId = id;
      state.scheduleIds.set(voyageNumber, id);
      state.scheduleStatuses.set(voyageNumber, "DRAFT");

      if (status === "OPEN" || status === "CLOSED") {
        await state.app!.inject({
          method: "PATCH",
          url: `/schedules/${id}/close`,
          headers: employeeAuth(),
        });
        state.scheduleStatuses.set(voyageNumber, "OPEN");
      }
      if (status === "CLOSED") {
        await state.app!.inject({
          method: "PATCH",
          url: `/schedules/${id}/close`,
          headers: employeeAuth(),
        });
        state.scheduleStatuses.set(voyageNumber, "CLOSED");
      }
    },
  },
  {
    pattern: /^a schedule exists with status "([^"]+)"$/,
    run: async (state, status) => {
      const voyage = `GEN-${Date.now()}`;
      const res = await state.app!.inject({
        method: "POST",
        url: "/schedules",
        headers: employeeAuth(),
        payload: {
          vesselName: "Generic",
          voyageNumber: voyage,
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(res.payload).schedule.id;
      state.latestScheduleId = id;
      if (status === "OPEN" || status === "CLOSED") {
        await state.app!.inject({
          method: "PATCH",
          url: `/schedules/${id}/close`,
          headers: employeeAuth(),
        });
      }
      if (status === "CLOSED") {
        await state.app!.inject({
          method: "PATCH",
          url: `/schedules/${id}/close`,
          headers: employeeAuth(),
        });
      }
    },
  },
  {
    pattern: /^the schedule has (\d+) confirmed booking\(s\)$/,
    run: async (state, count) => {
      assert.ok(state.latestScheduleId);
      assert.ok(state.store);
      // Add bookings directly to the store state
      const schedule = state.store["state"].schedules.get(state.latestScheduleId!);
      assert.ok(schedule);
      schedule.bookedTEU = Number(count) * 50;
    },
  },
  {
    pattern: /^the employee sends a (POST|PUT|PATCH|DELETE) request to "([^"]+)"(?: with:)?$/,
    run: async (state, method, path, table) => {
      let data = undefined;
      if (table && method !== "DELETE") {
        data = tableToObj(table);
      }
      let url = path;
      if (url.includes("{id}") && state.latestScheduleId) {
        url = url.replace("{id}", state.latestScheduleId);
      }
      await request(state, method, url, data, employeeAuth());
    },
  },
  {
    pattern: /^the employee sends a (GET) request to "([^"]+)"$/,
    run: async (state, method, path) => {
      let url = path;
      if (url.includes("{id}") && state.latestScheduleId) {
        url = url.replace("{id}", state.latestScheduleId);
      }
      await request(state, method, url, undefined, employeeAuth());
    },
  },
  {
    pattern: /^(?:the )?(?:authenticated )?employee sends a GET request to "([^"]+)"$/,
    run: async (state, path) => {
      let url = path;
      if (url.includes("{id}") && state.latestScheduleId) {
        url = url.replace("{id}", state.latestScheduleId);
      }
      await request(state, "GET", url, undefined, employeeAuth());
    },
  },
  {
    pattern: /^a GET request is sent to "([^"]+)"$/,
    run: async (state, url) => {
      if (url.includes("{id}") && state.latestScheduleId) {
        url = url.replace("{id}", state.latestScheduleId);
      }
      await request(state, "GET", url, undefined, authHeader("GET"));
    },
  },
  {
    pattern: /^the response status is (\d+)$/,
    run: async (state, statusCode) => {
      assert.equal(state.latestStatusCode, Number(statusCode));
    },
  },
  {
    pattern: /^the response body contains a schedule with:$/,
    run: async (state, table) => {
      const expected = tableToObj(table);
      const body = latestBody<any>(state);
      const schedule = body.schedule ?? body;
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(String(schedule[key]), value, `Expected ${key}=${value}, got ${schedule[key]}`);
      }
    },
  },
  {
    pattern: /^the response body contains:$/,
    run: async (state, table) => {
      const expected = tableToObj(table);
      const body = latestBody<any>(state);
      const schedule = body.schedule ?? body;
      for (const [key, value] of Object.entries(expected)) {
        assert.equal(String(schedule[key]), value, `Expected ${key}=${value}, got ${schedule[key]}`);
      }
    },
  },
  {
    pattern: /^the response (?:body )?contains (\d+) schedule\(s\)$/,
    run: async (state, count) => {
      const body = latestBody<any>(state);
      const list = body.schedules ?? [body];
      const actual = Array.isArray(body.schedules) ? body.schedules.length : 0;
      assert.equal(actual, Number(count));
    },
  },
  {
    pattern: /^the response contains exactly (\d+) schedule\(s\) with status "([^"]+)"$/,
    run: async (state, count, status) => {
      const body = latestBody<any>(state);
      const filtered = body.schedules.filter((s: any) => s.status === status);
      assert.equal(filtered.length, Number(count));
    },
  },
  {
    pattern: /^the first schedule has voyageNumber "([^"]+)"$/,
    run: async (state, voyageNumber) => {
      const body = latestBody<any>(state);
      assert.equal(body.schedules[0].voyageNumber, voyageNumber);
    },
  },
  {
    pattern: /^the schedule has voyageNumber "([^"]+)"$/,
    run: async (state, voyageNumber) => {
      const body = latestBody<any>(state);
      const schedule = body.schedule ?? (body.schedules ? body.schedules[0] : body);
      assert.equal(schedule?.voyageNumber, voyageNumber);
    },
  },
  {
    pattern: /^the schedule (\w+) is "([^"]+)"$/,
    run: async (state, field, value) => {
      const body = latestBody<any>(state);
      const schedule = body.schedule ?? body;
      assert.equal(String(schedule[field]), value);
    },
  },
  {
    pattern: /^the schedule vesselName is "([^"]+)"$/,
    run: async (state, value) => {
      const body = latestBody<any>(state);
      const schedule = body.schedule ?? body;
      assert.equal(schedule.vesselName, value);
    },
  },
  {
    pattern: /^the response body contains voyageNumber "([^"]+)"$/,
    run: async (state, voyageNumber) => {
      const body = latestBody<any>(state);
      const schedule = body.schedule ?? body;
      assert.equal(schedule.voyageNumber, voyageNumber);
    },
  },
  {
    pattern: /^the (?:schedule )?status is "([^"]+)"$/,
    run: async (state, status) => {
      const body = latestBody<any>(state);
      const schedule = body.schedule ?? body;
      assert.equal(schedule.status, status);
    },
  },
  {
    pattern: /^the schedule no longer exists$/,
    run: async (state) => {
      assert.equal(state.latestStatusCode, 204);
    },
  },
  {
    pattern: /^the error message contains "([^"]+)"$/,
    run: async (state, fragment) => {
      const body = latestBody<any>(state);
      assert.match(body.error ?? "", new RegExp(fragment));
    },
  },
  {
    pattern: /^the Content-Type header contains "([^"]+)"$/,
    run: async (state, fragment) => {
      const ct = state.latestHeaders?.["content-type"] ?? "";
      assert.ok(ct.includes(fragment), `Expected Content-Type to contain "${fragment}", got "${ct}"`);
    },
  },
  {
    pattern: /^the response body contains "([^"]+)"$/,
    run: async (state, fragment) => {
      const raw = state.latestRawBody ?? "";
      assert.ok(raw.includes(fragment), `Expected response body to contain "${fragment}"`);
    },
  },
  {
    pattern: /^the response includes schedules with status "([^"]+)"$/,
    run: async (state, status) => {
      const body = latestBody<any>(state);
      const found = body.schedules?.some((s: any) => s.status === status);
      assert.ok(found, `Expected schedules to include status ${status}`);
    },
  },
  {
    pattern: /^schedules exist(?:\s*with\s*different\s*etd)?:$/,
    run: async (state, table) => {
      const rows = tableToArray(table);
      for (const row of rows) {
        const voyage = row["voyage"];
        const res = await state.app!.inject({
          method: "POST",
          url: "/schedules",
          headers: employeeAuth(),
          payload: {
            vesselName: `Vessel ${voyage}`,
            voyageNumber: voyage,
            originPort: row["originPort"] ?? "CNSHA",
            destinationPort: row["destinationPort"] ?? "NLRTM",
            etd: row["etd"] ?? "2026-04-15T08:00:00Z",
            eta: "2026-05-10T14:00:00Z",
            cargoCutOff: "2026-04-12T17:00:00Z",
            docsCutOff: "2026-04-13T12:00:00Z",
            capacityTEU: 200,
          },
        });
        const id = JSON.parse(res.payload).schedule.id;
        state.scheduleIds.set(voyage, id);

        const status = row["status"];
        if (status === "OPEN") {
          await state.app!.inject({
            method: "PATCH",
            url: `/schedules/${id}/close`,
            headers: employeeAuth(),
          });
        } else if (status === "CLOSED") {
          await state.app!.inject({
            method: "PATCH",
            url: `/schedules/${id}/close`,
            headers: employeeAuth(),
          });
          await state.app!.inject({
            method: "PATCH",
            url: `/schedules/${id}/close`,
            headers: employeeAuth(),
          });
        }
      }
    },
  },
  {
    pattern: /^a schedule exists with capacityTEU (\d+) and bookedTEU (\d+)$/,
    run: async (state, capacity, booked) => {
      const res = await state.app!.inject({
        method: "POST",
        url: "/schedules",
        headers: employeeAuth(),
        payload: {
          vesselName: "Capacity Test",
          voyageNumber: `CAP-${Date.now()}`,
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: Number(capacity),
        },
      });
      const id = JSON.parse(res.payload).schedule.id;
      state.latestScheduleId = id;
      if (state.store) {
        const schedule = state.store["state"].schedules.get(id);
        if (schedule) schedule.bookedTEU = Number(booked);
      }
    },
  },
];
