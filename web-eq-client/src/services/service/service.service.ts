import { HttpClient } from "../api/httpclient.service";

export interface ServiceData {
    uuid: string;
    service_uuid?: string; // Optional for backward compatibility
    name: string;
    description?: string;
    image?: string;
    category_id?: string;
    service_fee?: number;
    avg_service_time?: number;
}

export class ServiceService extends HttpClient {
    constructor() {
        super();
    }

    async getServicesByCategory(categoryId: string): Promise<ServiceData[]> {
        try {
            return await this.get<ServiceData[]>(`/service/get_services/${categoryId}`);
        } catch (error: any) {
            console.error("Failed to fetch services:", error);
            throw error;
        }
    }

    async getAllServices(): Promise<ServiceData[]> {
        try {
            return await this.get<ServiceData[]>(`/service/get_all_services`);
        } catch (error: any) {
            console.error("Failed to fetch all services:", error);
            throw error;
        }
    }

    /** Services in the business's category (for queue detail add-service). */
    async getServicesByBusiness(businessId: string): Promise<ServiceData[]> {
        try {
            return await this.get<ServiceData[]>(`/service/get_services_by_business/${businessId}`);
        } catch (error: any) {
            console.error("Failed to fetch services by business:", error);
            throw error;
        }
    }
}
