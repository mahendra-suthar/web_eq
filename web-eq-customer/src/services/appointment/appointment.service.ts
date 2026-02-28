/**
 * Customer appointment API: today, list, and get by id.
 */
import { HttpClient } from '../api/httpclient.service';

export interface TodayAppointmentResponse {
  queue_user_id: string;
  queue_id: string;
  queue_name: string;
  business_id: string;
  business_name: string;
  token_number: string;
  status: number;
  position: number | null;
  estimated_wait_minutes: number | null;
  estimated_wait_range: string | null;
  estimated_appointment_time: string | null;
  service_summary: string | null;
}

export interface CustomerAppointmentListItem {
  queue_user_id: string;
  queue_id: string;
  queue_name: string;
  business_id: string;
  business_name: string;
  queue_date: string;
  status: number;
  token_number?: string | null;
  service_summary?: string | null;
  created_at?: string | null;
  position?: number | null;
  estimated_wait_minutes?: number | null;
  estimated_wait_range?: string | null;
  estimated_appointment_time?: string | null;
}

export interface CustomerAppointmentListResponse {
  items: CustomerAppointmentListItem[];
  total: number;
  has_more: boolean;
}

export interface CustomerAppointmentDetailResponse {
  queue_user_id: string;
  queue_id: string;
  queue_name: string;
  business_id: string;
  business_name: string;
  queue_date: string;
  status: number;
  token_number?: string | null;
  service_summary?: string | null;
  position?: number | null;
  estimated_wait_minutes?: number | null;
  estimated_wait_range?: string | null;
  estimated_appointment_time?: string | null;
  enqueue_time?: string | null;
  dequeue_time?: string | null;
  created_at?: string | null;
}

export interface TodayAppointmentsResponse {
  items: TodayAppointmentResponse[];
}

export class AppointmentService extends HttpClient {
  async getTodayAppointments(): Promise<TodayAppointmentResponse[]> {
    try {
      const response = await this.get<TodayAppointmentsResponse>('/customer/appointments/today');
      return response?.items ?? [];
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        return [];
      }
      throw err;
    }
  }

  async getAppointments(limit: number = 5, offset: number = 0): Promise<CustomerAppointmentListResponse> {
    const response = await this.get<CustomerAppointmentListResponse>(
      `/customer/appointments?limit=${limit}&offset=${offset}`
    );
    return {
      items: response?.items ?? [],
      total: response?.total ?? 0,
      has_more: response?.has_more ?? false,
    };
  }
}
