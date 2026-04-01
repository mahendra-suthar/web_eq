import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface DaySchedule {
    day_of_week: number;
    day_name: string;
    is_open: boolean;
    opening_time: string;
    closing_time: string;
}

export interface AddressData {
    unit_number?: string;
    building?: string;
    floor?: string;
    street_1: string;
    street_2?: string;
    city: string;
    district?: string;
    state: string;
    postal_code: string;
    country: string;
    latitude?: number;
    longitude?: number;
}

export interface EmployeeData {
    uuid?: string;
    user_id?: string;
    is_owner?: boolean;
    full_name: string;
    email?: string;
    country_code?: string;
    phone_number?: string;
    profile_picture?: File; // Note: File objects don't persist well in localStorage
}

export interface ServiceData {
    name: string;
    description?: string;
    image?: File; // Note: File objects don't persist well in localStorage
    category_id?: string;
}

export interface QueueServiceData {
    service_id: string;
    avg_service_time?: number;
    fee?: number;
}

export interface QueueCreatePayload {
    services: {
        service_id: string;
        avg_service_time?: number;
        service_fee?: number;
    }[];
}

export interface QueueData {
    name: string;
    employee_id: string;
    services: QueueServiceData[];
    avg_service_time?: number;
    fee?: number;
    booking_mode?: string; // QUEUE | FIXED | APPROXIMATE | HYBRID
    slot_interval_minutes?: string | number;
    max_per_slot?: string | number;
}

export interface RegistrationData {
    business_name: string;
    business_email: string;
    about_business?: string;
    category_id: string;
    subcategory_ids: string[];
    profile_picture?: File; // Note: File objects don't persist well in localStorage
    is_always_open: boolean;
    schedule: DaySchedule[];
    address: AddressData;
    employees: EmployeeData[];
    services: ServiceData[];
    queues: QueueData[];
}

interface BusinessRegistrationState {
    currentStep: number;
    businessId: string | null;
    registrationData: Partial<RegistrationData>;
    isSelfEmployee: boolean;
    ownerEmployeeId: string | null;
    entryPhone: { localNumber: string; countryCode: string } | null;
    entryUserType: string;

    setStep: (step: number) => void;
    setBusinessId: (id: string | null) => void;
    setRegistrationData: (data: Partial<RegistrationData>) => void;
    updateRegistrationData: (data: Partial<RegistrationData>) => void;
    setSelfEmployee: (value: boolean) => void;
    setOwnerEmployeeId: (id: string | null) => void;
    setEntryPhone: (phone: { localNumber: string; countryCode: string } | null) => void;
    setEntryUserType: (userType: string) => void;
    resetRegistration: () => void;
}

export const useBusinessRegistrationStore = create(
    persist<BusinessRegistrationState>(
        (set) => ({
            currentStep: 1,
            businessId: null,
            isSelfEmployee: false,
            ownerEmployeeId: null,
            entryPhone: null,
            entryUserType: "",
            registrationData: {
                is_always_open: false,
                subcategory_ids: [],
                schedule: [],
                employees: [],
                services: [],
                queues: [],
            },

            setStep: (step) => set({ currentStep: step }),
            setBusinessId: (id) => set({ businessId: id }),
            setRegistrationData: (data) => set({ registrationData: data }),
            updateRegistrationData: (data) =>
                set((state) => ({
                    registrationData: { ...state.registrationData, ...data }
                })),

            setSelfEmployee: (value) => set({ isSelfEmployee: value }),
            setOwnerEmployeeId: (id) => set({ ownerEmployeeId: id }),
            setEntryPhone: (phone) => set({ entryPhone: phone }),
            setEntryUserType: (userType) => set({ entryUserType: userType }),
            resetRegistration: () => set({
                currentStep: 1,
                businessId: null,
                isSelfEmployee: false,
                ownerEmployeeId: null,
                entryPhone: null,
                entryUserType: "",
                registrationData: {
                    is_always_open: false,
                    subcategory_ids: [],
                    schedule: [],
                    employees: [],
                    services: [],
                    queues: [],
                },
            }),
        }),
        {
            name: "web-eq-business-registration",
            storage: createJSONStorage(() => localStorage),
            // We might need to handle File objects specially if we want them to persist, 
            // but for now we'll stick to basic persistence. File objects will be lost on reload 
            // if not handled separately (e.g. converting to base64), but that's a known limitation 
            // for localStorage.
        }
    )
);
