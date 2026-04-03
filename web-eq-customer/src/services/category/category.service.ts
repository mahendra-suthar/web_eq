import { HttpClient } from '../api/httpclient.service';
import { ServiceService } from '../service/service.service';


export interface CategoryTreeNode {
  uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  parent_category_id: string | null;
  subcategories_count: number;
  services_count: number;
  children: CategoryTreeNode[];
}

export interface SubcategoryData {
  uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  service_count: number;
}

export interface CategoryDetailData {
  uuid: string;
  name: string;
  description: string | null;
  image: string | null;
  parent_category_id: string | null;
}

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

const TREE_ROOT_KEY = '__root__';
const categoryTreeCache = new Map<string, CategoryTreeNode[]>();
const categoryTreeInFlight = new Map<string, Promise<CategoryTreeNode[]>>();

let cachedAllCategories: CategoryDetailData[] | null = null;
let allCategoriesInFlight: Promise<CategoryDetailData[]> | null = null;

/** Bust all caches – call before a fresh fetch to avoid stale data. */
export function clearCategoryCache(): void {
  categoryTreeCache.clear();
  categoryTreeInFlight.clear();
  cachedAllCategories = null;
  allCategoriesInFlight = null;
  ServiceService.clearCaches();
}

function unwrapList<T>(response: unknown): T[] {
  if (Array.isArray(response)) return response as T[];
  const r = response as { data?: T[] } | null | undefined;
  return r?.data ?? [];
}

function normalizeTreeNode(raw: CategoryTreeNode): CategoryTreeNode {
  const children = (raw.children ?? []).map(normalizeTreeNode);
  return {
    uuid: raw.uuid,
    name: raw.name,
    description: raw.description ?? null,
    image: raw.image ?? null,
    parent_category_id: raw.parent_category_id ?? null,
    subcategories_count: raw.subcategories_count ?? 0,
    services_count: raw.services_count ?? 0,
    children,
  };
}

function treeCacheKey(parentId?: string | null): string {
  return parentId === undefined || parentId === null || parentId === '' ? TREE_ROOT_KEY : parentId;
}


export class CategoryService extends HttpClient {
  constructor() {
    super();
  }

  async getCategoryTree(parentId?: string | null): Promise<CategoryTreeNode[]> {
    const key = treeCacheKey(parentId);
    const cached = categoryTreeCache.get(key);
    if (cached) return Promise.resolve(cached);

    const inFlight = categoryTreeInFlight.get(key);
    if (inFlight) return inFlight;

    const qs =
      parentId !== undefined && parentId !== null && parentId !== ''
        ? `?parent_uuid=${encodeURIComponent(parentId)}`
        : '';

    const promise = this.get<CategoryTreeNode[] | { data: CategoryTreeNode[] }>(
      `/category/tree${qs}`
    )
      .then((response) => {
        const raw = unwrapList<CategoryTreeNode>(response);
        const data = raw.map(normalizeTreeNode);
        categoryTreeCache.set(key, data);
        return data;
      })
      .finally(() => {
        categoryTreeInFlight.delete(key);
      });

    categoryTreeInFlight.set(key, promise);
    return promise;
  }

  async getAllCategories(): Promise<CategoryDetailData[]> {
    if (cachedAllCategories) return Promise.resolve(cachedAllCategories);
    if (allCategoriesInFlight) return allCategoriesInFlight;

    allCategoriesInFlight = this.get<CategoryDetailData[] | { data: CategoryDetailData[] }>(
      '/category/get_categories'
    )
      .then((response) => {
        const raw = unwrapList<CategoryDetailData>(response);
        const data = raw.map((row) => ({
          uuid: row.uuid,
          name: row.name,
          description: row.description ?? null,
          image: row.image ?? null,
          parent_category_id: row.parent_category_id ?? null,
        }));
        cachedAllCategories = data;
        return data;
      })
      .finally(() => { allCategoriesInFlight = null; });

    return allCategoriesInFlight;
  }

  async getCategoryById(categoryId: string): Promise<CategoryDetailData> {
    const list = await this.getAllCategories();
    const found = list.find((c) => c.uuid === categoryId);
    if (!found) {
      throw new Error('Category not found');
    }
    return found;
  }

  async fetchCategoryForBusinessList(categoryId: string): Promise<CategoryWithServicesData> {
    const svc = new ServiceService();
    const [cat, rawServices] = await Promise.all([
      this.getCategoryById(categoryId),
      svc.getServicesByCategories([categoryId]),
    ]);
    return {
      uuid: cat.uuid,
      name: cat.name,
      description: cat.description,
      image: cat.image,
      services: rawServices.map((s) => ({
        id: String(s.service_uuid ?? s.uuid),
        name: s.name,
      })),
    };
  }
}
