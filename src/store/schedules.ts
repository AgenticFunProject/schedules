import { v4 as uuidv4 } from "uuid";
import {
  Schedule,
  ScheduleStatus,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  SearchSchedulesParams,
  ScheduleInResponse,
} from "../types.js";
import { StoreState, getScheduleOrThrow } from "./shared.js";

function toResponse(schedule: Schedule): ScheduleInResponse {
  return {
    ...schedule,
    availableCapacityTEU: schedule.capacityTEU - schedule.bookedTEU,
  };
}

function validateScheduleDates(body: { cargoCutOff?: string; etd?: string; eta?: string }): void {
  if (body.cargoCutOff && body.etd && new Date(body.cargoCutOff) >= new Date(body.etd)) {
    throw Object.assign(new Error("cargoCutOff must be before etd"), { statusCode: 422 });
  }
  if (body.eta && body.etd && new Date(body.eta) <= new Date(body.etd)) {
    throw Object.assign(new Error("eta must be after etd"), { statusCode: 422 });
  }
}

export function createSchedule(
  state: StoreState,
  body: CreateScheduleRequest,
  createdBy: string,
): Schedule {
  const now = new Date().toISOString();
  const id = uuidv4();

  validateScheduleDates(body);

  const schedule: Schedule = {
    id,
    vesselName: body.vesselName,
    voyageNumber: body.voyageNumber,
    originPort: body.originPort,
    destinationPort: body.destinationPort,
    etd: body.etd,
    eta: body.eta,
    cargoCutOff: body.cargoCutOff,
    docsCutOff: body.docsCutOff,
    capacityTEU: body.capacityTEU,
    bookedTEU: 0,
    status: ScheduleStatus.DRAFT,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };

  state.schedules.set(id, schedule);
  return schedule;
}

export function updateSchedule(
  state: StoreState,
  id: string,
  body: UpdateScheduleRequest,
): Schedule {
  const schedule = getScheduleOrThrow(state, id);

  if (body.cargoCutOff !== undefined) schedule.cargoCutOff = body.cargoCutOff;
  if (body.etd !== undefined) schedule.etd = body.etd;
  if (body.eta !== undefined) schedule.eta = body.eta;

  const merged = {
    cargoCutOff: schedule.cargoCutOff,
    etd: schedule.etd,
    eta: schedule.eta,
    ...(body.cargoCutOff !== undefined ? { cargoCutOff: body.cargoCutOff } : {}),
    ...(body.etd !== undefined ? { etd: body.etd } : {}),
    ...(body.eta !== undefined ? { eta: body.eta } : {}),
  };
  validateScheduleDates(merged);

  if (body.vesselName !== undefined) schedule.vesselName = body.vesselName;
  if (body.voyageNumber !== undefined) schedule.voyageNumber = body.voyageNumber;
  if (body.originPort !== undefined) schedule.originPort = body.originPort;
  if (body.destinationPort !== undefined) schedule.destinationPort = body.destinationPort;
  if (body.capacityTEU !== undefined) schedule.capacityTEU = body.capacityTEU;
  schedule.updatedAt = new Date().toISOString();

  state.schedules.set(id, schedule);
  return schedule;
}

export function deleteSchedule(state: StoreState, id: string): void {
  const schedule = getScheduleOrThrow(state, id);
  if (schedule.status !== ScheduleStatus.DRAFT) {
    throw Object.assign(new Error("Only draft schedules can be deleted"), { statusCode: 409 });
  }
  state.schedules.delete(id);
}

export function closeSchedule(state: StoreState, id: string): Schedule {
  const schedule = getScheduleOrThrow(state, id);
  if (schedule.status === ScheduleStatus.OPEN) {
    schedule.status = ScheduleStatus.CLOSED;
  } else if (schedule.status === ScheduleStatus.DRAFT) {
    schedule.status = ScheduleStatus.OPEN;
  } else {
    throw Object.assign(new Error("Schedule is already closed"), { statusCode: 409 });
  }
  schedule.updatedAt = new Date().toISOString();
  state.schedules.set(id, schedule);
  return schedule;
}

export function openSchedule(state: StoreState, id: string): Schedule {
  const schedule = getScheduleOrThrow(state, id);
  if (schedule.status !== ScheduleStatus.CLOSED) {
    throw Object.assign(new Error("Only closed schedules can be re-opened"), { statusCode: 409 });
  }
  if (schedule.bookedTEU > 0) {
    throw Object.assign(new Error("cannot be re-opened"), { statusCode: 409 });
  }
  schedule.status = ScheduleStatus.OPEN;
  schedule.updatedAt = new Date().toISOString();
  state.schedules.set(id, schedule);
  return schedule;
}

export function getSchedule(state: StoreState, id: string): ScheduleInResponse {
  const schedule = getScheduleOrThrow(state, id);
  return toResponse(schedule);
}

export function listSchedules(
  state: StoreState,
  params: SearchSchedulesParams,
  isEmployee: boolean,
): ScheduleInResponse[] {
  let results = Array.from(state.schedules.values());

  if (!isEmployee) {
    results = results.filter((s) => s.status === ScheduleStatus.OPEN);
  } else if (params.status) {
    results = results.filter((s) => s.status === params.status);
  }

  if (params.originPort) {
    results = results.filter((s) => s.originPort === params.originPort);
  }
  if (params.destinationPort) {
    results = results.filter((s) => s.destinationPort === params.destinationPort);
  }
  if (params.departureDateFrom) {
    const from = new Date(params.departureDateFrom).getTime();
    results = results.filter((s) => new Date(s.etd).getTime() >= from);
  }
  if (params.departureDateTo) {
    const to = new Date(params.departureDateTo).getTime();
    results = results.filter((s) => new Date(s.etd).getTime() <= to);
  }

  return results.map(toResponse);
}

export function addBooking(state: StoreState, scheduleId: string, teu: number): void {
  const schedule = getScheduleOrThrow(state, scheduleId);
  schedule.bookedTEU += teu;
  schedule.updatedAt = new Date().toISOString();
  state.schedules.set(scheduleId, schedule);
}
