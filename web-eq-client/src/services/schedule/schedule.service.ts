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

export interface ScheduleExceptionCreate {
  schedule_id: string;
  exception_date: string;          // YYYY-MM-DD
  is_closed?: boolean;
  special_opening_time?: string | null;
  special_closing_time?: string | null;
  reason?: string | null;
}

export interface ScheduleExceptionByDateCreate {
  entity_id: string;
  entity_type: "BUSINESS" | "EMPLOYEE";
  exception_date: string;          // YYYY-MM-DD
  is_closed?: boolean;
  special_opening_time?: string | null;
  special_closing_time?: string | null;
  reason?: string | null;
}

/** Create leave across a date range (server expands to one row per working day). */
export interface LeaveRangeInput {
  entity_id: string;
  entity_type: "BUSINESS" | "EMPLOYEE";
  start_date: string;              // YYYY-MM-DD
  end_date: string;                // YYYY-MM-DD (== start for a single day)
  is_closed?: boolean;
  special_opening_time?: string | null;
  special_closing_time?: string | null;
  reason: string;
}

/** Outcome of a range create — which dates landed and which were skipped. */
export interface LeaveBatchResult {
  leave_group_id: string;
  status: string;
  created: string[];
  skipped_non_working: string[];
  skipped_existing: string[];
  skipped_booked: string[];
}

export interface ScheduleExceptionData {
  uuid: string;
  schedule_id: string;
  exception_date: string;
  is_closed: boolean;
  special_opening_time?: string | null;
  special_closing_time?: string | null;
  status: string;                  // PENDING | APPROVED | REJECTED
  created_by_role?: string | null;
  reason?: string | null;
  reviewed_at?: string | null;
  leave_group_id?: string | null;
}

/** A pending leave request enriched with the requesting employee's identity. */
export interface PendingLeave {
  uuid: string;
  schedule_id: string;
  employee_id: string;
  employee_name: string;
  exception_date: string;
  is_closed: boolean;
  special_opening_time?: string | null;
  special_closing_time?: string | null;
  reason?: string | null;
  status: string;
  created_by_role?: string | null;
  leave_group_id?: string | null;
}

/** Roster window for the business leave page. */
export type LeaveScope = "upcoming" | "past" | "all";

export class ScheduleService extends HttpClient {
  constructor() {
    super();
  }

  /** Employee (or business) day-of-week schedule rows. Needed to resolve the
   *  schedule_id for a given date when creating a leave/exception. */
  async getSchedules(entityType: "BUSINESS" | "EMPLOYEE", entityId: string): Promise<ScheduleData[]> {
    return await this.get<ScheduleData[]>(`/schedule/schedules/${entityType}/${entityId}`);
  }

  /** Create a leave / schedule exception. Business → auto-approved; employee → pending. */
  async createException(payload: ScheduleExceptionCreate): Promise<ScheduleExceptionData> {
    return await this.post<ScheduleExceptionData>(`/schedule/schedule_exception`, payload);
  }

  /** Create a leave / exception by entity + date. The server resolves the
   *  weekday's schedule row, so the client never does weekday math. */
  async createExceptionByDate(payload: ScheduleExceptionByDateCreate): Promise<ScheduleExceptionData> {
    return await this.post<ScheduleExceptionData>(`/schedule/schedule_exception/by_date`, payload);
  }

  /** Create leave across a date range. Server expands to per-day rows sharing a
   *  leave_group_id and returns which dates were created / skipped. */
  async createLeaveRange(payload: LeaveRangeInput): Promise<LeaveBatchResult> {
    return await this.post<LeaveBatchResult>(`/schedule/schedule_exception/range`, payload);
  }

  /** Approve or reject a whole leave group (multi-day) in one action. */
  async reviewGroup(groupId: string, approve: boolean): Promise<LeaveBatchResult> {
    return await this.post<LeaveBatchResult>(`/schedule/schedule_exception/group/${groupId}/review`, { approve });
  }

  /** Remove a whole leave group (all its days) in one action. */
  async deleteGroup(groupId: string): Promise<{ success: boolean; deleted: number }> {
    return await this.delete<{ success: boolean; deleted: number }>(`/schedule/schedule_exception/group/${groupId}`);
  }

  /** Pending leave requests for a business (approval inbox). */
  async getPendingLeaves(businessId: string): Promise<PendingLeave[]> {
    return await this.get<PendingLeave[]>(`/schedule/schedule_exceptions/pending?business_id=${businessId}`);
  }

  /** Employee leaves for a business (roster), windowed by scope:
   *  upcoming = today onward (pending + approved), past = history, all = everything. */
  async getBusinessLeaves(businessId: string, scope: LeaveScope = "upcoming"): Promise<PendingLeave[]> {
    const qs = new URLSearchParams({ business_id: businessId, scope });
    return await this.get<PendingLeave[]>(`/schedule/schedule_exceptions/business?${qs.toString()}`);
  }

  /** Approve or reject a pending leave request. */
  async reviewException(exceptionId: string, approve: boolean): Promise<ScheduleExceptionData> {
    return await this.post<ScheduleExceptionData>(`/schedule/schedule_exception/${exceptionId}/review`, { approve });
  }

  /** The current employee's own leave/exceptions, windowed by scope. */
  async getMyExceptions(scope: LeaveScope = "upcoming"): Promise<ScheduleExceptionData[]> {
    const qs = new URLSearchParams({ scope });
    return await this.get<ScheduleExceptionData[]>(`/schedule/schedule_exceptions/my?${qs.toString()}`);
  }

  /** Cancel/remove an exception by its schedule + date. Employees may only
   *  cancel leave they requested; the business may remove any. */
  async deleteException(scheduleId: string, exceptionDate: string): Promise<{ success: boolean }> {
    return await this.delete<{ success: boolean }>(`/schedule/schedule_exception/${scheduleId}/${exceptionDate}`);
  }
}
