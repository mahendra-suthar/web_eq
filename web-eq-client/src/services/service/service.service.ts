import { HttpClient } from "../api/httpclient.service";

export interface ServiceData {
    uuid: string;
    service_uuid?: string;
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

    async getServicesByCategories(categoryIds: string[]): Promise<ServiceData[]> {
        if (categoryIds.length === 0) return [];
        const params = new URLSearchParams();
        categoryIds.forEach((id) => params.append("category_ids", id));
        try {
            return await this.get<ServiceData[]>(`/service/get_services?${params.toString()}`);
        } catch (error: any) {
            console.error("Failed to fetch services by categories:", error);
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

    async getServicesByBusiness(businessId: string): Promise<ServiceData[]> {
        try {
            return await this.get<ServiceData[]>(`/service/get_services_by_business/${businessId}`);
        } catch (error: any) {
            console.error("Failed to fetch services by business:", error);
            throw error;
        }
    }
}
