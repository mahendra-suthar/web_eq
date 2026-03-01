import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BusinessService,
  type BusinessDetailData,
  type BusinessServiceData,
} from "../../services/business/business.service";
import { formatFullAddress, getMapEmbedUrl, getGoogleMapsLink, formatDurationMinutes } from "../../utils/util";
import { DAY_NAMES } from "../../utils/constants";
import Button from "../../components/button";
import "./business-details.scss";

export default function BusinessDetailsPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<BusinessDetailData | null>(null);
  const [services, setServices] = useState<BusinessServiceData[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!businessId) {
        setError("Business ID is required");
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const businessService = new BusinessService();
        const [businessData, servicesData] = await Promise.all([
          businessService.getBusinessDetails(businessId),
          businessService.getBusinessServices(businessId),
        ]);
        setBusiness(businessData);
        setServices(servicesData);
      } catch (err: any) {
        console.error("Failed to fetch data:", err);
        setError(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Failed to load business details. Please try again later.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [businessId]);

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    );
  };

  const handleContinue = () => {
    if (selectedServices.length === 0) return;
    const selectedServicesData = services.filter((s) => selectedServices.includes(s.uuid));
    const variantIds = selectedServicesData.flatMap((s) => s.variant_uuids?.length ? s.variant_uuids : [s.uuid]);
    navigate(`/business/${businessId}/book`, {
      state: {
        selectedServices: variantIds,
        selectedServicesData,
        businessName: business?.name || "",
      },
    });
  };

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

  const addressLines = useMemo(() => formatFullAddress(business?.address ?? null), [business?.address]);
  const hasCoords =
    business?.address?.latitude != null &&
    business?.address?.longitude != null &&
    !isNaN(business.address.latitude) &&
    !isNaN(business.address.longitude);

  if (loading) {
    return (
      <div className="business-details-page">
        <div className="bds-loading">
          <div className="bds-loading-spinner" aria-hidden />
          <p>Loading business details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="business-details-page">
        <div className="bds-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="business-details-page">
        <div className="bds-error">
          <p>Business not found</p>
        </div>
      </div>
    );
  }

  const lat = business.address?.latitude ?? 0;
  const lon = business.address?.longitude ?? 0;

  return (
    <div className="business-details-page">
      <header className="bds-hero">
        <div className="bds-hero-bg" />
        <div className="bds-hero-content">
          <div className="bds-hero-avatar">
            {business.profile_picture ? (
              <img src={business.profile_picture} alt="" />
            ) : (
              <span className="bds-hero-initial">{business.name.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <div className="bds-hero-text">
            <h1 className="bds-hero-title">{business.name}</h1>
            {business.category_name && (
              <p className="bds-hero-category">{business.category_name}</p>
            )}
            <div className="bds-hero-badges">
              {business.is_open ? (
                <span className="bds-badge bds-badge-open">Open now</span>
              ) : (
                <span className="bds-badge bds-badge-closed">Closed</span>
              )}
              {business.is_always_open && (
                <span className="bds-badge bds-badge-24">24/7</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="bds-contact-strip">
        {business.phone_number && (
          <a
            href={`tel:${business.country_code || ""}${business.phone_number}`}
            className="bds-contact-item"
          >
            <span className="bds-contact-icon">📞</span>
            {business.country_code && <span>{business.country_code} </span>}
            {business.phone_number}
          </a>
        )}
        {business.email && (
          <a href={`mailto:${business.email}`} className="bds-contact-item">
            <span className="bds-contact-icon">✉️</span>
            {business.email}
          </a>
        )}
      </div>

      {business.about_business && (
        <section className="bds-section">
          <h2 className="bds-section-title">About</h2>
          <p className="bds-about-text">{business.about_business}</p>
        </section>
      )}

      <section className="bds-section">
        <h2 className="bds-section-title">Services</h2>
        <p className="bds-section-subtitle">Select one or more services to book</p>
        {services.length === 0 ? (
          <div className="bds-empty">No services available at this time.</div>
        ) : (
          <div className="bds-services-grid">
            {services.map((service) => {
              const hasDurationRange =
                service.duration_min != null &&
                service.duration_max != null &&
                service.duration_min !== service.duration_max;
              const hasPriceRange =
                service.price_min != null &&
                service.price_max != null &&
                service.price_min !== service.price_max;
              const priceLabel = hasPriceRange
                ? `₹${service.price_min} – ₹${service.price_max}`
                : (service.price ?? service.price_min ?? service.price_max) != null
                  ? `₹${service.price ?? service.price_min ?? service.price_max}`
                  : null;
              const durationLabel = hasDurationRange
                ? `${formatDurationMinutes(service.duration_min)} – ${formatDurationMinutes(service.duration_max)}`
                : (service.duration ?? service.duration_min ?? service.duration_max) != null
                  ? formatDurationMinutes(service.duration ?? service.duration_min ?? service.duration_max)
                  : null;
              return (
                <button
                  type="button"
                  key={service.uuid}
                  className={`bds-service-card ${selectedServices.includes(service.uuid) ? "selected" : ""}`}
                  onClick={() => handleServiceToggle(service.uuid)}
                >
                  <h3 className="bds-service-name">{service.name}</h3>
                  {service.description && (
                    <p className="bds-service-desc">{service.description}</p>
                  )}
                  <div className="bds-service-meta">
                    {durationLabel != null && (
                      <span className="bds-service-duration">⏱ {durationLabel}</span>
                    )}
                    {priceLabel != null && (
                      <span className="bds-service-price">{priceLabel}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {(addressLines.length > 0 || hasCoords) && (
        <section className="bds-section bds-address-section">
          <h2 className="bds-section-title">Location</h2>
          <div className="bds-address-block">
            {addressLines.length > 0 && (
              <address className="bds-address-text">
                {addressLines.map((line, i) => (
                  <span key={i}>{line}</span>
                ))}
              </address>
            )}
            {hasCoords && (
              <a
                href={getGoogleMapsLink(lat, lon)}
                target="_blank"
                rel="noopener noreferrer"
                className="bds-map-link"
              >
                View on Google Maps →
              </a>
            )}
          </div>
          {hasCoords && (
            <div className="bds-map-wrap">
              <iframe
                title="Business location"
                src={getMapEmbedUrl(lat, lon)}
                className="bds-map-iframe"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          )}
        </section>
      )}

      {(business.schedule?.schedules?.length || business.schedule?.is_always_open) && (
        <section className="bds-section">
          <h2 className="bds-section-title">Opening hours</h2>
          <div className="bds-schedule">
            {business.schedule.is_always_open ? (
              <p className="bds-schedule-always">Open 24 hours, 7 days a week</p>
            ) : (
              <ul className="bds-schedule-list">
                {business.schedule.schedules.map((day) => (
                  <li key={day.day_of_week} className="bds-schedule-row">
                    <span className="bds-schedule-day">
                      {DAY_NAMES[day.day_of_week] ?? `Day ${day.day_of_week}`}
                    </span>
                    <span className="bds-schedule-time">
                      {day.is_open && day.opening_time && day.closing_time
                        ? `${day.opening_time} – ${day.closing_time}`
                        : "Closed"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {selectedServices.length > 0 && (
        <div className="bds-sticky-bar">
          <div className="bds-sticky-inner">
            <div>
              <p className="bds-sticky-text">
                {selectedServices.length} service{selectedServices.length !== 1 ? "s" : ""} selected
              </p>
              <p className="bds-sticky-total">
                Total: {hasPriceRange ? `₹${totalPriceMin} – ₹${totalPriceMax}` : `₹${totalPriceMin}`}
              </p>
            </div>
            <Button text="Continue to booking" color="blue" size="lg" onClick={handleContinue} />
          </div>
        </div>
      )}
    </div>
  );
}
