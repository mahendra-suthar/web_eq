import { HttpClient } from "../api/httpclient.service";
import { EmployeeData } from "../../utils/businessRegistrationStore";

interface CreateEmployeesPayload {
    business_id: string;
    employees: {
        full_name: string;
        email?: string | null;
        country_code?: string | null;
        phone_number?: string | null;
        profile_picture?: string | null;
    }[];
}

export interface EmployeeResponse {
    uuid: string;
    business_id: string;
    full_name: string;
    email?: string | null;
    country_code?: string | null;
    phone_number?: string | null;
    profile_picture?: string | null;
    is_verified: boolean;
    queue_id?: string | null;
}

export interface VerifyInvitationResponse {
    token?: { access_token: string; token_type: string };
    user?: unknown;
    next_step?: string;
    profile_type?: string;
}

export class EmployeeService extends HttpClient {
    constructor() {
        super();
    }

    async createEmployees(businessId: string, employees: EmployeeData[]): Promise<EmployeeData[]> {
        try {
            const payload: CreateEmployeesPayload = {
                business_id: businessId,
                employees: employees.map(emp => ({
                    full_name: emp.full_name,
                    email: emp.email || null,
                    country_code: emp.country_code || null,
                    phone_number: emp.phone_number || null,
                    profile_picture: null,
                })),
            };
            return await this.post<EmployeeData[]>(`/employee/create_employees`, payload);
        } catch (error: any) {
            console.error("Failed to create employees:", error);
            const errorMessage = error?.response?.data?.detail?.message || "Failed to create employees";
            const errorCode = error?.response?.data?.detail?.error_code;
            const customError: any = new Error(errorMessage);
            customError.errorCode = errorCode;
            throw customError;
        }
    }

    async updateEmployee(employeeId: string, employeeData: Partial<EmployeeData>): Promise<EmployeeData> {
        try {
            const payload = Object.fromEntries(
                Object.entries(employeeData).filter(([_, value]) => value !== undefined)
            );
            return await this.put<EmployeeData>(`/employee/update_employee/${employeeId}`, payload);
        } catch (error: any) {
            console.error("Failed to update employee:", error);
            const errorMessage = error?.response?.data?.detail?.message || "Failed to update employee";
            const errorCode = error?.response?.data?.detail?.error_code;
            const customError: any = new Error(errorMessage);
            customError.errorCode = errorCode;
            throw customError;
        }
    }

    /** Employee updates their own employee record (full_name, email, phone, etc.). */
    async updateMyProfile(data: {
        full_name?: string;
        email?: string | null;
        country_code?: string | null;
        phone_number?: string | null;
    }): Promise<EmployeeResponse> {
        try {
            const payload = Object.fromEntries(
                Object.entries(data).filter(([_, value]) => value !== undefined)
            );
            return await this.put<EmployeeResponse>("/employee/update_my_profile", payload);
        } catch (error: any) {
            console.error("Failed to update my profile:", error);
            const errorMessage = error?.response?.data?.detail?.message || "Failed to update profile";
            const customError: any = new Error(errorMessage);
            customError.errorCode = error?.response?.data?.detail?.error_code;
            throw customError;
        }
    }

    async getEmployees(
        businessId: string, page: number = 1, limit: number = 10, search: string = ""
    ): Promise<EmployeeResponse[]> {
        try {
            const params = new URLSearchParams({
                page: page.toString(), limit: limit.toString(), search: search,
            });
            return await this.get<EmployeeResponse[]>(`/employee/get_employees/${businessId}?${params.toString()}`);
        } catch (error: any) {
            console.error("Failed to get employees:", error);
            const errorMessage = error?.response?.data?.detail?.message || "Failed to get employees";
            const errorCode = error?.response?.data?.detail?.error_code;
            const customError: any = new Error(errorMessage);
            customError.errorCode = errorCode;
            throw customError;
        }
    }

    /**
     * Verify employee invitation code. After verification, backend returns next_step = dashboard.
     */
    async verifyInvitationCode(code: string): Promise<VerifyInvitationResponse> {
        try {
            return await this.post<VerifyInvitationResponse>("/auth/verify-invitation-code", {
                code: code.trim(),
            });
        } catch (error: any) {
            error.customMessage =
                error?.response?.data?.detail?.message ||
                error?.response?.data?.detail ||
                "Failed to verify invitation code";
            throw error;
        }
    }
}
