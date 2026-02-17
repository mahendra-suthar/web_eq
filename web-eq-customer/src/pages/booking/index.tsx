import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBookingStore, type QueueOptionData } from "../../store/booking.store";
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
    loading,
    error,
    bookingConfirmation,
    setSelectedDate,
    setSelectedQueue,
    setAvailableSlots,
    setLoading,
    setError,
    setBookingConfirmation,
  } = useBookingStore();

  const [selectedServices, setSelectedServices] = useState<BusinessServiceData[]>(initialSelectedServicesData);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  const [queueOptions, setQueueOptions] = useState<QueueOptionData[]>([]);
  const [selectedQueueOption, setSelectedQueueOption] = useState<QueueOptionData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const { connected: wsConnectedState } = useQueueWebSocket({
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

  const serviceIds = useMemo(
    () => selectedServices.map((s) => s.uuid).filter(Boolean),
    [selectedServices]
  );

  const fetchBookingPreview = useCallback(async () => {
    if (!businessId || !selectedDate || serviceIds.length === 0) return;
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      setQueueOptions([]);
      setSelectedQueueOption(null);
      setAvailableSlots([]);
      setSelectedQueue(null);

      const bookingService = new BookingService();
      const preview = await bookingService.getBookingPreview(
        businessId,
        selectedDate,
        serviceIds
      );

      setQueueOptions(preview.queues || []);

      const recommended = preview.queues?.find((q) => q.is_recommended);
      const defaultSelection = recommended ?? preview.queues?.[0] ?? null;
      if (defaultSelection) {
        handleQueueOptionSelect(defaultSelection);
      }
    } catch (err: any) {
      console.error("Failed to fetch booking preview:", err);
      const message =
        err.response?.data?.detail || "Failed to load queue options. Please try again.";
      setPreviewError(message);
      setQueueOptions([]);
      setSelectedQueueOption(null);
      setAvailableSlots([]);
      setSelectedQueue(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [businessId, selectedDate, serviceIds, setAvailableSlots, setSelectedQueue]);

  useEffect(() => {
    if (selectedDate && !isDateInPast(selectedDate) && serviceIds.length > 0) {
      fetchBookingPreview();
    } else {
      setQueueOptions([]);
      setSelectedQueueOption(null);
      setPreviewError(null);
    }
  }, [selectedDate, serviceIds.length, fetchBookingPreview]);

  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);

  const handleDateSelect = (date: string) => {
    if (isDateInPast(date)) return;
    setSelectedDate(date);
    setSelectedQueue(null);
    setSelectedQueueOption(null);
    setQueueOptions([]);
    setPreviewError(null);
  };

  const handleQueueOptionSelect = (option: QueueOptionData) => {
    if (!option.available) return;
    setSelectedQueueOption(option);
    setSelectedQueue({
      queue_id: option.queue_id,
      queue_name: option.queue_name,
      date: selectedDate || "",
      available: option.available,
      current_position: option.position,
      capacity: null,
      estimated_wait_minutes: option.estimated_wait_minutes,
      estimated_appointment_time: option.estimated_appointment_time,
      estimated_wait_range: option.estimated_wait_range,
      status: option.available ? "Available" : "Full",
    });
  };

  const handleConfirm = async () => {
    if (!businessId || !selectedDate) return;
    const queueId = selectedQueueOption?.queue_id ?? selectedQueue?.queue_id;
    if (!queueId) {
      setError("Please select a queue.");
      return;
    }
    if (isDateInPast(selectedDate)) {
      setError("Please select today or a future date.");
      return;
    }
    setBookingInProgress(true);
    setError(null);
    setBookingConfirmation(null);
    try {
      const bookingService = new BookingService();
      const result = await bookingService.createBooking({
        business_id: businessId,
        queue_id: queueId,
        queue_date: selectedDate,
        service_ids: serviceIds.length > 0 ? serviceIds : initialSelectedServices,
      });
      if (result.already_in_queue) {
        setBookingConfirmation(result);
        return;
      }
      alert(t("bookingConfirmed"));
      navigate("/");
    } catch (err: any) {
      console.error("Booking failed:", err);
      const errorMsg =
        err.response?.data?.detail || "Booking failed. Please try again.";
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

  const canProceedToSlots =
    selectedDate !== null &&
    selectedDate !== "" &&
    !isDateInPast(selectedDate) &&
    serviceIds.length > 0;
  const canConfirm = selectedQueueOption !== null || selectedQueue !== null;
  const displayQueue = selectedQueueOption ?? selectedQueue;
  const alreadyInQueueData = bookingConfirmation?.already_in_queue ? bookingConfirmation : null;

  // ——— Main booking flow: Date → Services (table) → Time slots → Fix Appointment ———
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

      {/* 3. Queue options — when date + services selected (from booking-preview API) */}
      {canProceedToSlots && (
        <section className="bp-section" aria-labelledby="bp-slots-title">
          <h2 id="bp-slots-title" className="bp-section-title">{t("selectTimeSlot")}</h2>
          <p className="bp-section-desc">
            Choose a queue · Position, wait time and appointment time shown below
          </p>

          {previewLoading ? (
            <div className="bp-loading">
              <div className="bp-spinner" aria-hidden />
              <p>Loading queue options…</p>
            </div>
          ) : previewError ? (
            <div className="bp-error" role="alert">
              <p>{previewError}</p>
              <Button text="Retry" color="outline-blue" onClick={fetchBookingPreview} />
            </div>
          ) : queueOptions.length === 0 ? (
            <div className="bp-empty">
              <p>{t("noSlotsAvailable")}</p>
              <p className="bp-empty-hint">Try another date or check back later.</p>
            </div>
          ) : (
            <div className="bp-slots-grid">
              {queueOptions.map((option) => (
                <button
                  key={option.queue_id}
                  type="button"
                  className={`bp-slot-card ${selectedQueueOption?.queue_id === option.queue_id ? "selected" : ""} ${!option.available ? "unavailable" : ""} ${option.is_recommended ? "recommended" : ""}`}
                  onClick={() => handleQueueOptionSelect(option)}
                  disabled={!option.available}
                  aria-pressed={selectedQueueOption?.queue_id === option.queue_id}
                >
                  <div className="bp-slot-header">
                    <h3 className="bp-slot-queue">{option.queue_name}</h3>
                    <span className={`bp-slot-status ${option.available ? "available" : "full"}`}>
                      {option.is_recommended ? "Recommended" : option.available ? "Available" : "Full"}
                    </span>
                  </div>
                  <div className="bp-slot-details">
                    <p className="bp-slot-row">
                      <span className="label">Position</span>
                      <span className="value">#{option.position}</span>
                    </p>
                    <p className="bp-slot-row">
                      <span className="label">Est. wait</span>
                      <span className="value">{option.estimated_wait_minutes} min</span>
                      {option.estimated_wait_range && (
                        <span className="value bp-slot-range"> ({option.estimated_wait_range})</span>
                      )}
                    </p>
                    <p className="bp-slot-row">
                      <span className="label">Expected at</span>
                      <span className="value">{option.estimated_appointment_time}</span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {wsConnectedState && !previewLoading && queueOptions.length > 0 && (
            <button type="button" className="bp-refresh" onClick={fetchBookingPreview}>
              ↻ Refresh estimates
            </button>
          )}
        </section>
      )}

      {/* 4. Summary & Fix Appointment */}
      {canConfirm && displayQueue && (
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
              {displayQueue.queue_name} · Wait ~{displayQueue.estimated_wait_minutes} min
              {selectedQueueOption?.estimated_wait_range && (
                <span className="bp-summary-range"> ({selectedQueueOption.estimated_wait_range})</span>
              )}
            </p>
            <p className="bp-summary-meta">
              Expected at: {displayQueue.estimated_appointment_time}
            </p>
          </div>
          <Button
            text={bookingInProgress ? t("confirming") : t("fixAppointment")}
            color="blue"
            size="lg"
            onClick={handleConfirm}
            disabled={bookingInProgress}
            loading={bookingInProgress}
            className="bp-cta"
          />
        </section>
      )}

      {error && (
        <div className="bp-error bp-error-inline" role="alert">
          <p>{error}</p>
        </div>
      )}

      {/* Already in queue popup */}
      {alreadyInQueueData && (
        <div
          className="bp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bp-already-in-queue-title"
          onClick={() => setBookingConfirmation(null)}
        >
          <div
            className="bp-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="bp-already-in-queue-title" className="bp-modal-title">
              {t("alreadyInQueueForToday")}
            </h2>
            <p className="bp-modal-subtitle">Your current queue details</p>
            <div className="bp-modal-details">
              <p className="bp-modal-row">
                <span className="bp-modal-label">Queue</span>
                <span className="bp-modal-value">{alreadyInQueueData.queue_name}</span>
              </p>
              <p className="bp-modal-row">
                <span className="bp-modal-label">Position</span>
                <span className="bp-modal-value">#{alreadyInQueueData.position}</span>
              </p>
              <p className="bp-modal-row">
                <span className="bp-modal-label">Est. wait</span>
                <span className="bp-modal-value">
                  {alreadyInQueueData.estimated_wait_minutes} min
                  {alreadyInQueueData.estimated_wait_range && (
                    <span className="bp-modal-range"> ({alreadyInQueueData.estimated_wait_range})</span>
                  )}
                </span>
              </p>
              <p className="bp-modal-row">
                <span className="bp-modal-label">Expected at</span>
                <span className="bp-modal-value">{alreadyInQueueData.estimated_appointment_time}</span>
              </p>
            </div>
            <div className="bp-modal-actions">
              <Button
                text={t("back")}
                color="outline-blue"
                onClick={() => setBookingConfirmation(null)}
              />
              <Button
                text={t("backToHome")}
                color="blue"
                onClick={() => {
                  setBookingConfirmation(null);
                  navigate("/");
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
