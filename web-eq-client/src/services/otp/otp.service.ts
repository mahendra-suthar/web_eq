import { HttpClient } from '../api/httpclient.service';

// TypeScript interfaces matching backend schemas
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


export class OTPService extends HttpClient {
  constructor() {
    super();
  }

  async sendOTP(countryCode: string, phoneNumber: string, userType: string): Promise<void> {
    try {
      await this.post("/auth/send-otp", { 
        country_code: countryCode,
        phone_number: phoneNumber,
        user_type: userType.toLowerCase()
      }, {
        headers: {
          "Content-Type": "application/json",
        }, 
      });
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to send OTP";
      throw error;
    }
  }

  /**
   * Business/Employee OTP verification. Backend returns next_step and profile_type.
   * Use this for web-eq-client; navigation must be driven by response.next_step.
   */
  async businessVerifyOTP(
    countryCode: string,
    phoneNumber: string,
    otp: string,
    clientType: string = "web"
  ): Promise<LoginResponse> {
    try {
      return await this.post<LoginResponse>("/auth/business-verify-otp", {
        country_code: countryCode,
        phone_number: phoneNumber,
        otp,
        client_type: clientType,
      }, {
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "OTP verification failed";
      throw error;
    }
  }

  async createUser(
    countryCode: string,
    phoneNumber: string,
    fullName: string,
    email: string | null,
    dateOfBirth: string | null,
    gender: number | null,
    userType: string = "customer",
    clientType: string = "web"
  ): Promise<LoginResponse> {
    try {
      const res = await this.post("/auth/create-user", {
        country_code: countryCode,
        phone_number: phoneNumber,
        full_name: fullName,
        email: email || null,
        date_of_birth: dateOfBirth || null,
        gender: gender,
        user_type: userType.toLowerCase(),
        client_type: clientType
      }, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      return res;
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to create user profile";
      throw error;
    }
  }

  async createBusinessOwner(
    countryCode: string,
    phoneNumber: string,
    fullName: string,
    email: string | null,
    dateOfBirth: string | null,
    gender: number | null
  ): Promise<UserData> {
    try {
      return await this.post("/auth/create-business-owner", {
        country_code: countryCode,
        phone_number: phoneNumber,
        full_name: fullName,
        email: email || null,
        date_of_birth: dateOfBirth || null,
        gender: gender
      }, {
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to create business owner";
      throw error;
    }
  }

  async updateUserProfile(
    countryCode: string,
    phoneNumber: string,
    fullName: string,
    email: string | null,
    dateOfBirth: string | null,
    gender: number | null,
    userType: string = "customer",
    clientType: string = "web"
  ): Promise<LoginResponse> {
    try {
      const res = await this.put("/auth/update-profile", {
        country_code: countryCode,
        phone_number: phoneNumber,
        full_name: fullName,
        email: email || null,
        date_of_birth: dateOfBirth || null,
        gender: gender,
        user_type: userType.toLowerCase(),
        client_type: clientType
      }, {
        headers: {
          "Content-Type": "application/json",
        },
      });
      return res;
    } catch (error: any) {
      error.customMessage =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        "Failed to update user profile";
      throw error;
    }
  }
}
