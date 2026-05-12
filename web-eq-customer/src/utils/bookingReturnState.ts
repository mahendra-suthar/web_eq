/**
 * Persist booking context (selected services, return path) across the OTP auth flow.
 * React Router's location.state is lost on refresh or when navigation doesn't preserve history;
 * sessionStorage ensures we can restore after send-otp → verify-otp → book.
 *
 * rescheduleQueueUserId: when present, the booking page runs in "reschedule" mode —
 *   on confirm it calls PATCH /customer/appointments/{id} instead of creating a new booking.
 * rescheduleInitialDate: the original appointment date to pre-select in the date picker.
 */
const STORAGE_KEY = "eq_booking_return_state";

export interface BookingReturnState {
  returnTo: string;
  selectedServices: string[];
  /** Persisted service rows; at least uuid, name, price, duration for booking page */
  selectedServicesData: unknown[];
  businessName: string;
  /** Present when re-scheduling an existing appointment */
  rescheduleQueueUserId?: string;
  /** Original appointment date (YYYY-MM-DD) to pre-select */
  rescheduleInitialDate?: string;
}

export function saveBookingReturnState(state: BookingReturnState): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

export function getBookingReturnState(): BookingReturnState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BookingReturnState;
    if (!parsed?.returnTo) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBookingReturnState(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
