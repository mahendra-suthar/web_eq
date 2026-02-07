export type QueueSlot = {
  id: string;
  businessId: string;
  serviceId: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:mm (for time slots)
  queueNumber?: string; // for queue tokens
  estimatedWait?: number; // minutes (for queue tokens)
  available: boolean;
  price: number;
  currency?: string;
};

export type AvailabilityType = "time_slot" | "queue_token";

export const mockQueues: QueueSlot[] = [
  // Time slots for salon-1 on today + next 7 days
  { id: "q-1", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-21", time: "10:00", available: true, price: 500, currency: "INR" },
  { id: "q-2", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-21", time: "10:30", available: true, price: 500, currency: "INR" },
  { id: "q-3", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-21", time: "11:00", available: false, price: 500, currency: "INR" },
  { id: "q-4", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-21", time: "14:00", available: true, price: 500, currency: "INR" },
  { id: "q-5", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-21", time: "14:30", available: true, price: 500, currency: "INR" },
  { id: "q-6", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-22", time: "09:00", available: true, price: 500, currency: "INR" },
  { id: "q-7", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-22", time: "09:30", available: true, price: 500, currency: "INR" },
  { id: "q-8", businessId: "salon-1", serviceId: "svc-1", date: "2025-01-22", time: "10:00", available: true, price: 500, currency: "INR" },
  
  // Queue tokens for clinic-1
  { id: "q-9", businessId: "clinic-1", serviceId: "svc-6", date: "2025-01-21", queueNumber: "A15", estimatedWait: 30, available: true, price: 500, currency: "INR" },
  { id: "q-10", businessId: "clinic-1", serviceId: "svc-6", date: "2025-01-21", queueNumber: "A16", estimatedWait: 45, available: true, price: 500, currency: "INR" },
  { id: "q-11", businessId: "clinic-1", serviceId: "svc-6", date: "2025-01-21", queueNumber: "A17", estimatedWait: 60, available: true, price: 500, currency: "INR" },
  { id: "q-12", businessId: "clinic-1", serviceId: "svc-6", date: "2025-01-22", queueNumber: "B01", estimatedWait: 15, available: true, price: 500, currency: "INR" },
  { id: "q-13", businessId: "clinic-1", serviceId: "svc-6", date: "2025-01-22", queueNumber: "B02", estimatedWait: 30, available: true, price: 500, currency: "INR" },
  
  // Time slots for spa-1
  { id: "q-14", businessId: "spa-1", serviceId: "svc-12", date: "2025-01-21", time: "11:00", available: true, price: 2000, currency: "INR" },
  { id: "q-15", businessId: "spa-1", serviceId: "svc-12", date: "2025-01-21", time: "14:00", available: true, price: 2000, currency: "INR" },
  { id: "q-16", businessId: "spa-1", serviceId: "svc-12", date: "2025-01-21", time: "16:00", available: false, price: 2000, currency: "INR" },
  { id: "q-17", businessId: "spa-1", serviceId: "svc-12", date: "2025-01-22", time: "10:00", available: true, price: 2000, currency: "INR" },
  { id: "q-18", businessId: "spa-1", serviceId: "svc-12", date: "2025-01-22", time: "13:00", available: true, price: 2000, currency: "INR" },
];

export const getQueuesByBusinessAndDate = (businessId: string, date: string, serviceId?: string): QueueSlot[] => {
  return mockQueues.filter((q) => {
    const matchesBusiness = q.businessId === businessId;
    const matchesDate = q.date === date;
    const matchesService = serviceId ? q.serviceId === serviceId : true;
    return matchesBusiness && matchesDate && matchesService && q.available;
  });
};

export const getQueueById = (queueId: string): QueueSlot | undefined => {
  return mockQueues.find((q) => q.id === queueId);
};

export const getAvailabilityType = (businessId: string): AvailabilityType => {
  // Mock logic: salons and spas use time slots, clinics use queue tokens
  if (businessId.includes("clinic")) {
    return "queue_token";
  }
  return "time_slot";
};
