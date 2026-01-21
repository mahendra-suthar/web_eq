import { HttpClient } from '../api/httpclient.service';

export interface ScheduleInput {
  day_of_week: number;
  opening_time?: string | null;
  closing_time?: string | null;
  is_open: boolean;
}

export interface ScheduleCreateInput {
  entity_id: string;
  entity_type: "BUSINESS" | "EMPLOYEE";
  is_always_open?: boolean | null;
  schedules: ScheduleInput[];
}

export interface ScheduleData {
  uuid: string;
  entity_id: string;
  entity_type: string;
  day_of_week: number;
  opening_time?: string | null;
  closing_time?: string | null;
  is_open: boolean;
}

export class ScheduleService extends HttpClient {
  constructor() {
    super();
  }
}
