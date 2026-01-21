import { HttpClient } from "../api/httpclient.service";
import { EmployeeData } from "../../utils/businessRegistrationStore";

interface CreateEmployeesPayload {
    business_id: string;
    employees: {
        full_name: string;
        email?: string | null;
        profile_picture?: string | null;
    }[];
}

export interface EmployeeResponse {
    uuid: string;
    business_id: string;
    full_name: string;
    email?: string | null;
    profile_picture?: string | null;
    is_verified: boolean;
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
                    full_name: emp.full_name, email: emp.email || null, profile_picture: null
                }))
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
            return await this.put<EmployeeData>(`/employee/update_employee/${employeeId}`, employeeData);
        } catch (error: any) {
            console.error("Failed to update employee:", error);
            const errorMessage = error?.response?.data?.detail?.message || "Failed to update employee";
            const errorCode = error?.response?.data?.detail?.error_code;
            const customError: any = new Error(errorMessage);
            customError.errorCode = errorCode;
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
}
