import { HttpClient } from '../api/httpclient.service';

export interface OwnerInfo {
  uuid: string;
  full_name?: string | null;
  email?: string;
  phone_number: string;
  country_code: string;
  profile_picture?: string;
  date_of_birth?: string;
  gender?: number;
}

export interface BusinessInfo {
  uuid: string;
  name: string;
  email?: string;
  phone_number: string;
  country_code: string;
  about_business?: string;
  category_id?: string;
  category_name?: string;
  profile_picture?: string;
  is_always_open: boolean;
  current_step?: number | null;
  status?: number | null;
}

export interface QueueInfo {
  uuid: string;
  business_id: string;
  name: string;
  status?: number | null;
}

export interface EmployeeInfo {
  uuid: string;
  business_id: string;
  full_name: string;
  email?: string;
  phone_number?: string;
  country_code?: string;
  profile_picture?: string;
  is_verified: boolean;
  queue_id?: string | null;
  queue?: QueueInfo | null;
}

export interface ScheduleData {
  uuid: string;
  entity_id: string;
  entity_type: string;
  day_of_week: number;
  opening_time?: string;
  closing_time?: string;
  is_open: boolean;
}

export interface ScheduleInfo {
  is_always_open: boolean;
  schedules: ScheduleData[];
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
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface UnifiedProfileResponse {
  profile_type: "BUSINESS" | "EMPLOYEE" | "CUSTOMER";
  user: OwnerInfo;
  business?: BusinessInfo;
  employee?: EmployeeInfo;
  address?: AddressData;
  schedule?: ScheduleInfo;
}

export interface BusinessProfileResponse {
  owner: OwnerInfo;
  business: BusinessInfo;
  address?: AddressData;
  schedule?: ScheduleInfo;
  /** Present when profile is for an employee (employee with queue, business, address, schedule). */
  employee?: EmployeeInfo;
}

export class ProfileService extends HttpClient {
  constructor() {
    super();
  }

  async getProfile(): Promise<UnifiedProfileResponse> {
    try {
      return await this.get<UnifiedProfileResponse>("/auth/profile");
    } catch (error: any) {
      console.error("Failed to fetch profile:", error);
      throw error;
    }
  }

  /** Business profile: business details and owner. Used after next_step = dashboard. */
  async getBusinessProfile(): Promise<BusinessProfileResponse> {
    try {
      return await this.get<BusinessProfileResponse>("/auth/profile/business");
    } catch (error: any) {
      console.error("Failed to fetch business profile:", error);
      throw error;
    }
  }
}
