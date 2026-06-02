import { StoreState } from "./store/shared.js";
import { initializeState, restoreState, createSnapshot, StoreSnapshot } from "./store/state.js";
import * as schedules from "./store/schedules.js";
import { StorePersistence } from "./persistence/types.js";
import {
  Schedule,
  ScheduleInResponse,
  CreateScheduleRequest,
  UpdateScheduleRequest,
  SearchSchedulesParams,
} from "./types.js";

export class SchedulesStore {
  private state: StoreState;
  private persistence?: StorePersistence;

  constructor(snapshot?: StoreSnapshot, persistence?: StorePersistence) {
    this.state = snapshot ? restoreState(snapshot) : initializeState();
    this.persistence = persistence;
  }

  private persist(): void {
    if (this.persistence) {
      this.persistence.save(createSnapshot(this.state));
    }
  }

  createSchedule(body: CreateScheduleRequest, createdBy: string): Schedule {
    const result = schedules.createSchedule(this.state, body, createdBy);
    this.persist();
    return result;
  }

  updateSchedule(id: string, body: UpdateScheduleRequest): Schedule {
    const result = schedules.updateSchedule(this.state, id, body);
    this.persist();
    return result;
  }

  deleteSchedule(id: string): void {
    schedules.deleteSchedule(this.state, id);
    this.persist();
  }

  closeSchedule(id: string): Schedule {
    const result = schedules.closeSchedule(this.state, id);
    this.persist();
    return result;
  }

  openSchedule(id: string): Schedule {
    const result = schedules.openSchedule(this.state, id);
    this.persist();
    return result;
  }

  getSchedule(id: string): ScheduleInResponse {
    return schedules.getSchedule(this.state, id);
  }

  listSchedules(params: SearchSchedulesParams, isEmployee: boolean): ScheduleInResponse[] {
    return schedules.listSchedules(this.state, params, isEmployee);
  }
}
