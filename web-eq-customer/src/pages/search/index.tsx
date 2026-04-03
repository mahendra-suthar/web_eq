import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BusinessService } from "../../services/business/business.service";
import BusinessCard from "../../components/business-card";
import EmptyState from "../../components/empty-state";
import LoadingSpinner from "../../components/loading-spinner";
import type { Business } from "../../types/business";
import "./search.scss";

export default function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState(() => searchParams.get("q") ?? "");

  const query = searchParams.get("q") ?? "";

  const fetchBusinesses = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await new BusinessService().getBusinesses();
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
          minPrice: b.min_price ?? null,
          maxPrice: b.max_price ?? null,
          latitude: b.latitude,
          longitude: b.longitude,
        }))
      );
    } catch {
      setError(t("search.fetchError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchBusinesses(); }, [fetchBusinesses]);

  // Sync input when URL query changes (e.g. browser back/forward)
  useEffect(() => { setInputValue(query); }, [query]);

  const results = useMemo(() => {
    if (!query.trim()) return businesses;
    const q = query.trim().toLowerCase();
    return businesses.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.description?.toLowerCase().includes(q) ||
        b.serviceNames?.some((s) => s.toLowerCase().includes(q)) ||
        b.location?.toLowerCase().includes(q)
    );
  }, [businesses, query]);

  const handleSearch = () => {
    const q = inputValue.trim();
    if (q) setSearchParams({ q });
    else setSearchParams({});
  };

  const handleClear = () => {
    setInputValue("");
    setSearchParams({});
  };

  return (
    <div className="sp-page">
      {/* Header */}
      <div className="sp-header">
        <div className="sp-header-inner">
          <button
            className="sp-back-btn"
            onClick={() => navigate("/")}
            aria-label={t("search.backHome")}
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="m15 18-6-6 6-6" />
            </svg>
            {t("search.backHome")}
          </button>

          <div className="sp-search-bar">
            <svg className="sp-search-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              className="sp-search-input"
              value={inputValue}
              placeholder={t("search.placeholder")}
              aria-label={t("search.placeholder")}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              autoFocus
            />
            {inputValue && (
              <button className="sp-search-clear" onClick={handleClear} aria-label="Clear search">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            )}
            <button className="sp-search-btn" onClick={handleSearch}>
              {t("search.searchBtn")}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="sp-content">
        <div className="sp-content-inner">

          {loading && (
            <div className="sp-loading">
              <LoadingSpinner size="md" />
            </div>
          )}

          {!loading && error && (
            <EmptyState title={error} hint={t("search.tryAgain")} />
          )}

          {!loading && !error && (
            <>
              <div className="sp-meta">
                {query ? (
                  <span className="sp-meta-text">
                    {results.length > 0
                      ? t("search.resultCount", { count: results.length, query })
                      : t("search.noResults", { query })}
                  </span>
                ) : (
                  <span className="sp-meta-text">{t("search.allBusinesses", { count: businesses.length })}</span>
                )}
              </div>

              {results.length > 0 ? (
                <div className="sp-grid">
                  {results.map((business) => (
                    <BusinessCard key={business.id} business={business} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={t("search.emptyTitle")}
                  hint={t("search.emptyHint")}
                  action={
                    <button className="sp-empty-btn" onClick={handleClear}>
                      {t("search.showAll")}
                    </button>
                  }
                />
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}
