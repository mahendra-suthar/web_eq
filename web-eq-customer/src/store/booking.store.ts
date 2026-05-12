/**
 * Zustand store for booking state management.
 * Handles selected services, date, queue, and real-time updates.
 */
import { create } from 'zustand';
import type { BusinessDetailData, BusinessServiceData } from '../services/business/business.service';

// Types for available slots from API
export interface AvailableSlotData {
  queue_id: string;
  queue_name: string;
  date: string;
  available: boolean;
  current_position: number;
  capacity: number | null;
  estimated_wait_minutes: number;
  estimated_appointment_time: string;
  estimated_wait_range?: string; // e.g. "15-25 min" from booking-preview API
  status: string;
}

export interface QueueServiceInfo {
  queue_service_uuid: string;
  service_uuid: string;
  service_name: string;
  price: number | null;
  duration: number | null; // minutes
}

// Queue option from booking-preview API (position, wait time, appointment time)
export interface QueueOptionData {
  queue_id: string;
  queue_name: string;
  position: number;
  estimated_wait_minutes: number;
  estimated_wait_range: string;
  estimated_appointment_time: string;
  is_recommended: boolean;
  available: boolean;
  unavailability_reason?: string | null;
  services: QueueServiceInfo[];
  /** QUEUE | FIXED | APPROXIMATE | HYBRID — whether queue supports scheduled slots */
  booking_mode?: string;
}

// Time-slot for FIXED/APPROXIMATE booking (from GET /queue/slots)
export interface SlotData {
  uuid: string;
  slot_start: string;
  slot_end: string;
  capacity: number;
  booked_count: number;
  available: boolean;
  remaining: number;
}

export interface SlotsListResponse {
  queue_id: string;
  queue_name: string;
  date: string;
  booking_mode: string;
  slots: SlotData[];
}

export interface BookingPreviewData {
  business_id: string;
  date: string;
  queues: QueueOptionData[];
  recommended_queue_id: string | null;
}

// Types for booking confirmation
export interface BookingServiceData {
  uuid: string;
  name: string;
  price: number | null;
  duration: number | null;
}

export interface BookingData {
  uuid: string;
  token_number: string;
  queue_id: string;
  queue_name: string;
  business_id: string;
  business_name: string;
  queue_date: string;
  position: number;
  estimated_wait_minutes: number;
  estimated_wait_range?: string;
  estimated_appointment_time: string;
  services: BookingServiceData[];
  status: string;
  created_at: string;
  already_in_queue?: boolean;
  appointment_type?: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
}

// WebSocket message types
export interface QueueUpdateMessage {
  type: 'initial_state' | 'queue_update' | 'ping' | 'pong';
  data?: BusinessQueueState;
  timestamp?: string;
}

export interface BusinessQueueState {
  business_id: string;
  date: string;
  queues: AvailableSlotData[];
  total_waiting: number;
}

// Store state interface
interface BookingState {
  // Business context
  businessId: string | null;
  businessDetails: BusinessDetailData | null;
  allServices: BusinessServiceData[];
  
  // User selections
  selectedServices: BusinessServiceData[];
  selectedDate: string | null;
  selectedQueue: AvailableSlotData | null;
  
  // Real-time data from WebSocket
  availableSlots: AvailableSlotData[];
  totalWaiting: number;
  
  // Booking result
  bookingConfirmation: BookingData | null;
  
  // UI state
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  
  // Actions
  setBusiness: (id: string, details: BusinessDetailData, services: BusinessServiceData[]) => void;
  setSelectedServices: (services: BusinessServiceData[]) => void;
  setSelectedDate: (date: string | null) => void;
  setSelectedQueue: (queue: AvailableSlotData | null) => void;
  setAvailableSlots: (slots: AvailableSlotData[]) => void;
  updateFromWebSocket: (state: BusinessQueueState) => void;
  setBookingConfirmation: (booking: BookingData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setWsConnected: (connected: boolean) => void;
  clearBooking: () => void;
  
  // Computed
  getTotalPrice: () => number;
  getTotalDuration: () => number;
}

export const useBookingStore = create<BookingState>((set, get) => ({
  // Initial state
  businessId: null,
  businessDetails: null,
  allServices: [],
  selectedServices: [],
  selectedDate: null,
  selectedQueue: null,
  availableSlots: [],
  totalWaiting: 0,
  bookingConfirmation: null,
  loading: false,
  error: null,
  wsConnected: false,
  
  // Actions
  setBusiness: (id, details, services) => set({
    businessId: id,
    businessDetails: details,
    allServices: services,
    // Reset selections when business changes
    selectedServices: [],
    selectedDate: null,
    selectedQueue: null,
    availableSlots: [],
    bookingConfirmation: null,
    error: null,
  }),
  
  setSelectedServices: (services) => set({
    selectedServices: services,
    // Reset queue selection when services change
    selectedQueue: null,
  }),
  
  setSelectedDate: (date) => set({
    selectedDate: date,
    // Reset queue selection when date changes
    selectedQueue: null,
    availableSlots: [],
  }),
  
  setSelectedQueue: (queue) => set({
    selectedQueue: queue,
  }),
  
  setAvailableSlots: (slots) => set({
    availableSlots: slots,
  }),
  
  updateFromWebSocket: (state) => set({
    availableSlots: state.queues,
    totalWaiting: state.total_waiting,
  }),
  
  setBookingConfirmation: (booking) => set({
    bookingConfirmation: booking,
  }),
  
  setLoading: (loading) => set({ loading }),
  
  setError: (error) => set({ error }),
  
  setWsConnected: (connected) => set({ wsConnected: connected }),
  
  clearBooking: () => set({
    businessId: null,
    businessDetails: null,
    allServices: [],
    selectedServices: [],
    selectedDate: null,
    selectedQueue: null,
    availableSlots: [],
    totalWaiting: 0,
    bookingConfirmation: null,
    loading: false,
    error: null,
    wsConnected: false,
  }),
  
  // Computed values
  getTotalPrice: () => {
    const { selectedServices } = get();
    return selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
  },
  
  getTotalDuration: () => {
    const { selectedServices } = get();
    return selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);
  },
}));
