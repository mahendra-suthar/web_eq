import { HttpClient } from "../api/httpclient.service";

export interface AppointmentUserItem {
    user_id: string;
    full_name?: string | null;
    email?: string | null;
    country_code?: string | null;
    phone_number: string;
    total_appointments: number;
    last_visit_date?: string | null;
}

export interface UsersAppointmentsResponse {
    items: AppointmentUserItem[];
    total: number;
    page: number;
    limit: number;
}

export interface GetUsersAppointmentsParams {
    business_id?: string;
    queue_id?: string;
    page?: number;
    limit?: number;
    search?: string;
}

/** User detail (GET /users/{user_id}) */
export interface UserDetailUserInfo {
    user_id: string;
    full_name?: string | null;
    email?: string | null;
    country_code?: string | null;
    phone_number: string;
    profile_picture?: string | null;
    date_of_birth?: string | null;
    gender?: number | null;
    member_since?: string | null;
}

export interface QueueSummaryItem {
    queue_id: string;
    queue_name: string;
    total_appointments: number;
    last_visit?: string | null;
}

export interface UserDetailResponse {
    user_info: UserDetailUserInfo;
    queue_summary: QueueSummaryItem[];
}

export class UserService extends HttpClient {
    constructor() {
        super();
    }

    /**
     * Fetches unique users who have created appointments (QueueUsers).
     * Exactly one of business_id or queue_id must be provided.
     */
    async getUsersAppointments(params: GetUsersAppointmentsParams): Promise<UsersAppointmentsResponse> {
        const { business_id, queue_id, page = 1, limit = 20, search } = params;
        const searchParams = new URLSearchParams({
            page: String(page),
            limit: String(limit),
        });
        if (business_id) searchParams.set("business_id", business_id);
        if (queue_id) searchParams.set("queue_id", queue_id);
        if (search) searchParams.set("search", search);

        const url = `/users/appointments?${searchParams.toString()}`;
        return await this.get<UsersAppointmentsResponse>(url);
    }

    /** Fetches full user detail with queue-wise appointment summary. */
    async getUserDetail(userId: string): Promise<UserDetailResponse> {
        return await this.get<UserDetailResponse>(`/users/${userId}`);
    }

    async exportUsers(params: {
        business_id?: string;
        queue_id?: string;
        format: "pdf" | "xlsx";
    }): Promise<Blob> {
        return this.get("/users/appointments/export", {
            params,
            responseType: "blob",
        });
    }
}
