import { HttpClient } from '../api/httpclient.service';

/** Global service row from GET /service/get_services (Service model). */
export interface GlobalServiceData {
  uuid: string;
  service_uuid: string;
  name: string;
  description?: string | null;
  image?: string | null;
  category_id?: string | null;
}

const servicesByCategoryCache = new Map<string, GlobalServiceData[]>();
const servicesByCategoryInFlight = new Map<string, Promise<GlobalServiceData[]>>();

export class ServiceService extends HttpClient {
  constructor() {
    super();
  }

  /** Clear all cached service responses (e.g. on full category refresh). */
  static clearCaches(): void {
    servicesByCategoryCache.clear();
    servicesByCategoryInFlight.clear();
  }

  /**
   * GET /service/get_services?category_ids=id1&category_ids=id2
   * Single IN-query on the backend for one or more subcategory UUIDs.
   * Results are cached by sorted key to deduplicate concurrent requests.
   */
  async getServicesByCategories(categoryIds: string[]): Promise<GlobalServiceData[]> {
    if (categoryIds.length === 0) return [];

    const cacheKey = [...categoryIds].sort().join(',');
    const cached = servicesByCategoryCache.get(cacheKey);
    if (cached) return Promise.resolve(cached);

    const inFlight = servicesByCategoryInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const params = new URLSearchParams();
    categoryIds.forEach((id) => params.append('category_ids', id));

    const promise = this.get<GlobalServiceData[] | { data: GlobalServiceData[] }>(
      `/service/get_services?${params.toString()}`
    )
      .then((response) => {
        const raw = Array.isArray(response) ? response : (response as { data?: GlobalServiceData[] })?.data ?? [];
        servicesByCategoryCache.set(cacheKey, raw);
        return raw;
      })
      .finally(() => { servicesByCategoryInFlight.delete(cacheKey); });

    servicesByCategoryInFlight.set(cacheKey, promise);
    return promise;
  }
}
