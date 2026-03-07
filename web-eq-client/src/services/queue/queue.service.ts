import { HttpClient } from "../api/httpclient.service";

export interface QueueCreatePayload {
    business_id: string;
    name: string;
    employee_id?: string | null;
    booking_mode?: string; // QUEUE | FIXED | APPROXIMATE | HYBRID
    slot_interval_minutes?: number | null;
    max_per_slot?: number | null;
    services?: {
        service_id: string;
        avg_service_time?: number;
        service_fee?: number;
    }[];
}

export interface QueueCreateItemPayload {
    name: string;
    employee_id?: string | null;
    booking_mode?: string;
    slot_interval_minutes?: number | null;
    max_per_slot?: number | null;
    services: {
        service_id: string;
        avg_service_time?: number;
        service_fee?: number;
    }[];
}

export interface QueueCreateBatchPayload {
    business_id: string;
    queues: QueueCreateItemPayload[];
}

export interface QueueUpdatePayload {
    name?: string;
    status?: number;
    limit?: number;
    employee_id?: string | null;
    booking_mode?: string;
    slot_interval_minutes?: number | null;
    max_per_slot?: number | null;
}

export interface QueueServiceAddItem {
    service_id: string;
    service_fee?: number;
    avg_service_time?: number;
    description?: string;
}

export interface QueueServiceUpdatePayload {
    service_fee?: number;
    avg_service_time?: number;
    description?: string;
}

export interface QueueUserDetailUserInfo {
  full_name?: string | null;
  email?: string | null;
  phone_number: string;
  country_code: string;
  profile_picture?: string | null;
}

export interface QueueUserDetailResponse {
  user: QueueUserDetailUserInfo;
  queue_name: string;
  service_names: string[];
  employee_id?: string | null;
  queue_user_id: string;
  token_number?: string | null;
  queue_date: string;
  enqueue_time?: string | null;
  dequeue_time?: string | null;
  status?: number | null;
  priority: boolean;
  turn_time?: number | null;
  estimated_enqueue_time?: string | null;
  estimated_dequeue_time?: string | null;
  joined_queue: boolean;
  is_scheduled: boolean;
  notes?: string | null;
  cancellation_reason?: string | null;
  reschedule_count: number;
}

export interface QueueUserData {
    uuid: string;
    user_id: string;
    queue_id: string;
    enqueue_time?: string;
    dequeue_time?: string;
    status?: number;
    priority: boolean;
    queue_date: string;
    token_number?: string;
    turn_time?: number;
    estimated_enqueue_time?: string;
    estimated_dequeue_time?: string;
    notes?: string;
    cancellation_reason?: string;
    reschedule_count: number;
    joined_queue: boolean;
    is_scheduled: boolean;
    user: {
        uuid: string;
        full_name?: string;
        email?: string;
        phone_number: string;
        country_code: string;
    };
}

export interface QueueData {
    uuid: string;
    business_id: string;
    name: string;
    status?: number | null;
    is_counter?: boolean | null;
    limit?: number | null;
    booking_mode?: string | null;
    slot_interval_minutes?: number | null;
    max_per_slot?: number | null;
    created_at?: string | null;
}

export interface QueueServiceDetailData {
    uuid: string;
    service_id: string;
    service_name?: string | null;
    description?: string | null;
    service_fee?: number | null;
    avg_service_time?: number | null;
}

export interface QueueDetailData {
    uuid: string;
    business_id: string;
    name: string;
    status?: number | null;
    limit?: number | null;
    current_length?: number | null;
    booking_mode?: string | null;
    slot_interval_minutes?: number | null;
    max_per_slot?: number | null;
    assigned_employee_id?: string | null;
    assigned_employee_name?: string | null;
    services: QueueServiceDetailData[];
}
export interface NextCustomerResponse {
    queue_user_id: string;
    token_number: string;
    customer_name?: string | null;
    appointment_type: string;  // QUEUE, FIXED, APPROXIMATE
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    service_summary?: string | null;
}

export interface LiveQueueUserItem {
    uuid: string;
    full_name?: string | null;
    phone: string;
    token?: string | null;
    service_summary: string;
    status: number;           // 1=waiting, 2=in_progress, 3=completed
    enqueue_time?: string | null;
    dequeue_time?: string | null;
    position?: number | null; // 1-indexed, only for waiting users
    estimated_wait_minutes?: number | null;   // for waiting users
    estimated_appointment_time?: string | null; // e.g. "4:30 PM"
    appointment_type?: string | null;  // QUEUE, FIXED, APPROXIMATE
    scheduled_start?: string | null;
    scheduled_end?: string | null;
    delay_minutes?: number | null;  // for APPROXIMATE: cascaded delay
}

export interface LiveQueueData {
    queue_id: string;
    queue_name: string;
    queue_status?: number | null;  // 1=registered, 2=running, 3=stopped
    date: string;
    waiting_count: number;
    in_progress_count: number;
    completed_count: number;
    current_token?: string | null;
    users: LiveQueueUserItem[];   // ordered: completed → in_progress → waiting
    employee_on_leave?: boolean;  // true when queue's employee has no schedule / closed exception for this date
}

export class QueueService extends HttpClient {
    constructor() {
        super();
    }

    async getQueues(businessId: string): Promise<QueueData[]> {
        try {
            return await this.get<QueueData[]>(`/queue/get_queues/${businessId}`);
        } catch (error: any) {
            console.error("Failed to fetch queues:", error);
            throw error;
        }
    }

    async getQueueDetail(queueId: string): Promise<QueueDetailData> {
        try {
            return await this.get<QueueDetailData>(`/queue/get_queue/${queueId}`);
        } catch (error: any) {
            console.error("Failed to fetch queue detail:", error);
            throw error;
        }
    }

    async createQueue(payload: QueueCreatePayload): Promise<QueueData> {
        try {
            return await this.post<QueueData>(`/queue/create_queue`, {
                ...payload,
                services: payload.services ?? [],
            });
        } catch (error: any) {
            console.error("Failed to create queue:", error);
            throw error;
        }
    }

    async createQueuesBatch(payload: QueueCreateBatchPayload): Promise<QueueData[]> {
        try {
            return await this.post<QueueData[]>(`/queue/create_queues_batch`, {
                business_id: payload.business_id,
                queues: payload.queues.map((q) => ({
                    name: q.name,
                    employee_id: q.employee_id || null,
                    booking_mode: q.booking_mode ?? "QUEUE",
                    slot_interval_minutes: null, // backend uses min service avg time when null
                    max_per_slot:
                        q.booking_mode === "QUEUE"
                            ? undefined
                            : (typeof q.max_per_slot === "number"
                                ? q.max_per_slot
                                : (q.max_per_slot != null && String(q.max_per_slot).trim() !== ""
                                    ? parseInt(String(q.max_per_slot), 10)
                                    : 1)),
                    services: q.services ?? [],
                })),
            });
        } catch (error: any) {
            console.error("Failed to create queues:", error);
            throw error;
        }
    }

    async updateQueue(
        queueId: string,
        businessId: string,
        payload: QueueUpdatePayload
    ): Promise<QueueData> {
        try {
            return await this.put<QueueData>(
                `/queue/update_queue/${queueId}?business_id=${encodeURIComponent(businessId)}`,
                payload
            );
        } catch (error: any) {
            console.error("Failed to update queue:", error);
            throw error;
        }
    }

    async addServicesToQueue(
        queueId: string,
        businessId: string,
        services: QueueServiceAddItem[]
    ): Promise<QueueServiceDetailData[]> {
        try {
            return await this.post<QueueServiceDetailData[]>(
                `/queue/add_services_to_queue/${queueId}?business_id=${encodeURIComponent(businessId)}`,
                { services }
            );
        } catch (error: any) {
            console.error("Failed to add services to queue:", error);
            throw error;
        }
    }

    async updateQueueService(
        queueServiceId: string,
        payload: QueueServiceUpdatePayload
    ): Promise<QueueServiceDetailData> {
        try {
            return await this.patch<QueueServiceDetailData>(
                `/queue/queue_service/${queueServiceId}`,
                payload
            );
        } catch (error: any) {
            console.error("Failed to update queue service:", error);
            throw error;
        }
    }

    async deleteQueueService(queueServiceId: string): Promise<void> {
        try {
            await this.delete(`/queue/queue_service/${queueServiceId}`);
        } catch (error: any) {
            console.error("Failed to delete queue service:", error);
            throw error;
        }
    }

    async getQueueUserDetail(queueUserId: string): Promise<QueueUserDetailResponse> {
        try {
            return await this.get<QueueUserDetailResponse>(`/queue/queue-user/${queueUserId}`);
        } catch (error: any) {
            console.error("Failed to get queue user detail:", error);
            throw error;
        }
    }

    async getQueueUsers(
        businessId?: string,
        queueId?: string,
        employeeId?: string,
        page: number = 1,
        limit: number = 10,
        search?: string
    ): Promise<QueueUserData[]> {
        try {
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString(),
            });
            if (businessId) params.append("business_id", businessId);
            if (queueId) params.append("queue_id", queueId);
            if (employeeId) params.append("employee_id", employeeId);
            if (search) params.append("search", search);

            return await this.get<QueueUserData[]>(`/queue/get_users?${params.toString()}`);
        } catch (error: any) {
            console.error("Failed to get queue users:", error);
            throw error;
        }
    }

    async getLiveQueue(queueId: string): Promise<LiveQueueData> {
        try {
            return await this.get<LiveQueueData>(`/queue/${queueId}/live`);
        } catch (error: any) {
            console.error("Failed to get live queue:", error);
            throw error;
        }
    }

    async getNextCustomer(queueId: string, date: string): Promise<NextCustomerResponse | null> {
        try {
            const params = new URLSearchParams({ date });
            return await this.get<NextCustomerResponse | null>(
                `/queue/${queueId}/next?${params.toString()}`
            );
        } catch (error: any) {
            console.error("Failed to get next customer:", error);
            throw error;
        }
    }

    async advanceQueue(queueId: string): Promise<LiveQueueData> {
        try {
            return await this.post<LiveQueueData>(`/queue/${queueId}/next`);
        } catch (error: any) {
            console.error("Failed to advance queue:", error);
            throw error;
        }
    }

    async startQueue(queueId: string, businessId: string): Promise<QueueData> {
        try {
            return await this.post<QueueData>(
                `/queue/${queueId}/start?business_id=${encodeURIComponent(businessId)}`
            );
        } catch (error: any) {
            console.error("Failed to start queue:", error);
            throw error;
        }
    }

    async stopQueue(queueId: string, businessId: string): Promise<QueueData> {
        try {
            return await this.post<QueueData>(
                `/queue/${queueId}/stop?business_id=${encodeURIComponent(businessId)}`
            );
        } catch (error: any) {
            console.error("Failed to stop queue:", error);
            throw error;
        }
    }
}
