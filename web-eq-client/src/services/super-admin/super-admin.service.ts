import { HttpClient } from "../api/httpclient.service";
import { OTPService } from "../otp/otp.service";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AdminStats {
  total_users: number;
  total_businesses: number;
  active_businesses: number;
  total_categories: number;
  total_services: number;
  total_queues: number;
  total_appointments: number;
}

export interface CategoryAdminItem {
  uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  parent_category_id: string | null;
  subcategories_count: number;
  services_count: number;
  businesses_count: number;
}

export interface ServiceAdminItem {
  uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  category_id: string | null;
  category_name: string | null;
}

export interface BusinessAdminItem {
  uuid: string;
  name: string;
  email: string | null;
  phone_number: string;
  status: number;
  status_label: string;
  category_id: string | null;
  category_name: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  created_at: string;
}

export interface UserAdminItem {
  uuid: string;
  full_name: string | null;
  phone_number: string;
  email: string | null;
  roles: string[];
  created_at: string;
}

export interface ImpersonationResult {
  token: string;
  business_name: string;
  business_uuid: string;
  expires_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface CategoryPayload {
  name: string;
  description?: string | null;
  image?: string | null;
  parent_category_id?: string | null;
}

export interface ServicePayload {
  name: string;
  description?: string | null;
  image?: string | null;
  category_id?: string | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class SuperAdminService extends HttpClient {
  private readonly base = "/admin";
  private readonly otp = new OTPService();

  // Stats
  async getStats(): Promise<AdminStats> {
    return this.get(`${this.base}/stats`);
  }

  // Categories
  async getCategories(params: { page?: number; limit?: number; search?: string } = {}): Promise<PaginatedResponse<CategoryAdminItem>> {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.search) q.set("search", params.search);
    return this.get(`${this.base}/categories?${q}`);
  }

  async createCategory(data: CategoryPayload): Promise<CategoryAdminItem> {
    return this.post(`${this.base}/categories`, data);
  }

  async updateCategory(uuid: string, data: Partial<CategoryPayload>): Promise<CategoryAdminItem> {
    return this.put(`${this.base}/categories/${uuid}`, data);
  }

  async deleteCategory(uuid: string): Promise<void> {
    return this.delete(`${this.base}/categories/${uuid}`);
  }

  // Services
  async getServices(params: { page?: number; limit?: number; search?: string; category_id?: string } = {}): Promise<PaginatedResponse<ServiceAdminItem>> {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.search) q.set("search", params.search);
    if (params.category_id) q.set("category_id", params.category_id);
    return this.get(`${this.base}/services?${q}`);
  }

  async createService(data: ServicePayload): Promise<ServiceAdminItem> {
    return this.post(`${this.base}/services`, data);
  }

  async updateService(uuid: string, data: Partial<ServicePayload>): Promise<ServiceAdminItem> {
    return this.put(`${this.base}/services/${uuid}`, data);
  }

  async deleteService(uuid: string): Promise<void> {
    return this.delete(`${this.base}/services/${uuid}`);
  }

  // Businesses
  async getBusinesses(params: { page?: number; limit?: number; search?: string; status?: number } = {}): Promise<PaginatedResponse<BusinessAdminItem>> {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.search) q.set("search", params.search);
    if (params.status !== undefined) q.set("status", String(params.status));
    return this.get(`${this.base}/businesses?${q}`);
  }

  async updateBusinessStatus(uuid: string, status: number): Promise<BusinessAdminItem> {
    return this.patch(`${this.base}/businesses/${uuid}/status`, { status });
  }

  async impersonateBusiness(uuid: string): Promise<ImpersonationResult> {
    return this.post(`${this.base}/businesses/${uuid}/impersonate`);
  }

  // Users
  async getUsers(params: { page?: number; limit?: number; search?: string } = {}): Promise<PaginatedResponse<UserAdminItem>> {
    const q = new URLSearchParams();
    if (params.page) q.set("page", String(params.page));
    if (params.limit) q.set("limit", String(params.limit));
    if (params.search) q.set("search", params.search);
    return this.get(`${this.base}/users?${q}`);
  }

  async assignRole(userUuid: string, role: string): Promise<void> {
    return this.post(`${this.base}/users/${userUuid}/roles`, { role });
  }

  async revokeRole(userUuid: string, role: string): Promise<void> {
    return this.post(`${this.base}/users/${userUuid}/roles/revoke`, { role });
  }

  async sendOtp(countryCode: string, phoneNumber: string): Promise<void> {
    return this.otp.sendOTP(countryCode, phoneNumber, "business");
  }

  async verifyOtp(countryCode: string, phoneNumber: string, otp: string): Promise<{
    token: { access_token: string; token_type: string };
    user: unknown;
    next_step: string;
    profile_type: string;
  }> {
    return this.post("/auth/admin-verify-otp", {
      country_code: countryCode,
      phone_number: phoneNumber,
      otp,
    });
  }
}
