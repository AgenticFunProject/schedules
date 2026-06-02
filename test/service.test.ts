import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { FastifyInstance } from "fastify";
import { SchedulesStore } from "../src/store.js";
import { buildServer } from "../src/server.js";
import { loadBearerAuthConfig, createBearerToken, Scope } from "../src/auth.js";

function createTestAuth(sub: string = "employee-1", scope: string = `${Scope.READ} ${Scope.MODIFY}`) {
  const config = loadBearerAuthConfig();
  const token = createBearerToken(
    { sub, scope, iss: config.issuer, aud: config.audience },
    config,
  );
  return { config, token };
}

describe("Schedules Service", () => {
  let app: FastifyInstance;
  let store: SchedulesStore;
  let employeeToken: string;

  before(() => {
    store = new SchedulesStore();
    const { config, token } = createTestAuth();
    employeeToken = token;
    app = buildServer({ store, auth: config });
  });

  after(async () => {
    await app.close();
  });

  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await app.inject({ method: "GET", url: "/health" });
      assert.equal(res.statusCode, 200);
      assert.deepEqual(JSON.parse(res.payload), { status: "ok" });
    });
  });

  describe("POST /schedules (employee create)", () => {
    it("creates a draft schedule", async () => {
      const body = {
        vesselName: "Ever Given",
        voyageNumber: "EG-2026-14W",
        originPort: "CNSHA",
        destinationPort: "NLRTM",
        etd: "2026-04-15T08:00:00Z",
        eta: "2026-05-10T14:00:00Z",
        cargoCutOff: "2026-04-12T17:00:00Z",
        docsCutOff: "2026-04-13T12:00:00Z",
        capacityTEU: 200,
      };
      const res = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: body,
      });
      assert.equal(res.statusCode, 201);
      const data = JSON.parse(res.payload);
      assert.equal(data.schedule.vesselName, "Ever Given");
      assert.equal(data.schedule.status, "DRAFT");
      assert.equal(data.schedule.bookedTEU, 0);
      assert.equal(data.schedule.availableCapacityTEU, 200);
      assert.ok(data.schedule.id);
    });

    it("returns 401 without token", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/schedules",
        payload: { vesselName: "Test" },
      });
      assert.equal(res.statusCode, 401);
    });

    it("returns 422 for missing required fields", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: { vesselName: "Incomplete" },
      });
      assert.equal(res.statusCode, 422);
      assert.match(JSON.parse(res.payload).error, /required/i);
    });
  });

  describe("PUT /schedules/:id (employee update)", () => {
    it("updates a schedule", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Ever Given",
          voyageNumber: "EG-2026-14W",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      const res = await app.inject({
        method: "PUT",
        url: `/schedules/${id}`,
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: { vesselName: "Ever Given 2" },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).schedule.vesselName, "Ever Given 2");
    });
  });

  describe("DELETE /schedules/:id", () => {
    it("deletes a draft schedule", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Test",
          voyageNumber: "TV-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 100,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      const res = await app.inject({
        method: "DELETE",
        url: `/schedules/${id}`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 204);
    });

    it("returns 409 for OPEN schedule", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Cannot Delete",
          voyageNumber: "CD-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 100,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });

      const res = await app.inject({
        method: "DELETE",
        url: `/schedules/${id}`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 409);
    });
  });

  describe("GET /schedules/:id", () => {
    it("returns a schedule by ID", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Get Test",
          voyageNumber: "GT-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      const res = await app.inject({
        method: "GET",
        url: `/schedules/${id}`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).vesselName, "Get Test");
    });

    it("returns 404 for unknown schedule", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/schedules/00000000-0000-0000-0000-000000000000",
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 404);
    });
  });

  describe("Schedule lifecycle", () => {
    it("transitions DRAFT -> OPEN on close", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Lifecycle",
          voyageNumber: "LC-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      const res = await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).schedule.status, "OPEN");
    });

    it("transitions OPEN -> CLOSED on close", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Lifecycle 2",
          voyageNumber: "LC-002",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      const res = await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).schedule.status, "CLOSED");
    });

    it("cannot re-open a CLOSED schedule with bookings", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "No Reopen",
          voyageNumber: "NR-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });

      store["state"].schedules.get(id)!.bookedTEU = 5;

      const res = await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/open`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 409);
      assert.match(JSON.parse(res.payload).error, /cannot be re-opened/);
    });

    it("can re-open a CLOSED schedule with no bookings", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Can Reopen",
          voyageNumber: "CR-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/close`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });

      const res = await app.inject({
        method: "PATCH",
        url: `/schedules/${id}/open`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      assert.equal(res.statusCode, 200);
      assert.equal(JSON.parse(res.payload).schedule.status, "OPEN");
    });
  });

  describe("GET /schedules (search)", () => {
    let searchStore: SchedulesStore;
    let searchApp: FastifyInstance;
    let searchToken: string;

    before(() => {
      searchStore = new SchedulesStore();
      const { config, token } = createTestAuth();
      searchToken = token;
      searchApp = buildServer({ store: searchStore, auth: config });
    });

    after(async () => {
      await searchApp.close();
    });

    it("searches by origin and destination", async () => {
      const { config: roConfig, token: roToken } = createTestAuth("public-1", Scope.READ);
      const scheduleData = [
        { vesselName: "A", voyageNumber: "S-001", originPort: "CNSHA", destinationPort: "NLRTM", status: "OPEN" },
        { vesselName: "B", voyageNumber: "S-002", originPort: "CNSHA", destinationPort: "NLRTM" },
        { vesselName: "C", voyageNumber: "S-003", originPort: "CNSHA", destinationPort: "DEHAM", status: "OPEN" },
      ];
      for (const s of scheduleData) {
        const res = await searchApp.inject({
          method: "POST",
          url: "/schedules",
          headers: { authorization: `Bearer ${searchToken}` },
          payload: {
            vesselName: s.vesselName,
            voyageNumber: s.voyageNumber,
            originPort: s.originPort,
            destinationPort: s.destinationPort,
            etd: "2026-04-15T08:00:00Z",
            eta: "2026-05-10T14:00:00Z",
            cargoCutOff: "2026-04-12T17:00:00Z",
            docsCutOff: "2026-04-13T12:00:00Z",
            capacityTEU: 200,
          },
        });
        if (s.status === "OPEN") {
          const id = JSON.parse(res.payload).schedule.id;
          await searchApp.inject({
            method: "PATCH",
            url: `/schedules/${id}/close`,
            headers: { authorization: `Bearer ${searchToken}` },
          });
        }
      }

      const res = await searchApp.inject({
        method: "GET",
        url: "/schedules?originPort=CNSHA&destinationPort=NLRTM",
        headers: { authorization: `Bearer ${roToken}` },
      });
      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload);
      assert.equal(data.schedules.length, 1);
      assert.equal(data.schedules[0].voyageNumber, "S-001");
    });
  });

  describe("Business rules", () => {
    it("rejects cargoCutOff after etd", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Bad Dates",
          voyageNumber: "BD-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-16T00:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      assert.equal(res.statusCode, 422);
      assert.match(JSON.parse(res.payload).error, /cargoCutOff must be before etd/);
    });

    it("rejects eta before etd", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Bad Dates 2",
          voyageNumber: "BD-002",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-04-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      assert.equal(res.statusCode, 422);
      assert.match(JSON.parse(res.payload).error, /eta must be after etd/);
    });

    it("computes availableCapacityTEU correctly", async () => {
      const createRes = await app.inject({
        method: "POST",
        url: "/schedules",
        headers: { authorization: `Bearer ${employeeToken}` },
        payload: {
          vesselName: "Capacity Test",
          voyageNumber: "CT-001",
          originPort: "CNSHA",
          destinationPort: "NLRTM",
          etd: "2026-04-15T08:00:00Z",
          eta: "2026-05-10T14:00:00Z",
          cargoCutOff: "2026-04-12T17:00:00Z",
          docsCutOff: "2026-04-13T12:00:00Z",
          capacityTEU: 200,
        },
      });
      const id = JSON.parse(createRes.payload).schedule.id;

      store["state"].schedules.get(id)!.bookedTEU = 45;

      const res = await app.inject({
        method: "GET",
        url: `/schedules/${id}`,
        headers: { authorization: `Bearer ${employeeToken}` },
      });
      const data = JSON.parse(res.payload);
      assert.equal(data.capacityTEU, 200);
      assert.equal(data.bookedTEU, 45);
      assert.equal(data.availableCapacityTEU, 155);
    });
  });
});
