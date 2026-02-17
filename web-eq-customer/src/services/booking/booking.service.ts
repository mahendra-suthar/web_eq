/**
 * Booking service for queue slot availability and booking creation.
 */
import { HttpClient } from '../api/httpclient.service';
import type {
  AvailableSlotData,
  BookingData,
  BookingPreviewData,
} from '../../store/booking.store';

export interface BookingCreateInput {
  business_id: string;
  queue_id?: string; // Optional – backend auto-selects optimal queue if omitted
  queue_date: string; // YYYY-MM-DD
  service_ids: string[]; // QueueService UUIDs
  notes?: string;
}

export class BookingService extends HttpClient {
  constructor() {
    super();
  }

  /**
   * Get booking preview: queue options with position, estimated wait time, and appointment time.
   * Use this after user selects date and services to show dynamic estimates before confirmation.
   */
  async getBookingPreview(
    businessId: string,
    date: string,
    serviceIds: string[]
  ): Promise<BookingPreviewData> {
    try {
      const params = new URLSearchParams();
      params.append('business_id', businessId);
      params.append('booking_date', date);
      serviceIds.forEach((id) => params.append('service_ids', id));
      const url = `/queue/booking-preview?${params.toString()}`;
      return await this.post<BookingPreviewData>(url, {});
    } catch (error: any) {
      console.error('Failed to fetch booking preview:', error);
      throw error;
    }
  }

  /**
   * Get available booking slots for a business on a specific date (legacy).
   * @param businessId - Business UUID
   * @param date - Date in YYYY-MM-DD format
   * @param serviceIds - Optional array of QueueService UUIDs to filter by
   */
  async getAvailableSlots(
    businessId: string,
    date: string,
    serviceIds?: string[]
  ): Promise<AvailableSlotData[]> {
    try {
      const params = new URLSearchParams();
      params.append('booking_date', date);

      if (serviceIds && serviceIds.length > 0) {
        serviceIds.forEach((id) => params.append('service_ids', id));
      }

      const url = `/queue/available_slots/${businessId}?${params.toString()}`;
      return await this.get<AvailableSlotData[]>(url);
    } catch (error: any) {
      console.error('Failed to fetch available slots:', error);
      throw error;
    }
  }

  /**
   * Create a booking for the authenticated user.
   * Requires authentication.
   */
  async createBooking(input: BookingCreateInput): Promise<BookingData> {
    try {
      return await this.post<BookingData>('/queue/book', input);
    } catch (error: any) {
      console.error('Failed to create booking:', error);
      throw error;
    }
  }

  /**
   * Get user's bookings (requires authentication).
   */
  async getMyBookings(): Promise<BookingData[]> {
    try {
      return await this.get<BookingData[]>('/queue/my_bookings');
    } catch (error: any) {
      console.error('Failed to fetch bookings:', error);
      throw error;
    }
  }
}
