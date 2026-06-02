export enum ScheduleStatus {
  DRAFT = "DRAFT",
  OPEN = "OPEN",
  CLOSED = "CLOSED",
}

export interface Schedule {
  id: string;
  vesselName: string;
  voyageNumber: string;
  originPort: string;
  destinationPort: string;
  etd: string;
  eta: string;
  cargoCutOff: string;
  docsCutOff: string;
  capacityTEU: number;
  bookedTEU: number;
  status: ScheduleStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleInResponse extends Omit<Schedule, "capacityTEU" | "bookedTEU"> {
  availableCapacityTEU: number;
  capacityTEU: number;
  bookedTEU: number;
}

export interface CreateScheduleRequest {
  id?: string;
  vesselName: string;
  voyageNumber: string;
  originPort: string;
  destinationPort: string;
  etd: string;
  eta: string;
  cargoCutOff: string;
  docsCutOff: string;
  capacityTEU: number;
}

export interface UpdateScheduleRequest {
  vesselName?: string;
  voyageNumber?: string;
  originPort?: string;
  destinationPort?: string;
  etd?: string;
  eta?: string;
  cargoCutOff?: string;
  docsCutOff?: string;
  capacityTEU?: number;
}

export interface SearchSchedulesParams {
  originPort?: string;
  destinationPort?: string;
  departureDateFrom?: string;
  departureDateTo?: string;
  status?: ScheduleStatus;
}

export interface ListSchedulesResponse {
  schedules: ScheduleInResponse[];
}

export interface CreateScheduleResponse {
  schedule: ScheduleInResponse;
}
