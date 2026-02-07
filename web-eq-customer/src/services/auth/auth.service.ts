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
   * Verify OTP and get authentication token.
   */
  async verifyOTP(
    countryCode: string,
    phoneNumber: string,
    otp: string,
    userType: string = 'customer',
    clientType: string = 'web'
  ): Promise<LoginResponse> {
    try {
      return await this.post<LoginResponse>('/auth/verify-otp', {
        country_code: countryCode,
        phone_number: phoneNumber,
        otp: otp,
        user_type: userType.toLowerCase(),
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
}
