import { HttpClient } from '../api/httpclient.service';

export interface BusinessListItem {
  uuid: string;
  name: string;
  about_business: string | null;
  profile_picture: string | null;
  category_id: string | null;
  category_name: string | null;
  service_names: string[] | null;
  min_price: number | null;
  max_price: number | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_open: boolean;
  is_always_open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  rating: number;
  review_count: number;
}

export interface AddressData {
  unit_number: string | null;
  building: string | null;
  floor: string | null;
  street_1: string | null;
  street_2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface BusinessDetailData {
  uuid: string;
  name: string;
  about_business: string | null;
  profile_picture: string | null;
  phone_number: string | null;
  country_code: string | null;
  email: string | null;
  category_id: string | null;
  category_name: string | null;
  address: AddressData | null;
  is_open: boolean;
}

export interface BusinessServiceData {
  uuid: string;
  service_uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  price: number | null;
  duration: number | null;
}

export class BusinessService extends HttpClient {
  constructor() {
    super();
  }

  async getBusinesses(categoryId?: string, serviceIds?: string[]): Promise<BusinessListItem[]> {
    try {
      const params = new URLSearchParams();
      if (categoryId) {
        params.append('category_id', categoryId);
      }
      if (serviceIds && serviceIds.length > 0) {
        serviceIds.forEach(id => params.append('service_ids', id));
      }
      
      const queryString = params.toString();
      const url = `/business/get_businesses${queryString ? `?${queryString}` : ''}`;
      return await this.get<BusinessListItem[]>(url);
    } catch (error: any) {
      console.error("Failed to fetch businesses:", error);
      throw error;
    }
  }

  async getBusinessDetails(businessId: string): Promise<BusinessDetailData> {
    try {
      return await this.get<BusinessDetailData>(`/business/get_business_details/${businessId}`);
    } catch (error: any) {
      console.error("Failed to fetch business details:", error);
      throw error;
    }
  }

  async getBusinessServices(businessId: string): Promise<BusinessServiceData[]> {
    try {
      return await this.get<BusinessServiceData[]>(`/business/get_business_services/${businessId}`);
    } catch (error: any) {
      console.error("Failed to fetch business services:", error);
      throw error;
    }
  }
}
