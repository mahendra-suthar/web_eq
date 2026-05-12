import { HttpClient } from "../api/httpclient.service";

export interface AddressCreate {
    unit_number?: string;
    building?: string;
    floor?: string;
    street_1: string;
    street_2?: string;
    city: string;
    district?: string;
    state: string;
    postal_code: string;
    country?: string;
    address_type?: string;
    latitude?: number;
    longitude?: number;
    images?: string;
}

class AddressService extends HttpClient {
    constructor() {
        super();
    }

    async createAddress(
        entityType: string,
        entityId: string,
        addressData: AddressCreate
    ) {
        return this.post(`/address/${entityType}/${entityId}`, addressData);
    }

    async getAddress(entityType: string, entityId: string) {
        return this.get(`/address/${entityType}/${entityId}`);
    }
}

export const addressService = new AddressService();
