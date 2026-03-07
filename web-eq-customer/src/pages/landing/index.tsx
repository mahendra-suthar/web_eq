import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import CategoryCard from "../../components/category-card";
import BusinessCard from "../../components/business-card";
import type { Business } from "../../mock/businesses";
import Button from "../../components/button";
import { CategoryService, type CategoryWithServicesData } from "../../services/category/category.service";
import { BusinessService } from "../../services/business/business.service";
import { AppointmentService, type TodayAppointmentResponse } from "../../services/appointment/appointment.service";
import { useAuthStore } from "../../store/auth.store";
import AppointmentActions from "../../components/appointment-actions";
import LoadingSpinner from "../../components/loading-spinner";
import EmptyState from "../../components/empty-state";
import ErrorMessage from "../../components/error-message";
import {
  formatDurationMinutes,
  formatAppointmentTimeSummary,
  formatDelayMessage,
  getApiErrorMessage,
} from "../../utils/util";
import "./landing.scss";

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [categories, setCategories] = useState<CategoryWithServicesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointmentResponse[]>([]);
  const [todayLoading, setTodayLoading] = useState(false);
  const [featuredBusinesses, setFeaturedBusinesses] = useState<Business[]>([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string | null>(null);

  const FEATURED_LIMIT = 6;

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

  useEffect(() => {
    fetchTodayAppointments();
  }, [fetchTodayAppointments]);

  useEffect(() => {
    fetchCategories();
  }, []);

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

  useEffect(() => {
    fetchFeaturedBusinesses();
  }, [fetchFeaturedBusinesses]);

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

  return (
    <div className="landing-page">
      <div className="landing-hero">
        <div className="landing-hero-inner">
          <p className="landing-kicker">Book smarter. Wait less.</p>
          <h1 className="landing-title">
            Find the right place and fix your appointment in minutes.
          </h1>
          <p className="landing-subtitle">
            Choose a category, pick a business, select a date, and confirm your slot/queue — all in a
            clean, fast experience.
          </p>

          <div className="landing-cta-row">
            <Button
              text="Explore categories"
              color="blue"
              size="lg"
              onClick={() => {
                document.querySelector(".landing-section-categories")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
            <Button
              text="How it works"
              color="transparent"
              size="lg"
              onClick={() => {
                // TODO: Add how it works modal/page
              }}
            />
          </div>
        </div>
      </div>

      {isAuthenticated() && (todayLoading || todayAppointments.length > 0) && (
        <div className="landing-section landing-section-today">
          <div className="landing-section-header">
            <h2 className="landing-section-title">Today&apos;s appointments</h2>
            <p className="landing-section-subtitle">
              Your current queue status and expected time.
            </p>
          </div>
          {todayLoading ? (
            <div className="landing-today-loading loading-state">
              <LoadingSpinner aria-label="Loading appointments" size="md" />
              <p className="loading-state__message">Loading your appointments…</p>
            </div>
          ) : (
            <div className="landing-today-cards">
              {todayAppointments.map((appointment) => (
                <div
                  key={appointment.queue_user_id}
                  className="landing-today-card"
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/business/${appointment.business_id}`)}
                  onKeyDown={(e) => e.key === "Enter" && navigate(`/business/${appointment.business_id}`)}
                  aria-label={`View ${appointment.business_name} – token ${appointment.token_number}`}
                >
                  <div className="landing-today-card-header">
                    <span className="landing-today-business">{appointment.business_name}</span>
                    <span className={`landing-today-status status-${appointment.status === 1 ? "waiting" : "in-progress"}`}>
                      {appointment.status === 1 ? "Waiting" : "In progress"}
                    </span>
                  </div>
                  <p className="landing-today-queue">{appointment.queue_name}</p>
                  {appointment.service_summary && (
                    <p className="landing-today-services">{appointment.service_summary}</p>
                  )}
                  <div className="landing-today-details">
                    <span className="landing-today-token">Token #{appointment.token_number}</span>
                    {appointment.position != null && (
                      <span className="landing-today-position">Position #{appointment.position}</span>
                    )}
                    {appointment.estimated_wait_minutes != null && appointment.estimated_wait_minutes > 0 && (
                      <span className="landing-today-wait">
                        Est. wait {formatDurationMinutes(appointment.estimated_wait_minutes)}
                        {appointment.estimated_wait_range && ` (${appointment.estimated_wait_range})`}
                      </span>
                    )}
                    {formatAppointmentTimeSummary(
                      appointment.appointment_type,
                      appointment.scheduled_start ?? null,
                      appointment.scheduled_end ?? null,
                      appointment.estimated_appointment_time ?? null
                    ) && (
                      <span className="landing-today-time">
                        {formatAppointmentTimeSummary(
                          appointment.appointment_type,
                          appointment.scheduled_start ?? null,
                          appointment.scheduled_end ?? null,
                          appointment.estimated_appointment_time ?? null
                        )}
                      </span>
                    )}
                    {formatDelayMessage(appointment.delay_minutes ?? null) && (
                      <span className="landing-today-delay">
                        {formatDelayMessage(appointment.delay_minutes ?? null)}
                      </span>
                    )}
                  </div>
                  <AppointmentActions appointment={appointment} onUpdated={fetchTodayAppointments} />
                  <p className="landing-today-cta">Tap to view business →</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="landing-section landing-section-categories">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Browse by category</h2>
          <p className="landing-section-subtitle">Tap a category to see businesses near you.</p>
        </div>

        {loading && (
          <div className="landing-categories-loading loading-state">
            <LoadingSpinner aria-label="Loading categories" size="md" />
            <p className="loading-state__message">Loading categories...</p>
          </div>
        )}

        {error && (
          <div className="landing-categories-error">
            <ErrorMessage>{error}</ErrorMessage>
          </div>
        )}

        {!loading && !error && (
          <div className="landing-grid">
            {categories.length > 0 ? (
              categories.map((category) => (
                <CategoryCard key={category.uuid} category={category} />
              ))
            ) : (
              <EmptyState
                title="No categories available."
                className="landing-categories-empty"
              />
            )}
          </div>
        )}
      </div>

      <div className="landing-section landing-section-featured">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Explore businesses</h2>
          <p className="landing-section-subtitle">
            Start with these or browse by category above.
          </p>
        </div>

        {featuredLoading && (
          <div className="landing-featured-loading loading-state">
            <LoadingSpinner aria-label="Loading businesses" size="md" />
            <p className="loading-state__message">Loading businesses…</p>
          </div>
        )}

        {featuredError && !featuredLoading && (
          <div className="landing-featured-error">
            <ErrorMessage>{featuredError}</ErrorMessage>
          </div>
        )}

        {!featuredLoading && !featuredError && featuredBusinesses.length > 0 && (
          <div className="landing-grid">
            {featuredBusinesses.map((business) => (
              <BusinessCard key={business.id} business={business} />
            ))}
          </div>
        )}

        {!featuredLoading && !featuredError && featuredBusinesses.length === 0 && (
          <EmptyState
            title="No businesses yet"
            hint="Browse by category above to discover and book with businesses as they join."
            className="landing-featured-empty"
          />
        )}
      </div>
    </div>
  );
}
