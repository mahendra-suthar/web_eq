import type { CategoryWithServicesData } from "../../services/category/category.service";
import { SEO_BASE_URL } from "../../components/Seo";

export function categorySeoTitle(c: CategoryWithServicesData): string {
  return `${c.name} — Book Appointments & Join the Queue | EaseQueue`;
}

export function categorySeoDescription(c: CategoryWithServicesData): string {
  const about = c.description?.trim();
  if (about) return about.length > 160 ? `${about.slice(0, 157).trimEnd()}…` : about;
  return `Find and book local ${c.name} on EaseQueue. Compare options, check live wait times, and join the queue instantly — no app download needed.`;
}

export function categoryCanonical(categoryId: string): string {
  return `${SEO_BASE_URL}/categories/${categoryId}`;
}
