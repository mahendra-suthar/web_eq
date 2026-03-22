import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import CategoryCard from "../../components/category-card";
import BusinessCard from "../../components/business-card";
import type { Business } from "../../mock/businesses";
import { CategoryService, type CategoryWithServicesData } from "../../services/category/category.service";
import { BusinessService } from "../../services/business/business.service";
import { AppointmentService, type TodayAppointmentResponse } from "../../services/appointment/appointment.service";
import { useAuthStore } from "../../store/auth.store";
import AppointmentActions from "../../components/appointment-actions";
import LoadingSpinner from "../../components/loading-spinner";
import EmptyState from "../../components/empty-state";
import ErrorMessage from "../../components/error-message";
import { getCategoryEmoji } from "../../utils/category-emoji";
import { useScrollReveal } from "../../hooks/useScrollReveal";
import {
  formatDurationMinutes,
  formatAppointmentTimeSummary,
  formatDelayMessage,
  getApiErrorMessage,
} from "../../utils/util";
import "./landing.scss";

const FEATURED_LIMIT = 6;

const TESTIMONIAL_META = [
  { id: 1, initial: "P", gradient: "linear-gradient(135deg, #b6e8d3, #1a7a56)" },
  { id: 2, initial: "R", gradient: "linear-gradient(135deg, #c9a84c, #f5d78e)" },
  { id: 3, initial: "A", gradient: "linear-gradient(135deg, #a78bfa, #c4b5fd)" },
];

const HIW_META = [
  { num: "01", icon: "🔍" },
  { num: "02", icon: "📅" },
  { num: "03", icon: "✅" },
  { num: "04", icon: "⭐" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();

  const howItWorksRef = useRef<HTMLElement>(null);
  const categoriesRef = useRef<HTMLElement>(null);

  // ── Existing state (unchanged) ─────────────────────────────────────────
  const [categories, setCategories] = useState<CategoryWithServicesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointmentResponse[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [featuredBusinesses, setFeaturedBusinesses] = useState<Business[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  // ── New UI state ───────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>(() => t("landing.filterOpenNow"));

  const GENERIC_FILTERS = useMemo(
    () => [t("landing.filterOpenNow"), t("landing.filterTopRated"), t("landing.filterNearby")],
    [t]
  );

  const TESTIMONIALS = useMemo(() => [
    { ...TESTIMONIAL_META[0], text: t("landing.testimonial1Text"), name: t("landing.testimonial1Name"), location: t("landing.testimonial1Location") },
    { ...TESTIMONIAL_META[1], text: t("landing.testimonial2Text"), name: t("landing.testimonial2Name"), location: t("landing.testimonial2Location") },
    { ...TESTIMONIAL_META[2], text: t("landing.testimonial3Text"), name: t("landing.testimonial3Name"), location: t("landing.testimonial3Location") },
  ], [t]);

  const HIW_STEPS = useMemo(() => HIW_META.map((m, i) => ({
    ...m,
    title: t(`landing.step${i + 1}Title`),
    desc:  t(`landing.step${i + 1}Desc`),
  })), [t]);

  // ── Scroll reveal (re-run when data finishes loading) ─────────────────
  useScrollReveal([loading, featuredLoading]);

  // ── Existing fetch functions (unchanged) ──────────────────────────────
  const fetchTodayAppointments = useCallback(async () => {
    if (!isAuthenticated()) {
      setTodayAppointments([]);
      return;
    }
    setTodayLoading(true);
    try {
      const appointmentService = new AppointmentService();
      const data = await appointmentService.getTodayAppointments();
      setTodayAppointments(data ?? []);
    } catch (err) {
      console.error("Failed to fetch today's appointments:", err);
      setTodayAppointments([]);
    } finally {
      setTodayLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { fetchTodayAppointments(); }, [fetchTodayAppointments]);
  useEffect(() => { fetchCategories(); }, []);

  const fetchFeaturedBusinesses = useCallback(async () => {
    setFeaturedLoading(true);
    setFeaturedError(null);
    try {
      const businessService = new BusinessService();
      const list = await businessService.getBusinesses();
      const mapped: Business[] = list.map((b) => ({
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
      }));
      setFeaturedBusinesses(mapped.slice(0, FEATURED_LIMIT));
    } catch (err) {
      console.error("Failed to fetch featured businesses:", err);
      setFeaturedError(getApiErrorMessage(err, "Failed to load businesses."));
      setFeaturedBusinesses([]);
    } finally {
      setFeaturedLoading(false);
    }
  }, []);

  useEffect(() => { fetchFeaturedBusinesses(); }, [fetchFeaturedBusinesses]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const categoryService = new CategoryService();
      const data = await categoryService.getCategoriesWithServices();
      setCategories(data);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
      setError(getApiErrorMessage(err, "Failed to load categories. Please try again later."));
    } finally {
      setLoading(false);
    }
  };

  // ── Computed values ────────────────────────────────────────────────────
  const filteredCategories = searchQuery
    ? categories.filter(
        (c) =>
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.services.some((s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase())
          )
      )
    : categories;

  const filterOpenNow = t("landing.filterOpenNow");

  const filteredBusinesses =
    activeFilter === filterOpenNow
      ? featuredBusinesses.filter((b) => b.isOpen || b.isAlwaysOpen)
      : featuredBusinesses;

  const marqueeItems =
    categories.length > 0
      ? categories.map((c) => c.name)
      : ["Healthcare", "Barber & Salon", "Dental", "Wellness & Spa", "Pet Care", "Auto & Repair", "Education", "Fitness", "Beauty"];

  const scrollToSection = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSearch = () => {
    scrollToSection(categoriesRef);
  };

  return (
    <div className="landing-page">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="lp-hero">
        <div className="lp-hero-bg" aria-hidden="true" />
        <div className="lp-orb lp-orb--1" aria-hidden="true" />
        <div className="lp-orb lp-orb--2" aria-hidden="true" />
        <div className="lp-orb lp-orb--3" aria-hidden="true" />

        <div className="lp-hero-content">
          <div className="lp-hero-badge">
            <span className="lp-hero-badge-dot" aria-hidden="true" />
            {!loading && categories.length > 0
              ? t("landing.badgeLive", { count: categories.length })
              : t("landing.badgeDefault")}
          </div>

          <h1 className="lp-hero-title">
            {t("landing.heroTitle")}{" "}
            <span className="lp-hero-title-line">
              <em className="lp-hero-title-italic">{t("landing.heroTitleEm")}</em>
            </span>
          </h1>

          <p className="lp-hero-sub">{t("landing.heroSub")}</p>

          {/* Search bar */}
          <div className="lp-search-container">
            <div className="lp-search-bar">
              <div className="lp-search-field">
                <svg className="lp-search-icon" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  placeholder={t("landing.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  aria-label={t("landing.searchAriaLabel")}
                />
              </div>
              <div className="lp-search-divider" aria-hidden="true" />
              <div className="lp-location-field">
                <svg className="lp-location-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <input type="text" defaultValue={t("landing.locationDefault")} aria-label={t("landing.locationAriaLabel")} readOnly />
              </div>
              <button className="lp-search-btn" onClick={handleSearch}>
                {t("landing.searchBtn")}
              </button>
            </div>

            {/* Quick filter chips */}
            <div className="lp-quick-filters">
              <span className="lp-filter-label">{t("landing.filterQuick")}</span>
              {GENERIC_FILTERS.map((f) => (
                <button
                  key={f}
                  className={`lp-filter-chip${activeFilter === f ? " active" : ""}`}
                  onClick={() => setActiveFilter(activeFilter === f ? "" : f)}
                >
                  {f === filterOpenNow && (
                    <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  )}
                  {f}
                </button>
              ))}
              {categories.slice(0, 2).map((cat) => (
                <button
                  key={cat.uuid}
                  className="lp-filter-chip"
                  onClick={() => navigate(`/categories/${cat.uuid}`, { state: { category: cat } })}
                >
                  {getCategoryEmoji(cat.name)} {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Stats row */}
          <div className="lp-hero-stats">
            <div className="lp-stat">
              <span className="lp-stat-number">
                {featuredBusinesses.length > 0 ? `${featuredBusinesses.length}+` : "200+"}
              </span>
              <div className="lp-stat-label">{t("landing.statBusinesses")}</div>
            </div>
            <div className="lp-stat-sep" aria-hidden="true" />
            <div className="lp-stat">
              <span className="lp-stat-number">12k+</span>
              <div className="lp-stat-label">{t("landing.statBookings")}</div>
            </div>
            <div className="lp-stat-sep" aria-hidden="true" />
            <div className="lp-stat">
              <span className="lp-stat-number">4.8★</span>
              <div className="lp-stat-label">{t("landing.statRating")}</div>
            </div>
            <div className="lp-stat-sep" aria-hidden="true" />
            <div className="lp-stat">
              <span className="lp-stat-number">&lt;3 min</span>
              <div className="lp-stat-label">{t("landing.statBookingTime")}</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Marquee strip ────────────────────────────────────────────── */}
      <div className="lp-marquee-wrap" aria-hidden="true">
        <div className="lp-marquee-track">
          {[...marqueeItems, ...marqueeItems].map((name, i) => (
            <div key={i} className="lp-marquee-item">
              <span className="lp-marquee-dot" />
              {name}
            </div>
          ))}
        </div>
      </div>

      {/* ── Today's appointments (auth only) ─────────────────────────── */}
      {isAuthenticated() && (
        <section className="lp-today">
          <div className="lp-today-bg" aria-hidden="true" />
          <div className="lp-section-container">

            {/* Header */}
            <div className="lp-today-header reveal">
              <div>
                <div className="lp-today-eyebrow">
                  <span className="lp-today-pulse-dot" aria-hidden="true" />
                  {t("landing.todayEyebrow")}
                </div>
                <h2 className="lp-today-title">
                  {t("landing.todayTitleLine")} <em>{t("landing.todayTitleEm")}</em>
                </h2>
              </div>
              <div className="lp-today-actions">
                <button
                  className="lp-today-action-btn lp-today-action-btn--primary"
                  onClick={() => categoriesRef.current?.scrollIntoView({ behavior: "smooth" })}
                >
                  {t("landing.todayBookAppt")}
                </button>
                <button
                  className="lp-today-action-btn"
                  onClick={() => navigate("/profile?tab=appointments")}
                >
                  {t("landing.todayMyAppts")}
                </button>
              </div>
            </div>

            {/* Cards */}
            {todayLoading ? (
              <div className="loading-state lp-today-loading">
                <LoadingSpinner aria-label="Loading appointments" size="md" />
                <p className="loading-state__message">{t("landing.loadingAppointments")}</p>
              </div>
            ) : (
              <div className={`lp-today-cards${todayAppointments.length === 0 ? " lp-today-cards--empty" : ""}`}>
                {todayAppointments.map((appt) => {
                  const isActive = appt.status !== 1;
                  const timeSummary = formatAppointmentTimeSummary(
                    appt.appointment_type,
                    appt.scheduled_start ?? null,
                    appt.scheduled_end ?? null,
                    appt.estimated_appointment_time ?? null
                  );
                  const delayMsg = formatDelayMessage(appt.delay_minutes ?? null);
                  const hasStats = appt.position != null
                    || (appt.estimated_wait_minutes != null && appt.estimated_wait_minutes > 0)
                    || !!timeSummary;
                  return (
                    <article
                      key={appt.queue_user_id}
                      className="lp-today-card reveal"
                      aria-label={`${appt.business_name} — token #${appt.token_number}`}
                    >
                      <div className={`lp-today-urgency-bar${isActive ? " lp-today-urgency-bar--active" : ""}`} aria-hidden="true" />
                      <div className="lp-today-card-body">

                        {/* Card header */}
                        <div className="lp-today-card-header">
                          <div className="lp-today-card-info">
                            <span className="lp-today-business">{appt.business_name}</span>
                            <p className="lp-today-queue">{appt.queue_name}</p>
                          </div>
                          <span className={`lp-today-status lp-today-status--${isActive ? "active" : "waiting"}`}>
                            {isActive ? t("landing.statusInProgress") : t("landing.statusWaiting")}
                          </span>
                        </div>

                        {/* Stats grid — only rendered when there is data */}
                        {hasStats && (
                          <div className="lp-today-stats">
                            {appt.position != null && (
                              <div className="lp-today-stat">
                                <span className="lp-today-stat-label">{t("landing.todayPosition")}</span>
                                <span className="lp-today-stat-value">#{appt.position}</span>
                                {appt.position === 1 && <span className="lp-today-stat-sub">{t("landing.todayNextUp")}</span>}
                              </div>
                            )}
                            {appt.estimated_wait_minutes != null && appt.estimated_wait_minutes > 0 && (
                              <div className="lp-today-stat">
                                <span className="lp-today-stat-label">{t("landing.todayEstWait")}</span>
                                <span className="lp-today-stat-value">{formatDurationMinutes(appt.estimated_wait_minutes)}</span>
                                {appt.estimated_wait_range && <span className="lp-today-stat-sub">{appt.estimated_wait_range}</span>}
                              </div>
                            )}
                            {timeSummary && (
                              <div className="lp-today-stat">
                                <span className="lp-today-stat-label">{t("landing.todayExpectedAt")}</span>
                                <span className="lp-today-stat-value">{timeSummary}</span>
                                <span className="lp-today-stat-sub">{t("landing.todayToday")}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Service tags */}
                        {appt.service_summary && (
                          <div className="lp-today-services">
                            {appt.service_summary.split(",").filter(Boolean).map((s, i) => (
                              <span key={i} className="lp-today-service-tag">{s.trim()}</span>
                            ))}
                          </div>
                        )}

                        {/* Token row */}
                        <div className="lp-today-token-row">
                          <span className="lp-today-token">#{appt.token_number}</span>
                          <span className="lp-today-pay-note">{t("landing.todayPayAtCounter")}</span>
                          {delayMsg && <span className="lp-today-delay">{delayMsg}</span>}
                        </div>

                        {/* Footer */}
                        <div className="lp-today-footer">
                          <AppointmentActions appointment={appt} onUpdated={fetchTodayAppointments} />
                          <button
                            className="lp-today-view-btn"
                            onClick={() => navigate(`/business/${appt.business_id}`)}
                          >
                            {t("landing.viewBusiness")}
                          </button>
                        </div>

                      </div>
                    </article>
                  );
                })}

                {/* Nothing else today */}
                <div className="lp-today-empty reveal">
                  <div className="lp-today-empty-emoji" aria-hidden="true">🌿</div>
                  <div className="lp-today-empty-title">{t("landing.todayNothingTitle")}</div>
                  <div className="lp-today-empty-sub">{t("landing.todayNothingSub")}</div>
                  <button
                    className="lp-today-empty-btn"
                    onClick={() => categoriesRef.current?.scrollIntoView({ behavior: "smooth" })}
                  >
                    {t("landing.todayExploreNearMe")}
                  </button>
                </div>
              </div>
            )}

          </div>
        </section>
      )}

      {/* ── Browse by Category ───────────────────────────────────────── */}
      <section className="lp-section" ref={categoriesRef} id="categories">
        <div className="lp-section-container">
          <div className="lp-section-header reveal">
            <span className="lp-section-eyebrow">{t("landing.browseEyebrow")}</span>
            <h2 className="lp-section-title">
              {t("landing.browseTitle")}<br />{t("landing.browseTitleLine2")}
            </h2>
            <p className="lp-section-sub">{t("landing.browseSub")}</p>
          </div>

          {loading && (
            <div className="loading-state">
              <LoadingSpinner aria-label="Loading categories" size="md" />
              <p className="loading-state__message">{t("landing.loadingCategories")}</p>
            </div>
          )}

          {error && (
            <div className="lp-error-wrap">
              <ErrorMessage>{error}</ErrorMessage>
            </div>
          )}

          {!loading && !error && (
            <div className="lp-categories-grid">
              {filteredCategories.length > 0 ? (
                filteredCategories.map((cat, i) => (
                  <div
                    key={cat.uuid}
                    className={`reveal${i % 4 === 1 ? " reveal-delay-1" : i % 4 === 2 ? " reveal-delay-2" : i % 4 === 3 ? " reveal-delay-3" : ""}`}
                  >
                    <CategoryCard category={cat} />
                  </div>
                ))
              ) : (
                <EmptyState
                  title={searchQuery ? t("landing.noResultsFor", { query: searchQuery }) : t("landing.noCategories")}
                  hint={searchQuery ? t("landing.tryDifferentSearch") : undefined}
                  className="lp-empty-full"
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Explore Businesses ───────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-section-container">
          <div className="lp-section-header reveal">
            <span className="lp-section-eyebrow">{t("landing.featuredEyebrow")}</span>
            <h2 className="lp-section-title">{t("landing.featuredTitle")}</h2>
            <p className="lp-section-sub">{t("landing.featuredSub")}</p>
          </div>

          {featuredLoading && (
            <div className="loading-state">
              <LoadingSpinner aria-label="Loading businesses" size="md" />
              <p className="loading-state__message">{t("landing.loadingBusinesses")}</p>
            </div>
          )}

          {featuredError && !featuredLoading && (
            <div className="lp-error-wrap">
              <ErrorMessage>{featuredError}</ErrorMessage>
            </div>
          )}

          {!featuredLoading && !featuredError && (
            <>
              {filteredBusinesses.length > 0 ? (
                <div className="lp-biz-grid">
                  {filteredBusinesses.map((biz, i) => (
                    <div
                      key={biz.id}
                      className={`reveal${i % 3 === 1 ? " reveal-delay-1" : i % 3 === 2 ? " reveal-delay-2" : ""}`}
                    >
                      <BusinessCard business={biz} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title={activeFilter === filterOpenNow ? t("landing.noOpenBizTitle") : t("landing.noBizTitle")}
                  hint={
                    activeFilter === filterOpenNow
                      ? t("landing.noOpenBizHint")
                      : t("landing.noBizHint")
                  }
                  action={
                    activeFilter === filterOpenNow ? (
                      <button className="lp-empty-action-btn" onClick={() => setActiveFilter("")}>
                        {t("landing.showAllBusinesses")}
                      </button>
                    ) : undefined
                  }
                  className="lp-empty-full"
                />
              )}
            </>
          )}
        </div>
      </section>

      {/* ── How It Works ─────────────────────────────────────────────── */}
      <section className="lp-hiw" ref={howItWorksRef} id="how-it-works">
        <div className="lp-hiw-bg" aria-hidden="true" />
        <div className="lp-section-container">
          <div className="lp-section-header reveal">
            <span className="lp-section-eyebrow lp-section-eyebrow--light">{t("landing.hiwEyebrow")}</span>
            <h2 className="lp-section-title lp-section-title--light">
              {t("landing.hiwTitle")}<br />
              <em className="lp-hiw-title-em">{t("landing.hiwTitleEm")}</em>
            </h2>
            <p className="lp-section-sub lp-section-sub--light">{t("landing.hiwSub")}</p>
          </div>

          <div className="lp-steps-grid reveal">
            {HIW_STEPS.map((step) => (
              <div key={step.num} className="lp-step">
                <div className="lp-step-num" aria-hidden="true">{step.num}</div>
                <span className="lp-step-icon" aria-hidden="true">{step.icon}</span>
                <h3 className="lp-step-title">{step.title}</h3>
                <p className="lp-step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────── */}
      <section className="lp-section lp-section-cream">
        <div className="lp-section-container">
          <div className="lp-section-header reveal">
            <span className="lp-section-eyebrow">{t("landing.reviewsEyebrow")}</span>
            <h2 className="lp-section-title">{t("landing.reviewsTitle")}</h2>
          </div>

          <div className="lp-testi-grid">
            {TESTIMONIALS.map((testi, i) => (
              <div
                key={testi.id}
                className={`lp-testi-card reveal${i === 1 ? " reveal-delay-1" : i === 2 ? " reveal-delay-2" : ""}`}
              >
                <p className="lp-testi-text">{testi.text}</p>
                <div className="lp-testi-author">
                  <div
                    className="lp-testi-avatar"
                    style={{ background: testi.gradient }}
                    aria-hidden="true"
                  >
                    {testi.initial}
                  </div>
                  <div>
                    <div className="lp-testi-name">{testi.name}</div>
                    <div className="lp-testi-handle">{testi.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Strip ────────────────────────────────────────────────── */}
      <section className="lp-cta">
        <div className="lp-cta-bg" aria-hidden="true" />
        <div className="lp-cta-content reveal">
          <h2 className="lp-cta-title">
            {t("landing.ctaTitle")}<br />
            {t("landing.ctaTitleLine2")} <em className="lp-cta-title-em">{t("landing.ctaTitleEm")}</em>
          </h2>
          <p className="lp-cta-sub">{t("landing.ctaSub")}</p>
          <div className="lp-cta-actions">
            <button className="lp-btn-dark" onClick={() => scrollToSection(categoriesRef)}>
              {t("landing.ctaFindServices")}
            </button>
            {!isAuthenticated() && (
              <button className="lp-btn-outline" onClick={() => navigate("/send-otp")}>
                {t("landing.ctaGetStarted")}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
