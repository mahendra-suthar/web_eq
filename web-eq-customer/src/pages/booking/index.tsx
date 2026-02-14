import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBookingStore, type AvailableSlotData } from "../../store/booking.store";
import { useAuthStore } from "../../store/auth.store";
import { useQueueWebSocket } from "../../hooks/useQueueWebSocket";
import { BookingService } from "../../services/booking/booking.service";
import { BusinessService, type BusinessServiceData } from "../../services/business/business.service";
import { getNext7Days } from "../../utils/booking.utils";
import { isDateInPast, formatDateDisplay } from "../../utils/util";
import { HttpStatus } from "../../utils/constants";
import Button from "../../components/button";
import "./booking.scss";

export default function BookingPage() {
  const { t } = useTranslation();
  const { businessId } = useParams<{ businessId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const initialSelectedServices = (location.state?.selectedServices as string[]) || [];
  const initialSelectedServicesData = (location.state?.selectedServicesData as BusinessServiceData[]) || [];
  const initialBusinessName = (location.state?.businessName as string) || "";

  useEffect(() => {
    if (!isAuthenticated()) {
      navigate("/send-otp", {
        state: {
          returnTo: `/business/${businessId}/book`,
          selectedServices: initialSelectedServices,
          selectedServicesData: initialSelectedServicesData,
          businessName: initialBusinessName,
        },
      });
      return;
    }
  }, [isAuthenticated, businessId, navigate, initialSelectedServices, initialSelectedServicesData, initialBusinessName]);

  if (!isAuthenticated()) {
    return null;
  }

  const {
    selectedDate,
    selectedQueue,
    availableSlots,
    loading,
    error,
    setSelectedDate,
    setSelectedQueue,
    setAvailableSlots,
    setLoading,
    setError,
  } = useBookingStore();

  const [selectedServices, setSelectedServices] = useState<BusinessServiceData[]>(initialSelectedServicesData);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bookingInProgress, setBookingInProgress] = useState(false);

  const { connected: wsConnectedState, sendRefresh } = useQueueWebSocket({
    businessId: businessId || "",
    date: selectedDate || "",
    enabled: !!businessId && !!selectedDate,
  });

  const selectableDates = useMemo(() => getNext7Days(), []);

  useEffect(() => {
    const loadServices = async () => {
      if (initialSelectedServicesData.length > 0) return;
      if (!businessId || initialSelectedServices.length === 0) return;
      try {
        setLoading(true);
        const businessService = new BusinessService();
        const allServices = await businessService.getBusinessServices(businessId);
        const selected = allServices.filter((s) => initialSelectedServices.includes(s.uuid));
        setSelectedServices(selected);
      } catch (err: any) {
        console.error("Failed to load services:", err);
        setError("Failed to load service details");
      } finally {
        setLoading(false);
      }
    };
    loadServices();
  }, [businessId, initialSelectedServices, initialSelectedServicesData, setLoading, setError]);

  const fetchSlots = useCallback(async () => {
    if (!businessId || !selectedDate) return;
    try {
      setLoading(true);
      setError(null);
      const bookingService = new BookingService();
      const slots = await bookingService.getAvailableSlots(
        businessId,
        selectedDate,
        initialSelectedServices
      );
      setAvailableSlots(slots);
    } catch (err: any) {
      console.error("Failed to fetch available slots:", err);
      setError("Failed to load available slots. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [businessId, selectedDate, initialSelectedServices, setAvailableSlots, setLoading, setError]);

  useEffect(() => {
    if (selectedDate && !isDateInPast(selectedDate)) {
      fetchSlots();
    }
  }, [selectedDate, fetchSlots]);

  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);

  const handleDateSelect = (date: string) => {
    if (isDateInPast(date)) return;
    setSelectedDate(date);
    setSelectedQueue(null);
  };

  const handleQueueSelect = (slot: AvailableSlotData) => {
    if (!slot.available) return;
    setSelectedQueue(slot);
  };

  const handleConfirm = async () => {
    if (!businessId || !selectedQueue || !selectedDate) return;
    if (isDateInPast(selectedDate)) {
      setError("Please select today or a future date.");
      return;
    }
    setBookingInProgress(true);
    try {
      const bookingService = new BookingService();
      await bookingService.createBooking({
        business_id: businessId,
        queue_id: selectedQueue.queue_id,
        queue_date: selectedDate,
        service_ids: initialSelectedServices,
      });
      alert(t("bookingConfirmed"));
      navigate("/");
    } catch (err: any) {
      console.error("Booking failed:", err);
      const errorMsg = err.response?.data?.detail || "Booking failed. Please try again.";
      setError(errorMsg);
      if (err.response?.status === HttpStatus.UNAUTHORIZED) {
        alert(t("pleaseLogin"));
        navigate("/send-otp", {
          state: {
            returnTo: `/business/${businessId}/book`,
            selectedServices: initialSelectedServices,
            selectedServicesData: initialSelectedServicesData,
            businessName: initialBusinessName,
          },
        });
        return;
      }
    } finally {
      setBookingInProgress(false);
    }
  };

  const canProceedToSlots = selectedDate !== null && selectedDate !== "" && !isDateInPast(selectedDate);
  const canConfirm = selectedQueue !== null;

  // ——— Confirmation screen ———
  if (showConfirmation) {
    return (
      <div className="booking-page booking-page-confirm">
        <div className="bp-confirm-header">
          <h1 className="bp-title">Confirm Booking</h1>
          <p className="bp-subtitle">Review and fix your appointment</p>
        </div>

        <section className="bp-card">
          <h3 className="bp-card-heading">Business</h3>
          <p className="bp-card-value">{initialBusinessName}</p>
        </section>

        <section className="bp-card">
          <h3 className="bp-card-heading">Services</h3>
          <ul className="bp-service-list">
            {selectedServices.map((service) => (
              <li key={service.uuid} className="bp-service-list-item">
                <span className="bp-service-list-name">{service.name}</span>
                <span className="bp-service-list-meta">
                  ₹{service.price ?? 0} · {service.duration ?? 0} min
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bp-card">
          <h3 className="bp-card-heading">Date & time slot</h3>
          <p className="bp-card-value">{selectedDate ? formatDateDisplay(selectedDate) : ""}</p>
          <p className="bp-card-meta">
            {selectedQueue?.queue_name} · Est. wait: {selectedQueue?.estimated_wait_minutes} min
          </p>
          <p className="bp-card-meta">Expected at: {selectedQueue?.estimated_appointment_time}</p>
        </section>

        <section className="bp-card bp-card-total">
          <div className="bp-total-row">
            <span className="bp-total-label">Total</span>
            <span className="bp-total-amount">₹{totalPrice}</span>
          </div>
        </section>

        {error && (
          <div className="bp-error" role="alert">
            <p>{error}</p>
          </div>
        )}

        <div className="bp-actions">
          <Button
            text="Back"
            color="outline-blue"
            onClick={() => setShowConfirmation(false)}
            disabled={bookingInProgress}
          />
          <Button
            text={bookingInProgress ? t("confirming") : t("fixAppointment")}
            color="blue"
            size="lg"
            onClick={handleConfirm}
            disabled={bookingInProgress}
            loading={bookingInProgress}
          />
        </div>
      </div>
    );
  }

  // ——— Main booking flow: Date → Services (table) → Time slots → Summary ———
  return (
    <div className="booking-page">
      <header className="bp-header">
        <h1 className="bp-title">Book Appointment</h1>
        {initialBusinessName && <p className="bp-business-name">{initialBusinessName}</p>}
        {selectedDate && (
          <div className={`bp-ws-badge ${wsConnectedState ? "connected" : "disconnected"}`}>
            <span className="bp-ws-dot" aria-hidden />
            {wsConnectedState ? t("liveUpdates") : t("connecting")}
          </div>
        )}
      </header>

      {/* 1. Date selection — first */}
      <section className="bp-section" aria-labelledby="bp-date-title">
        <h2 id="bp-date-title" className="bp-section-title">{t("selectDate")}</h2>
        <p className="bp-section-desc">Choose today or a future date</p>
        <div className="bp-dates-grid" role="group" aria-label="Select date">
          {selectableDates.map((date) => {
            const disabled = isDateInPast(date);
            return (
              <button
                key={date}
                type="button"
                className={`bp-date-card ${selectedDate === date ? "selected" : ""} ${disabled ? "disabled" : ""}`}
                onClick={() => handleDateSelect(date)}
                disabled={disabled}
                aria-pressed={selectedDate === date}
                aria-disabled={disabled}
              >
                <span className="bp-date-day">{formatDateDisplay(date).split(" ")[0]}</span>
                <span className="bp-date-rest">{formatDateDisplay(date).split(" ").slice(1).join(" ")}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Selected services — table + total */}
      <section className="bp-section" aria-labelledby="bp-services-title">
        <h2 id="bp-services-title" className="bp-section-title">{t("selectedServices")}</h2>
        {loading && selectedServices.length === 0 ? (
          <div className="bp-loading">
            <div className="bp-spinner" aria-hidden />
            <p>{t("loading")}</p>
          </div>
        ) : selectedServices.length === 0 ? (
          <div className="bp-empty">
            <p>{t("noServicesSelected")}</p>
            <Button
              text="Back to business"
              color="outline-blue"
              onClick={() => navigate(`/business/${businessId}`)}
            />
          </div>
        ) : (
          <div className="bp-services-wrap">
            <table className="bp-services-table">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Duration</th>
                  <th scope="col" className="bp-th-price">Price</th>
                </tr>
              </thead>
              <tbody>
                {selectedServices.map((service) => (
                  <tr key={service.uuid}>
                    <td className="bp-td-service">{service.name}</td>
                    <td className="bp-td-duration">{service.duration ?? 0} min</td>
                    <td className="bp-td-price">₹{service.price ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="bp-services-total">
              <span className="bp-services-total-label">Total</span>
              <span className="bp-services-total-duration">{totalDuration} min</span>
              <span className="bp-services-total-amount">₹{totalPrice}</span>
            </div>
          </div>
        )}
      </section>

      {/* 3. Time slots — when date selected */}
      {canProceedToSlots && (
        <section className="bp-section" aria-labelledby="bp-slots-title">
          <h2 id="bp-slots-title" className="bp-section-title">{t("selectTimeSlot")}</h2>
          <p className="bp-section-desc">Choose a time slot · Updates in real-time</p>

          {loading ? (
            <div className="bp-loading">
              <div className="bp-spinner" aria-hidden />
              <p>Loading available slots…</p>
            </div>
          ) : error ? (
            <div className="bp-error" role="alert">
              <p>{error}</p>
              <Button text="Retry" color="outline-blue" onClick={fetchSlots} />
            </div>
          ) : availableSlots.length === 0 ? (
            <div className="bp-empty">
              <p>{t("noSlotsAvailable")}</p>
              <p className="bp-empty-hint">Try another date.</p>
            </div>
          ) : (
            <div className="bp-slots-grid">
              {availableSlots.map((slot) => (
                <button
                  key={slot.queue_id}
                  type="button"
                  className={`bp-slot-card ${selectedQueue?.queue_id === slot.queue_id ? "selected" : ""} ${!slot.available ? "unavailable" : ""}`}
                  onClick={() => handleQueueSelect(slot)}
                  disabled={!slot.available}
                  aria-pressed={selectedQueue?.queue_id === slot.queue_id}
                >
                  <div className="bp-slot-header">
                    <h3 className="bp-slot-queue">{slot.queue_name}</h3>
                    <span className={`bp-slot-status ${slot.available ? "available" : "full"}`}>
                      {slot.status}
                    </span>
                  </div>
                  <div className="bp-slot-details">
                    <p className="bp-slot-row">
                      <span className="label">Position</span>
                      <span className="value">#{slot.current_position + 1}</span>
                    </p>
                    <p className="bp-slot-row">
                      <span className="label">Est. wait</span>
                      <span className="value">{slot.estimated_wait_minutes} min</span>
                    </p>
                    <p className="bp-slot-row">
                      <span className="label">Expected at</span>
                      <span className="value">{slot.estimated_appointment_time}</span>
                    </p>
                    {slot.capacity != null && (
                      <p className="bp-slot-row">
                        <span className="label">Capacity</span>
                        <span className="value">{slot.current_position}/{slot.capacity}</span>
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {wsConnectedState && !loading && (
            <button type="button" className="bp-refresh" onClick={sendRefresh}>
              ↻ Refresh slots
            </button>
          )}
        </section>
      )}

      {/* 4. Summary & continue */}
      {canConfirm && (
        <section className="bp-section bp-section-summary">
          <div className="bp-summary-card">
            <div className="bp-summary-row">
              <span className="bp-summary-label">Total amount</span>
              <span className="bp-summary-amount">₹{totalPrice}</span>
            </div>
            <p className="bp-summary-meta">
              {selectedServices.length} {selectedServices.length === 1 ? t("service") : t("services")} · {selectedDate ? formatDateDisplay(selectedDate) : ""}
            </p>
            <p className="bp-summary-queue">
              {selectedQueue?.queue_name} · Wait ~{selectedQueue?.estimated_wait_minutes} min
            </p>
          </div>
          <Button
            text={t("continueToConfirm")}
            color="blue"
            size="lg"
            onClick={() => setShowConfirmation(true)}
            className="bp-cta"
          />
        </section>
      )}
    </div>
  );
}
