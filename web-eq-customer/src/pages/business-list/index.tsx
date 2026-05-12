import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BusinessCard from "../../components/business-card";
import EmptyState from "../../components/empty-state";
import ErrorMessage from "../../components/error-message";
import { BusinessService } from "../../services/business/business.service";
import { CategoryService, type CategoryWithServicesData, type ServiceData } from "../../services/category/category.service";
import { getCategoryEmoji } from "../../utils/category-emoji";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import type { Business } from "../../types/business";
import "./business-list.scss";

type SortKey = "recommended" | "open" | "rating" | "price-low" | "price-high";

export default function BusinessListPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [category, setCategory] = useState<CategoryWithServicesData | null>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryLoading, setCategoryLoading] = useState(!!categoryId);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("recommended");

  const error = categoryError || businessError;

  useScrollReveal([loading || categoryLoading]);

  useEffect(() => {
    setCategoryError(null);
    setBusinessError(null);
    setCategory(null);
  }, [categoryId]);

  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    setCategoryLoading(true);
    (async () => {
      try {
        const svc = new CategoryService();
        const found = await svc.fetchCategoryForBusinessList(categoryId);
        if (!cancelled) setCategory(found);
      } catch {
        if (!cancelled) setCategoryError(t("bl.failedLoadCategory"));
      } finally {
        if (!cancelled) setCategoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [categoryId, t]);

  const fetchBusinesses = useCallback(async () => {
    if (!categoryId) return;
    try {
      setLoading(true);
      setBusinessError(null);
      const svc = new BusinessService();
      const serviceIds = selectedServiceIds.length > 0 ? selectedServiceIds : undefined;
      const list = await svc.getBusinesses(categoryId, serviceIds);
      setBusinesses(
        list.map((b) => ({
          id: b.uuid,
          name: b.name,
          categoryId: b.category_id || "",
          rating: b.rating || 0,
          reviewCount: b.review_count || 0,
          location: b.address || "",
          distance: undefined,
          image: b.profile_picture || undefined,
          description: b.about_business || "",
          isOpen: b.is_open,
          isAlwaysOpen: b.is_always_open,
          opensAt: b.opens_at,
          closesAt: b.closes_at,
          serviceNames: b.service_names || [],
          minPrice: b.min_price || null,
          maxPrice: b.max_price || null,
          latitude: b.latitude,
          longitude: b.longitude,
        }))
      );
    } catch {
      setBusinessError(t("bl.failedLoadBusinesses"));
    } finally {
      setLoading(false);
    }
  }, [categoryId, selectedServiceIds, t]);

  useEffect(() => { fetchBusinesses(); }, [fetchBusinesses]);

  const handleServiceToggle = (serviceId: string) =>
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );

  const handleClearFilters = () => setSelectedServiceIds([]);

  const openCount = useMemo(
    () => businesses.filter((b) => b.isOpen || b.isAlwaysOpen).length,
    [businesses]
  );

  const avgRating = useMemo(() => {
    const rated = businesses.filter((b) => b.rating > 0);
    if (!rated.length) return null;
    return (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1);
  }, [businesses]);

  const sortedBusinesses = useMemo(() => {
    const arr = [...businesses];
    switch (sortBy) {
      case "open": return arr.sort((a, b) => (b.isOpen || b.isAlwaysOpen ? 1 : 0) - (a.isOpen || a.isAlwaysOpen ? 1 : 0));
      case "rating": return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      case "price-low": return arr.sort((a, b) => (a.minPrice ?? Infinity) - (b.minPrice ?? Infinity));
      case "price-high": return arr.sort((a, b) => (b.maxPrice ?? 0) - (a.maxPrice ?? 0));
      default: return arr;
    }
  }, [businesses, sortBy]);

  const selectedServiceNames = useMemo(() => {
    if (!category || !selectedServiceIds.length) return [];
    return selectedServiceIds
      .map((id) => category.services.find((s: ServiceData) => s.id === id)?.name)
      .filter(Boolean) as string[];
  }, [category, selectedServiceIds]);

  const emoji = category ? getCategoryEmoji(category.name) : "";

  if (!categoryId) {
    return (
      <div className="bl-page">
        <EmptyState title={t("bl.notFoundTitle")} hint={t("bl.notFoundHint")} />
      </div>
    );
  }

  return (
    <div className="bl-page">

      <div className="bl-hero">
        <div className="bl-hero-inner">
          <button className="bl-breadcrumb" onClick={() => navigate("/")} aria-label={t("bl.backToCategories")}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t("bl.allCategories")}
          </button>

          <div className="bl-hero-body">
            <div className="bl-hero-main">
              <div className="bl-hero-icon" aria-hidden="true">
                {emoji || "📂"}
              </div>
              <div className="bl-hero-content">
                {category ? (
                  <>
                    <h1 className="bl-hero-title">{category.name}</h1>
                    {category.description && (
                      <p className="bl-hero-desc">{category.description}</p>
                    )}
                    <div className="bl-hero-pills">
                      <div className="bl-hero-pill">{t("bl.instantBooking")}</div>
                      {avgRating && (
                        <div className="bl-hero-pill">★ {avgRating} {t("bl.avgRating")}</div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bl-hero-skeleton-wrap">
                    <div className="bl-skeleton bl-skeleton--hero-title" />
                    <div className="bl-skeleton bl-skeleton--hero-sub" />
                  </div>
                )}
              </div>
            </div>

            {/* Stats panel — single source of truth for counts */}
            {!loading && businesses.length > 0 && (
              <div className="bl-hero-stats" aria-label="Category statistics">
                <div className="bl-hero-stat">
                  <span className="bl-hero-stat-num">{businesses.length}</span>
                  <span className="bl-hero-stat-label">{t("bl.businesses")}</span>
                </div>
                <div className="bl-hero-stat-divider" />
                <div className="bl-hero-stat">
                  <span className="bl-hero-stat-num">{openCount}</span>
                  <span className="bl-hero-stat-label">{t("bl.openNow")}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      {(category?.services?.length ?? 0) > 0 && (
        <div className="bl-toolbar">
          <div className="bl-toolbar-inner">
            <div className="bl-toolbar-left">
              <span className="bl-toolbar-label" aria-hidden="true">
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                </svg>
                {t("bl.servicesLabel")}
              </span>
              <div className="bl-filter-chips" role="group" aria-label="Filter by service">
                {category!.services.map((service: ServiceData) => {
                  const active = selectedServiceIds.includes(service.id);
                  return (
                    <button
                      key={service.id}
                      className={`bl-filter-chip${active ? " active" : ""}`}
                      onClick={() => handleServiceToggle(service.id)}
                      aria-pressed={active}
                    >
                      {service.name}
                      {active && (
                        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
              {selectedServiceIds.length > 0 && (
                <button className="bl-clear-btn" onClick={handleClearFilters}>{t("bl.clearAll")}</button>
              )}
            </div>

            <div className="bl-toolbar-right">
              <label htmlFor="bl-sort" className="bl-sort-label">{t("bl.sortBy")}</label>
              <div className="bl-sort-wrap">
                <select
                  id="bl-sort"
                  className="bl-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortKey)}
                  aria-label={t("bl.sortBy")}
                >
                  <option value="recommended">{t("bl.sortRecommended")}</option>
                  <option value="open">{t("bl.sortOpenNow")}</option>
                  <option value="rating">{t("bl.sortHighestRated")}</option>
                  <option value="price-low">{t("bl.sortPriceLow")}</option>
                  <option value="price-high">{t("bl.sortPriceHigh")}</option>
                </select>
                <svg className="bl-sort-icon" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active filter tags (only when filters are on) */}
      {!loading && !error && selectedServiceNames.length > 0 && (
        <div className="bl-results-meta">
          <div className="bl-results-meta-inner">
            <span className="bl-results-count">
              {t("bl.result", { count: sortedBusinesses.length })}
            </span>
            <div className="bl-active-filter-tags" role="list">
              {selectedServiceNames.map((name, i) => (
                <div key={selectedServiceIds[i]} className="bl-filter-tag" role="listitem">
                  {name}
                  <button
                    onClick={() => handleServiceToggle(selectedServiceIds[i])}
                    aria-label={`Remove filter: ${name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="bl-content">
        <div className="bl-content-inner">

          {error && <div className="bl-error"><ErrorMessage>{error}</ErrorMessage></div>}

          {loading && (
            <div className="bl-loading">
              <div className="bl-skeleton-grid">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bl-card-skeleton">
                    <div className="bl-skeleton bl-skeleton--img" />
                    <div className="bl-skeleton-body">
                      <div className="bl-skeleton bl-skeleton--line" />
                      <div className="bl-skeleton bl-skeleton--line bl-skeleton--short" />
                      <div className="bl-skeleton bl-skeleton--line bl-skeleton--shorter" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !error && businesses.length === 0 && (
            <div className="bl-empty">
              <EmptyState
                icon={<span className="bl-empty-icon">{emoji || "🔍"}</span>}
                title={
                  selectedServiceIds.length > 0
                    ? t("bl.noMatchTitle")
                    : t("bl.emptyTitle")
                }
                hint={
                  selectedServiceIds.length > 0
                    ? t("bl.noMatchHint")
                    : t("bl.emptyHint")
                }
                action={
                  selectedServiceIds.length > 0 ? (
                    <button className="bl-empty-action" onClick={handleClearFilters}>
                      {t("bl.clearFilters")}
                    </button>
                  ) : undefined
                }
              />
            </div>
          )}

          {!loading && !error && sortedBusinesses.length > 0 && (
            <div className="bl-grid">
              {sortedBusinesses.map((business, i) => (
                <div
                  key={business.id}
                  className={`reveal${i % 3 === 1 ? " reveal-delay-1" : i % 3 === 2 ? " reveal-delay-2" : ""}`}
                >
                  <BusinessCard business={business} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
