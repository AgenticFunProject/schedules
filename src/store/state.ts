import { Schedule, ScheduleStatus } from "../types.js";
import { StoreState } from "./shared.js";

export interface StoreSnapshot {
  schedules: Schedule[];
}

export function restoreState(snapshot: StoreSnapshot): StoreState {
  const state = {
    schedules: new Map<string, Schedule>(),
  };
  for (const s of snapshot.schedules) {
    state.schedules.set(s.id, s);
  }
  return state;
}

export function initializeState(): StoreState {
  return {
    schedules: new Map<string, Schedule>(),
  };
}

export function createSnapshot(state: StoreState): StoreSnapshot {
  return {
    schedules: Array.from(state.schedules.values()),
  };
}
