/**
 * Authentication service for OTP-based login.
 */
import { HttpClient } from '../api/httpclient.service';

export interface Token {
  access_token: string;
  token_type: string;
}

export interface UserData {
  uuid: string;
  country_code: string;
  phone_number: string;
  full_name?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: number | null;
}

export interface CustomerProfileAddress {
  unit_number?: string | null;
  building?: string | null;
  floor?: string | null;
  street_1: string;
  street_2?: string | null;
  city: string;
  district?: string | null;
  state: string;
  postal_code: string;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface CustomerProfileResponse {
  user: UserData & { profile_picture?: string | null };
  address?: CustomerProfileAddress | null;
}

export interface CustomerProfileUpdateInput {
  full_name?: string | null;
  email?: string | null;
  date_of_birth?: string | null;
  gender?: number | null;
}

export interface LoginResponse {
  token?: Token | null;
  user?: UserData | null;
  next_step?: string | null;
  profile_type?: string | null;
}

export interface OTPRequestResponse {
  message: string;
}

export class AuthService extends HttpClient {
  constructor() {
    super();
  }

  /**
   * Send OTP to phone number.
   */
  async sendOTP(countryCode: string, phoneNumber: string, userType: string = 'customer'): Promise<OTPRequestResponse> {
    try {
      return await this.post<OTPRequestResponse>('/auth/send-otp', {
        country_code: countryCode,
        phone_number: phoneNumber,
        user_type: userType.toLowerCase(),
      });
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        'Failed to send OTP';
      throw error;
    }
  }

  /**
   * Verify OTP (customer only). Creates/fetches customer, returns auth token.
   * Use this for customer app; no business/employee logic.
   */
  async verifyOTPCustomer(
    countryCode: string,
    phoneNumber: string,
    otp: string,
    clientType: string = 'web'
  ): Promise<LoginResponse> {
    try {
      return await this.post<LoginResponse>('/auth/verify-otp-customer', {
        country_code: countryCode,
        phone_number: phoneNumber,
        otp,
        client_type: clientType,
      });
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        'OTP verification failed';
      throw error;
    }
  }

  /**
   * Get customer profile (personal details + address). Requires customer auth.
   */
  async getCustomerProfile(): Promise<CustomerProfileResponse> {
    try {
      return await this.get<CustomerProfileResponse>('/customer/profile');
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        'Failed to fetch profile';
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.post("/auth/logout", {});
    } catch (error: any) {
      const status = error?.response?.status;
      const code = error?.code;
      if (status !== 401 && status !== 403 && code !== "ERR_NETWORK") {
        console.warn("Logout request failed unexpectedly:", error?.message ?? error);
      }
    }
  }

  /**
   * Update customer profile (partial). Requires customer auth.
   */
  async updateCustomerProfile(data: CustomerProfileUpdateInput): Promise<CustomerProfileResponse> {
    try {
      return await this.patch<CustomerProfileResponse>('/customer/profile', data);
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        'Failed to update profile';
      throw error;
    }
  }
}
