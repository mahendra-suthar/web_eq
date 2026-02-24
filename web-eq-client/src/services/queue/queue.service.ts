import { HttpClient } from "../api/httpclient.service";

export interface QueueCreatePayload {
    business_id: string;
    name: string;
    employee_id?: string | null;
    services?: {
        service_id: string;
        avg_service_time?: number;
        service_fee?: number;
    }[];
}

export interface QueueUpdatePayload {
    name?: string;
    status?: number;
    limit?: number;
    employee_id?: string | null;
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
    assigned_employee_id?: string | null;
    services: QueueServiceDetailData[];
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
}
