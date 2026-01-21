import { HttpClient } from "../api/httpclient.service";

export interface QueueCreatePayload {
    business_id: string;
    name: string;
    employee_id: string;
    services: {
        service_id: string;
        avg_service_time?: number;
        service_fee?: number;
    }[];
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

export class QueueService extends HttpClient {
    constructor() {
        super();
    }

    async createQueue(payload: QueueCreatePayload): Promise<any> {
        try {
            return await this.post<any>(`/queue/create_queue`, payload);
        } catch (error: any) {
            console.error("Failed to create queue:", error);
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
