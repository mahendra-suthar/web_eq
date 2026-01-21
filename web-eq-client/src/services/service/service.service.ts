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
}
