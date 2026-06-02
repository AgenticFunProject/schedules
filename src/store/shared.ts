import { Schedule, ScheduleStatus } from "../types.js";

export interface StoreState {
  schedules: Map<string, Schedule>;
}

export function createEmptyState(): StoreState {
  return {
    schedules: new Map(),
  };
}

export function getScheduleOrThrow(state: StoreState, id: string): Schedule {
  const schedule = state.schedules.get(id);
  if (!schedule) {
    const err = new Error(`Schedule ${id} not found`);
    (err as any).statusCode = 404;
    throw err;
  }
  return schedule;
}
