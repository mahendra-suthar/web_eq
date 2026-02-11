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
   * Get customer profile (personal details only). Requires customer auth.
   */
  async getCustomerProfile(): Promise<{ user: UserData; address?: unknown }> {
    try {
      return await this.get<{ user: UserData; address?: unknown }>('/auth/profile/customer');
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        'Failed to fetch profile';
      throw error;
    }
  }
}
