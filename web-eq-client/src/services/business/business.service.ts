import { HttpClient } from '../api/httpclient.service';

export interface Category {
  uuid: string;
  name: string;
  description?: string;
  image?: string;
}

export interface BusinessBasicInfoInput {
  name: string;
  email?: string;
  about_business?: string;
  category_id: string;
  profile_picture?: string;
  owner_id: string;
  phone_number: string;
  country_code: string;
}

export interface BusinessBasicInfoUpdate {
  name?: string;
  email?: string;
  about_business?: string;
  category_id?: string;
  profile_picture?: string;
  phone_number?: string;
  country_code?: string;
}

export interface BusinessData {
  uuid: string;
  name: string;
  email?: string | null;
  about_business?: string | null;
  category_id: string;
  owner_id: string;
  profile_picture?: string | null;
  phone_number: string;
  country_code: string;
}

export interface ScheduleInput {
  day_of_week: number; // 0-6 (Monday-Sunday)
  opening_time?: string | null; // HH:MM format
  closing_time?: string | null; // HH:MM format
  is_open: boolean;
}

export interface ScheduleCreateInput {
  entity_id: string;
  entity_type: "BUSINESS" | "EMPLOYEE";
  is_always_open?: boolean | null;
  schedules: ScheduleInput[];
}

export interface ScheduleData {
  uuid: string;
  entity_id: string;
  entity_type: string;
  day_of_week: number;
  opening_time?: string | null;
  closing_time?: string | null;
  is_open: boolean;
}

export class BusinessService extends HttpClient {
  constructor() {
    super();
  }

  async getCategories(): Promise<Category[]> {
    try {
      const response = await this.get<Category[]>("category/get_categories/");
      return response;
    } catch (error: any) {
      console.error("Failed to fetch categories:", error);
      throw new Error(error?.response?.data?.detail?.message || "Failed to fetch categories");
    }
  }

  async createBusinessBasicInfo(data: BusinessBasicInfoInput): Promise<BusinessData> {
    try {
      const response = await this.post<BusinessData>("/business/create_basic_info", data);
      return response;
    } catch (error: any) {
      console.error("Failed to create business:", error);
      const errorMessage = error?.response?.data?.detail?.message || "Failed to create business";
      const errorCode = error?.response?.data?.detail?.error_code;
      const customError: any = new Error(errorMessage);
      customError.errorCode = errorCode;
      throw customError;
    }
  }

  async updateBusinessBasicInfo(data: BusinessBasicInfoUpdate): Promise<BusinessData> {
    try {
      const payload = Object.fromEntries(
        Object.entries(data).filter(([_, value]) => value !== undefined)
      );
      const response = await this.put<BusinessData>("/business/update_basic_info", payload);
      return response;
    } catch (error: any) {
      console.error("Failed to update business:", error);
      const errorMessage = error?.response?.data?.detail?.message || "Failed to update business";
      const customError: any = new Error(errorMessage);
      customError.errorCode = error?.response?.data?.detail?.error_code;
      throw customError;
    }
  }

  async createBusinessSchedules(
    businessId: string,
    schedules: ScheduleInput[],
    isAlwaysOpen: boolean
  ): Promise<ScheduleData[]> {
    return this.upsertSchedules(businessId, "BUSINESS", schedules, isAlwaysOpen);
  }

  async upsertSchedules(
    entityId: string,
    entityType: "BUSINESS" | "EMPLOYEE",
    schedules: ScheduleInput[],
    isAlwaysOpen?: boolean
  ): Promise<ScheduleData[]> {
    try {
      const payload: ScheduleCreateInput = {
        entity_id: entityId,
        entity_type: entityType,
        is_always_open: isAlwaysOpen ?? false,
        schedules,
      };
      const response = await this.post<ScheduleData[]>("/schedule/create_schedules", payload);
      return response;
    } catch (error: any) {
      console.error("Failed to save schedules:", error);
      const errorMessage = error?.response?.data?.detail?.message || "Failed to save schedules";
      const customError: any = new Error(errorMessage);
      customError.errorCode = error?.response?.data?.detail?.error_code;
      throw customError;
    }
  }
}
