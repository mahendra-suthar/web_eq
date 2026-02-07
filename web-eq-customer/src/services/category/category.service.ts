import { HttpClient } from '../api/httpclient.service';

export interface ServiceData {
  id: string;
  name: string;
}

export interface CategoryWithServicesData {
  uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  services: ServiceData[];
}

let cachedCategories: CategoryWithServicesData[] | null = null;
let inFlightPromise: Promise<CategoryWithServicesData[]> | null = null;

export class CategoryService extends HttpClient {
  constructor() {
    super();
  }

  async getCategoriesWithServices(): Promise<CategoryWithServicesData[]> {
    if (cachedCategories) {
      return Promise.resolve(cachedCategories);
    }

    if (inFlightPromise) {
      return inFlightPromise;
    }

    inFlightPromise = this.get<CategoryWithServicesData[]>("/category/get_categories_with_services")
      .then((data) => {
        cachedCategories = data;
        return data;
      })
      .finally(() => {
        inFlightPromise = null;
      });
      
    return inFlightPromise;
  }
}
