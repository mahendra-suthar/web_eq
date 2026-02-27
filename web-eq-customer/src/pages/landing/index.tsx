import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import CategoryCard from "../../components/category-card";
import BusinessCard from "../../components/business-card";
import { mockBusinesses } from "../../mock/businesses";
import Button from "../../components/button";
import { CategoryService, type CategoryWithServicesData } from "../../services/category/category.service";
import { AppointmentService, type TodayAppointmentResponse } from "../../services/appointment/appointment.service";
import { useAuthStore } from "../../store/auth.store";
import { formatDurationMinutes, formatTimeToDisplay } from "../../utils/util";
import "./landing.scss";

export default function LandingPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();
  const [categories, setCategories] = useState<CategoryWithServicesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayAppointment, setTodayAppointment] = useState<TodayAppointmentResponse | null | undefined>(undefined);
  const [todayLoading, setTodayLoading] = useState(false);

  const fetchTodayAppointment = useCallback(async () => {
    if (!isAuthenticated()) {
      setTodayAppointment(null);
      return;
    }
    setTodayLoading(true);
    try {
      const appointmentService = new AppointmentService();
      const data = await appointmentService.getTodayAppointment();
      setTodayAppointment(data ?? null);
    } catch (err) {
      console.error("Failed to fetch today's appointment:", err);
      setTodayAppointment(null);
    } finally {
      setTodayLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchTodayAppointment();
  }, [fetchTodayAppointment]);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const categoryService = new CategoryService();
      const data = await categoryService.getCategoriesWithServices();
      setCategories(data);
    } catch (err: any) {
      console.error("Failed to fetch categories:", err);
      setError("Failed to load categories. Please try again later.");
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

      {isAuthenticated() && (todayLoading || todayAppointment) && (
        <div className="landing-section landing-section-today">
          <div className="landing-section-header">
            <h2 className="landing-section-title">Today&apos;s appointment</h2>
            <p className="landing-section-subtitle">
              Your current queue status and expected time.
            </p>
          </div>
          {todayLoading ? (
            <div className="landing-today-loading">
              <div className="landing-spinner" aria-hidden />
              <p>Loading your appointment…</p>
            </div>
          ) : todayAppointment ? (
            <div
              className="landing-today-card"
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/business/${todayAppointment.business_id}`)}
              onKeyDown={(e) => e.key === "Enter" && navigate(`/business/${todayAppointment.business_id}`)}
              aria-label={`View ${todayAppointment.business_name} – token ${todayAppointment.token_number}`}
            >
              <div className="landing-today-card-header">
                <span className="landing-today-business">{todayAppointment.business_name}</span>
                <span className={`landing-today-status status-${todayAppointment.status === 1 ? "waiting" : "in-progress"}`}>
                  {todayAppointment.status === 1 ? "Waiting" : "In progress"}
                </span>
              </div>
              <p className="landing-today-queue">{todayAppointment.queue_name}</p>
              {todayAppointment.service_summary && (
                <p className="landing-today-services">{todayAppointment.service_summary}</p>
              )}
              <div className="landing-today-details">
                <span className="landing-today-token">Token #{todayAppointment.token_number}</span>
                {todayAppointment.position != null && (
                  <span className="landing-today-position">Position #{todayAppointment.position}</span>
                )}
                {todayAppointment.estimated_wait_minutes != null && todayAppointment.estimated_wait_minutes > 0 && (
                  <span className="landing-today-wait">
                    Est. wait {formatDurationMinutes(todayAppointment.estimated_wait_minutes)}
                    {todayAppointment.estimated_wait_range && ` (${todayAppointment.estimated_wait_range})`}
                  </span>
                )}
                {todayAppointment.estimated_appointment_time && (
                  <span className="landing-today-time">
                    Expected at {formatTimeToDisplay(todayAppointment.estimated_appointment_time)}
                  </span>
                )}
              </div>
              <p className="landing-today-cta">Tap to view business →</p>
            </div>
          ) : null}
        </div>
      )}

      <div className="landing-section landing-section-categories">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Browse by category</h2>
          <p className="landing-section-subtitle">Tap a category to see businesses near you.</p>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <p>Loading categories...</p>
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "2rem", color: "#d32f2f" }}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="landing-grid">
            {categories.length > 0 ? (
              categories.map((category) => (
                <CategoryCard key={category.uuid} category={category} />
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <p>No categories available.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Popular right now</h2>
          <p className="landing-section-subtitle">
            A few featured places to show how listings will look.
          </p>
        </div>

        <div className="landing-grid">
          {mockBusinesses.slice(0, 3).map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
        </div>
      </div>
    </div>
  );
}
