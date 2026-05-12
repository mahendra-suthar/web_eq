import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  BusinessService,
  type BusinessDetailData,
  type BusinessServiceData,
} from "../../services/business/business.service";
import {
  ReviewService,
  type ReviewData,
  type BusinessReviewSummary,
} from "../../services/review/review.service";
import { useAuthStore } from "../../store/auth.store";
import {
  formatFullAddress,
  getMapEmbedUrl,
  getGoogleMapsLink,
  formatDurationMinutes,
  formatReviewDate,
} from "../../utils/util";
// Mon=0…Sun=6 → locale-aware day name via Intl (2024-01-01 is Monday)
const DAY_NAME = (idx: number) =>
  new Date(2024, 0, 1 + idx).toLocaleDateString(undefined, { weekday: "long" });
import { getCategoryEmoji } from "../../utils/category-emoji";
import LoadingSpinner from "../../components/loading-spinner";
import ErrorMessage from "../../components/error-message";
import ReviewModal from "../../components/review-modal";
import StarRating from "../../components/star-rating";
import "./business-details.scss";

const TABS = ["Overview", "Services", "Hours", "Location", "Reviews"] as const;
type Tab = typeof TABS[number];

const TAB_IDS: Record<Tab, string> = {
  Overview: "bdp-overview",
  Services: "bdp-services",
  Hours: "bdp-hours",
  Location: "bdp-location",
  Reviews: "bdp-reviews",
};

export default function BusinessDetailsPage() {
  const { t } = useTranslation();
  const TAB_LABELS = useMemo<Record<Tab, string>>(
    () => ({
      Overview: t("bd.tabOverview"),
      Services: t("bd.tabServices"),
      Hours: t("bd.tabHours"),
      Location: t("bd.tabLocation"),
      Reviews: t("bd.tabReviews"),
    }),
    [t]
  );

  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, userInfo } = useAuthStore();

  const [business, setBusiness] = useState<BusinessDetailData | null>(null);
  const [services, setServices] = useState<BusinessServiceData[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");

  // Reviews state
  const [reviews, setReviews] = useState<ReviewData[]>([]);
  const [reviewSummary, setReviewSummary] = useState<BusinessReviewSummary | null>(null);
  const [myReview, setMyReview] = useState<ReviewData | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  // Category info passed from list page (optional)
  const passedCategoryId = location.state?.categoryId as string | undefined;
  const passedCategoryName = location.state?.categoryName as string | undefined;

  useEffect(() => {
    const fetchData = async () => {
      if (!businessId) {
        setError(t("bd.businessIdRequired"));
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const svc = new BusinessService();
        const rvSvc = new ReviewService();
        const [businessData, servicesData, reviewsData, summaryData] = await Promise.all([
          svc.getBusinessDetails(businessId),
          svc.getBusinessServices(businessId),
          rvSvc.getBusinessReviews(businessId),
          rvSvc.getBusinessReviewSummary(businessId),
        ]);
        setBusiness(businessData);
        setServices(servicesData);
        setReviews(reviewsData);
        setReviewSummary(summaryData);
      } catch (err: any) {
        setError(
          err?.response?.data?.detail?.message ||
            err?.response?.data?.detail ||
            t("bd.failedLoad")
        );
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [businessId]);

  // Fetch current user's review separately so auth changes are reactive
  useEffect(() => {
    if (!businessId || !isAuthenticated()) {
      setMyReview(null);
      return;
    }
    const rvSvc = new ReviewService();
    rvSvc
      .getMyReview({ businessId })
      .then((rv) => setMyReview(rv))
      .catch(() => setMyReview(null));
  }, [businessId, userInfo?.uuid]);

  const handleReviewSuccess = useCallback((newReview: ReviewData) => {
    setMyReview(newReview);
    setReviews((prev) => [newReview, ...prev]);
    setReviewSummary((prev) => {
      if (!prev) return { average_rating: newReview.rating, review_count: 1 };
      const newCount = prev.review_count + 1;
      const newAvg = (prev.average_rating * prev.review_count + newReview.rating) / newCount;
      return { average_rating: Math.round(newAvg * 10) / 10, review_count: newCount };
    });
    setReviewModalOpen(false);
  }, []);

  const handleServiceToggle = (serviceId: string) =>
    setSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );

  const handleContinue = () => {
    if (selectedServices.length === 0) return;
    const selectedServicesData = services.filter((s) => selectedServices.includes(s.uuid));
    const variantIds = selectedServicesData.flatMap((s) =>
      s.variant_uuids?.length ? s.variant_uuids : [s.uuid]
    );
    navigate(`/business/${businessId}/book`, {
      state: { selectedServices: variantIds, selectedServicesData, businessName: business?.name || "" },
    });
  };

  const scrollToSection = (tab: Tab) => {
    setActiveTab(tab);
    const el = document.getElementById(TAB_IDS[tab]);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Derived values
  const selectedServicesData = useMemo(
    () => services.filter((s) => selectedServices.includes(s.uuid)),
    [services, selectedServices]
  );

  const totalPriceMin = selectedServicesData.reduce(
    (sum, s) => sum + (s.price_min ?? s.price ?? 0),
    0
  );
  const totalPriceMax = selectedServicesData.reduce(
    (sum, s) => sum + (s.price_max ?? s.price ?? 0),
    0
  );
  const hasPriceRange = totalPriceMin !== totalPriceMax;

  const addressLines = useMemo(
    () => formatFullAddress(business?.address ?? null),
    [business?.address]
  );
  const hasCoords =
    business?.address?.latitude != null &&
    business?.address?.longitude != null &&
    !isNaN(business.address.latitude) &&
    !isNaN(business.address.longitude);

  const todaySchedule = useMemo(() => {
    if (!business?.schedule?.schedules?.length) return null;
    const jsDay = new Date().getDay();
    return business.schedule.schedules.find((s) => s.day_of_week === jsDay) ?? null;
  }, [business]);

  // Rating bar counts from loaded reviews
  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      const star = Math.round(r.rating);
      if (star >= 1 && star <= 5) counts[star]++;
    });
    return counts;
  }, [reviews]);

  if (loading) {
    return (
      <div className="bdp-page">
        <div className="bdp-state-center">
          <LoadingSpinner aria-label="Loading business details" size="md" />
          <p className="bdp-state-msg">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (error || !business) {
    return (
      <div className="bdp-page">
        <div className="bdp-state-center">
          <ErrorMessage>{error ?? t("bd.businessNotFound")}</ErrorMessage>
        </div>
      </div>
    );
  }

  const lat = business.address?.latitude ?? 0;
  const lon = business.address?.longitude ?? 0;
  const isOpen = business.is_open || business.is_always_open;
  const categoryEmoji = business.category_name ? getCategoryEmoji(business.category_name) : "";
  const categoryId = passedCategoryId ?? business.category_id ?? "";
  const categoryName = passedCategoryName ?? business.category_name ?? "";
  return (
    <div className="bdp-page">
      <div className="bdp-hero">
        <div className="bdp-hero-bg" aria-hidden="true" />
        <div className="bdp-hero-deco bdp-hero-deco-1" aria-hidden="true" />
        <div className="bdp-hero-deco bdp-hero-deco-2" aria-hidden="true" />
        <div className="bdp-hero-deco bdp-hero-deco-3" aria-hidden="true" />

        <div className="bdp-hero-content">
          {/* Breadcrumb at top */}
          <div className="bdp-hero-top">
            <div className="bdp-breadcrumb">
              <button className="bdp-bc-link" onClick={() => navigate("/")}>
                <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path d="m15 18-6-6 6-6" />
                </svg>
                {t("bd.allCategories")}
              </button>
              {categoryName && (
                <>
                  <span className="bdp-bc-sep">/</span>
                  <button
                    className="bdp-bc-link"
                    onClick={() =>
                      navigate(`/categories/${categoryId}`, {
                        state: { category: { uuid: categoryId, name: categoryName } },
                      })
                    }
                  >
                    {categoryName}
                  </button>
                </>
              )}
              <span className="bdp-bc-sep">/</span>
              <span className="bdp-bc-current">{business.name}</span>
            </div>
          </div>

          {/* Avatar + name at bottom */}
          <div className="bdp-hero-bottom">
            <div className="bdp-hero-inner">
              <div className="bdp-hero-avatar">
                {business.profile_picture ? (
                  <img src={business.profile_picture} alt={business.name} />
                ) : (
                  business.name.charAt(0).toUpperCase()
                )}
              </div>

              <div className="bdp-hero-text">
                {categoryName && (
                  <div className="bdp-hero-cat">
                    {categoryEmoji && <span>{categoryEmoji}</span>}
                    {categoryName}
                  </div>
                )}
                <h1 className="bdp-hero-name">{business.name}</h1>
                <div className="bdp-hero-meta">
                  <div
                    className={`bdp-status-pill ${
                      isOpen ? "bdp-status-pill--open" : "bdp-status-pill--closed"
                    }`}
                  >
                    <span className="bdp-status-dot" aria-hidden="true" />
                    {business.is_always_open
                      ? t("bd.alwaysOpen")
                      : isOpen
                      ? t("bd.openNow")
                      : todaySchedule?.opening_time
                      ? t("bd.closedOpens", { time: todaySchedule.opening_time })
                      : t("bd.closed")}
                  </div>

                  {todaySchedule?.is_open &&
                    todaySchedule.opening_time &&
                    todaySchedule.closing_time && (
                      <>
                        <div className="bdp-hero-sep" aria-hidden="true" />
                        <div className="bdp-hero-meta-item">
                          <svg
                            width="12"
                            height="12"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                          {todaySchedule.opening_time} – {todaySchedule.closing_time}
                        </div>
                      </>
                    )}

                  {reviewSummary && reviewSummary.review_count > 0 && (
                    <>
                      <div className="bdp-hero-sep" aria-hidden="true" />
                      <div className="bdp-hero-meta-item bdp-hero-rating">
                        <span className="bdp-hero-rating-star">★</span>
                        <span>{reviewSummary.average_rating}</span>
                        <span className="bdp-hero-rating-count">
                          ({reviewSummary.review_count})
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bdp-sticky-bar">
        <div className="bdp-sticky-inner">
          <div className="bdp-sticky-tabs" role="tablist">
            {TABS.map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={`bdp-sticky-tab${activeTab === tab ? " active" : ""}`}
                onClick={() => scrollToSection(tab)}
              >
                {TAB_LABELS[tab]}
                {tab === "Reviews" && reviewSummary !== null && reviewSummary.review_count === 0 && (
                  <span className="bdp-tab-new">New</span>
                )}
                {tab === "Reviews" && reviewSummary !== null && reviewSummary.review_count > 0 && (
                  <span className="bdp-tab-count">{reviewSummary.review_count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="bdp-main-layout">
        <div className="bdp-left-col">
          {/* Contact */}
          <div className="bdp-section-card" id="bdp-overview">
            <div className="bdp-contact-row">
              {business.phone_number && (
                <a
                  href={`tel:${business.country_code ?? ""}${business.phone_number}`}
                  className="bdp-contact-chip"
                >
                  <svg
                    width="15"
                    height="15"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.07 8.81a19.79 19.79 0 0 1-3.07-8.68A2 2 0 0 1 2.18 0h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L6.91 7.91a16 16 0 0 0 6.17 6.17l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  {business.country_code && <span>{business.country_code} </span>}
                  {business.phone_number}
                </a>
              )}
              {business.email && (
                <a href={`mailto:${business.email}`} className="bdp-contact-chip">
                  <svg
                    width="15"
                    height="15"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  {business.email}
                </a>
              )}
            </div>
          </div>

          {/* About */}
          {business.about_business && (
            <div className="bdp-section-card">
              <div className="bdp-section-title">
                <div className="bdp-section-icon">💬</div>
                {t("bd.aboutTitle")}
              </div>
              <p className="bdp-about-text">{business.about_business}</p>
              <div className="bdp-section-divider" />
              <div className="bdp-about-stats">
                {categoryName && (
                  <div className="bdp-about-stat">
                    <div className="bdp-about-stat-label">{t("bd.categoryLabel")}</div>
                    <div className="bdp-about-stat-value">{categoryName}</div>
                  </div>
                )}
                {services.length > 0 && (
                  <div className="bdp-about-stat">
                    <div className="bdp-about-stat-label">{t("bd.servicesLabel")}</div>
                    <div className="bdp-about-stat-value">
                      {t("bd.service", { count: services.length })}
                    </div>
                  </div>
                )}
                {todaySchedule?.is_open && todaySchedule.opening_time && (
                  <div className="bdp-about-stat">
                    <div className="bdp-about-stat-label">{t("bd.opensLabel")}</div>
                    <div className="bdp-about-stat-value">{todaySchedule.opening_time}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Services */}
          <div className="bdp-section-card" id="bdp-services">
            <div className="bdp-section-title">
              <div className="bdp-section-icon">🩺</div>
              {t("bd.tabServices")}
            </div>
            <p className="bdp-section-sub">{t("bd.selectServices")}</p>

            {services.length === 0 ? (
              <div className="bdp-empty">{t("bd.noServices")}</div>
            ) : (
              services.map((service) => {
                const hasDurationRange =
                  service.duration_min != null &&
                  service.duration_max != null &&
                  service.duration_min !== service.duration_max;
                const hasServicePriceRange =
                  service.price_min != null &&
                  service.price_max != null &&
                  service.price_min !== service.price_max;
                const priceLabel = hasServicePriceRange
                  ? `₹${service.price_min} – ₹${service.price_max}`
                  : (service.price ?? service.price_min ?? service.price_max) != null
                  ? `₹${service.price ?? service.price_min ?? service.price_max}`
                  : null;
                const durationVal =
                  service.duration ?? service.duration_min ?? service.duration_max;
                const durationLabel =
                  hasDurationRange &&
                  service.duration_min != null &&
                  service.duration_max != null
                    ? `${formatDurationMinutes(service.duration_min)} – ${formatDurationMinutes(
                        service.duration_max
                      )}`
                    : durationVal != null
                    ? formatDurationMinutes(durationVal)
                    : null;
                const selected = selectedServices.includes(service.uuid);

                return (
                  <div
                    key={service.uuid}
                    className={`bdp-service-item${selected ? " selected" : ""}`}
                    onClick={() => handleServiceToggle(service.uuid)}
                    role="checkbox"
                    aria-checked={selected}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && handleServiceToggle(service.uuid)}
                  >
                    <div className="bdp-service-checkbox" aria-hidden="true" />
                    <div className="bdp-service-info">
                      <div className="bdp-service-name">{service.name}</div>
                      {service.description && (
                        <div className="bdp-service-desc">{service.description}</div>
                      )}
                      {durationLabel && (
                        <div className="bdp-service-meta">
                          <div className="bdp-service-duration">
                            <svg
                              width="12"
                              height="12"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <polyline points="12 6 12 12 16 14" />
                            </svg>
                            ~{durationLabel}
                          </div>
                        </div>
                      )}
                    </div>
                    {priceLabel && <div className="bdp-service-price">{priceLabel}</div>}
                  </div>
                );
              })
            )}
          </div>

          {/* Mobile-only booking card — shown below services when a service is selected */}
          {selectedServices.length > 0 && (
            <div className="bdp-mobile-booking">
              <div className="bdp-mobile-booking-card">
                <div className="bdp-mobile-booking-header">
                  <div className="bdp-mobile-booking-title">{t("bd.bookSlotTitle")}</div>
                  <div className="bdp-mobile-booking-sub">{t("bd.bookSlotSub")}</div>
                </div>
                <div className="bdp-mobile-booking-body">
                  <div className="bdp-service-preview">
                    <div className="bdp-preview-label">
                      {t("bd.servicesSelected", { count: selectedServicesData.length })}
                    </div>
                    {selectedServicesData.map((s) => {
                      const p = s.price ?? s.price_min ?? s.price_max;
                      return (
                        <div key={s.uuid} className="bdp-preview-row">
                          <span className="bdp-preview-name">{s.name}</span>
                          {p != null && <span className="bdp-preview-price">₹{p}</span>}
                        </div>
                      );
                    })}
                    {selectedServicesData.length > 1 && (
                      <div className="bdp-preview-total">
                        Total:{" "}
                        {hasPriceRange
                          ? `₹${totalPriceMin} – ₹${totalPriceMax}`
                          : `₹${totalPriceMin}`}
                      </div>
                    )}
                  </div>
                  <button className="bdp-book-main-btn" onClick={handleContinue}>
                    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    {t("bd.bookAppointment")}
                  </button>
                  {!isOpen && (
                    <div className="bdp-booking-note">
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      <p>
                        {t("bd.businessClosedNote")}
                        {todaySchedule?.opening_time &&
                          ` ${t("bd.opensAt", { time: todaySchedule.opening_time })}`}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Opening Hours */}
          {(business.schedule?.schedules?.length || business.schedule?.is_always_open) && (
            <div className="bdp-section-card" id="bdp-hours">
              <div className="bdp-section-title">
                <div className="bdp-section-icon">🕐</div>
                {t("bd.tabHours")}
              </div>
              {business.schedule!.is_always_open ? (
                <div className="bdp-hours-always">{t("bd.alwaysOpenDesc")}</div>
              ) : (
                <div className="bdp-hours-grid">
                  {business
                    .schedule!.schedules.slice()
                    .sort((a, b) => ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7))
                    .map((day) => {
                      const jsDay = new Date().getDay();
                      const isToday = day.day_of_week === jsDay;
                      const isoIdx = (day.day_of_week + 6) % 7;
                      return (
                        <div
                          key={day.day_of_week}
                          className={`bdp-hours-row${isToday ? " today" : ""}`}
                        >
                          <div className="bdp-hours-day">
                            {DAY_NAME(isoIdx)}
                            {isToday && (
                              <span className="bdp-today-badge">{t("today")}</span>
                            )}
                          </div>
                          {day.is_open && day.opening_time && day.closing_time ? (
                            <div className="bdp-hours-time">
                              {day.opening_time} – {day.closing_time}
                            </div>
                          ) : (
                            <div className="bdp-hours-closed">{t("bd.closed")}</div>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* Location */}
          {(addressLines.length > 0 || hasCoords) && (
            <div className="bdp-section-card" id="bdp-location">
              <div className="bdp-section-title">
                <div className="bdp-section-icon">📍</div>
                {t("bd.tabLocation")}
              </div>

              {addressLines.length > 0 && (
                <div className="bdp-address-block">
                  {addressLines.map((line, i) => (
                    <div key={i} className="bdp-address-line">
                      {line}
                    </div>
                  ))}
                </div>
              )}

              {hasCoords && (
                <>
                  <div className="bdp-map-wrap">
                    <iframe
                      title="Business location"
                      src={getMapEmbedUrl(lat, lon)}
                      className="bdp-map-iframe"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                  <a
                    href={getGoogleMapsLink(lat, lon)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bdp-map-link"
                  >
                    <svg
                      width="14"
                      height="14"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                    {t("bd.viewOnMaps")}
                  </a>
                </>
              )}
            </div>
          )}

        </div>

        <div className="bdp-sidebar">
          {/* Booking card — sticky wrapper so only the card sticks */}
          <div className="bdp-booking-sticky">
          <div className="bdp-booking-card">
            <div className="bdp-booking-header">
              <div className="bdp-booking-title">{t("bd.bookSlotTitle")}</div>
              <div className="bdp-booking-sub">{t("bd.bookSlotSub")}</div>
            </div>
            <div className="bdp-booking-body">
              {/* Selected service preview */}
              {selectedServicesData.length > 0 && (
                <div className="bdp-service-preview">
                  <div className="bdp-preview-label">
                    {t("bd.servicesSelected", { count: selectedServicesData.length })}
                  </div>
                  {selectedServicesData.map((s) => {
                    const p = s.price ?? s.price_min ?? s.price_max;
                    return (
                      <div key={s.uuid} className="bdp-preview-row">
                        <span className="bdp-preview-name">{s.name}</span>
                        {p != null && <span className="bdp-preview-price">₹{p}</span>}
                      </div>
                    );
                  })}
                  {selectedServicesData.length > 1 && (
                    <div className="bdp-preview-total">
                      Total:{" "}
                      {hasPriceRange
                        ? `₹${totalPriceMin} – ₹${totalPriceMax}`
                        : `₹${totalPriceMin}`}
                    </div>
                  )}
                </div>
              )}

              <button
                className={`bdp-book-main-btn${selectedServices.length === 0 ? " disabled" : ""}`}
                onClick={handleContinue}
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                {selectedServices.length === 0
                  ? t("bd.selectServiceFirst")
                  : t("bd.bookAppointment")}
              </button>

              {!isOpen && (
                <div className="bdp-booking-note">
                  <svg
                    width="14"
                    height="14"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p>
                    {t("bd.businessClosedNote")}
                    {todaySchedule?.opening_time &&
                      ` ${t("bd.opensAt", { time: todaySchedule.opening_time })}`}
                  </p>
                </div>
              )}
            </div>
          </div>
          </div>{/* /bdp-booking-sticky */}

          {/* Reviews */}
          <div className="bdp-section-card" id="bdp-reviews">
            <div className="bdp-section-title bdp-reviews-header">
              <div className="bdp-reviews-title-left">
                <div className="bdp-section-icon">⭐</div>
                {t("rv.title")}
              </div>
            </div>

            {/* Summary */}
            {reviewSummary && reviewSummary.review_count > 0 && (
              <div className="bdp-review-summary">
                <div className="bdp-review-avg-block">
                  <div className="bdp-review-avg-num">{reviewSummary.average_rating}</div>
                  <StarRating rating={reviewSummary.average_rating} size="md" />
                  <div className="bdp-review-total-count">
                    {t("rv.basedOn", { count: reviewSummary.review_count })}
                  </div>
                </div>
                <div className="bdp-review-bars">
                  {([5, 4, 3, 2, 1] as const).map((star) => {
                    const count = ratingCounts[star] ?? 0;
                    const pct =
                      reviews.length > 0 ? Math.round((count / reviews.length) * 100) : 0;
                    return (
                      <div key={star} className="bdp-bar-row">
                        <span className="bdp-bar-label">{star}★</span>
                        <div className="bdp-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                          <div className="bdp-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="bdp-bar-count">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* User's own review */}
            {myReview && (
              <div className="bdp-my-review">
                <div className="bdp-my-review-label">{t("rv.alreadyReviewed")}</div>
                <StarRating rating={myReview.rating} />
                {myReview.comment && (
                  <p className="bdp-my-review-comment">{myReview.comment}</p>
                )}
                {myReview.created_at && (
                  <div className="bdp-my-review-date">
                    {formatReviewDate(myReview.created_at)}
                  </div>
                )}
              </div>
            )}

            {(reviewSummary?.review_count ?? 0) > 0 && (
              <div className="bdp-section-divider" />
            )}

            {reviews.length === 0 ? (
              <div className="bdp-reviews-empty">
                <div className="bdp-reviews-empty-icon" aria-hidden="true">💬</div>
                <div className="bdp-reviews-empty-title">{t("rv.emptyTitle")}</div>
                <div className="bdp-reviews-empty-sub">{t("rv.emptySub")}</div>
                {!isAuthenticated() && (
                  <button
                    className="bdp-review-signin-btn"
                    onClick={() => navigate("/send-otp")}
                  >
                    {t("rv.signInReview")}
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="bdp-reviews-list">
                  {reviews.map((review) => (
                    <div key={review.uuid} className="bdp-review-item">
                      <div className="bdp-review-avatar" aria-hidden="true">
                        {(review.user_name || t("rv.anonymous")).charAt(0).toUpperCase()}
                      </div>
                      <div className="bdp-review-body">
                        <div className="bdp-review-meta">
                          <span className="bdp-review-name">
                            {review.user_name || t("rv.anonymous")}
                          </span>
                          {review.is_verified && (
                            <span className="bdp-review-verified">{t("rv.verified")}</span>
                          )}
                          {review.created_at && (
                            <span className="bdp-review-date">
                              {formatReviewDate(review.created_at)}
                            </span>
                          )}
                        </div>
                        <StarRating rating={review.rating} />
                        {review.comment && (
                          <p className="bdp-review-comment">{review.comment}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {!isAuthenticated() && (
                  <div className="bdp-review-signin-strip">
                    <span>{t("rv.signInReview")}</span>
                    <button
                      className="bdp-review-signin-btn"
                      onClick={() => navigate("/send-otp")}
                    >
                      {t("nav.signIn")}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Review Modal */}
      <ReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        businessId={businessId ?? ""}
        businessName={business?.name ?? ""}
        onSuccess={handleReviewSuccess}
      />
    </div>
  );
}
