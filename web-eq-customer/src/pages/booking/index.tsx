import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBookingStore, type QueueOptionData, type QueueServiceInfo, type SlotData, type SlotsListResponse } from "../../store/booking.store";
import { useAuthStore } from "../../store/auth.store";
import { useQueueWebSocket } from "../../hooks/useQueueWebSocket";
import { BookingService } from "../../services/booking/booking.service";
import { BusinessService, type BusinessServiceData } from "../../services/business/business.service";
import { getNext7Days, getToday } from "../../utils/booking.utils";
import { isDateInPast, formatDateDisplay, formatDurationMinutes, formatTimeToDisplay } from "../../utils/util";
import { HttpStatus } from "../../utils/constants";
import { saveBookingReturnState, getBookingReturnState, clearBookingReturnState } from "../../utils/bookingReturnState";
import Button from "../../components/button";
import "./booking.scss";

export default function BookingPage() {
  const { t } = useTranslation();
  const { businessId } = useParams<{ businessId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const {
    initialSelectedServices,
    initialSelectedServicesData,
    initialBusinessName,
    rescheduleQueueUserId,
    rescheduleInitialDate,
  } = useMemo(() => {
    const fromLocation = {
      initialSelectedServices:     (location.state?.selectedServices     as string[])              || [],
      initialSelectedServicesData: (location.state?.selectedServicesData as BusinessServiceData[]) || [],
      initialBusinessName:         (location.state?.businessName         as string)                || "",
      rescheduleQueueUserId:       (location.state?.rescheduleQueueUserId as string | undefined)   || undefined,
      rescheduleInitialDate:       (location.state?.rescheduleInitialDate  as string | undefined)  || undefined,
    };
    if (
      fromLocation.initialSelectedServices.length > 0 ||
      fromLocation.initialSelectedServicesData.length > 0
    ) {
      return fromLocation;
    }
    const stored = getBookingReturnState();
    if (stored?.returnTo && (stored.selectedServices?.length > 0 || stored.selectedServicesData?.length > 0)) {
      return {
        initialSelectedServices:     stored.selectedServices                         || [],
        initialSelectedServicesData: (stored.selectedServicesData || [])             as BusinessServiceData[],
        initialBusinessName:         stored.businessName                             || "",
        rescheduleQueueUserId:       stored.rescheduleQueueUserId,
        rescheduleInitialDate:       stored.rescheduleInitialDate,
      };
    }
    return fromLocation;
  }, [location.state]);

  /** True when the page is being used to reschedule an existing appointment. */
  const isReschedule = !!rescheduleQueueUserId;

  // Persist reschedule context so that if a 401 redirects to send-otp, after login we can restore
  useEffect(() => {
    if (!businessId || !isReschedule || !rescheduleQueueUserId) return;
    saveBookingReturnState({
      returnTo:             `/business/${businessId}/book`,
      selectedServices:     initialSelectedServices,
      selectedServicesData: initialSelectedServicesData,
      businessName:         initialBusinessName,
      rescheduleQueueUserId,
      rescheduleInitialDate,
    });
  }, [businessId, isReschedule, rescheduleQueueUserId, initialBusinessName, rescheduleInitialDate, initialSelectedServices, initialSelectedServicesData]);

  // Clear stored booking state after restore, but keep it when in reschedule so 401 redirect can restore
  useEffect(() => {
    if (
      (initialSelectedServices.length > 0 || initialSelectedServicesData.length > 0) &&
      !isReschedule
    ) {
      clearBookingReturnState();
    }
  }, [initialSelectedServices.length, initialSelectedServicesData.length, isReschedule]);

  useEffect(() => {
    if (!isAuthenticated()) {
      const returnTo = `/business/${businessId}/book`;
      const state = {
        returnTo,
        selectedServices:     initialSelectedServices,
        selectedServicesData: initialSelectedServicesData,
        businessName:         initialBusinessName,
        rescheduleQueueUserId,
        rescheduleInitialDate,
      };
      saveBookingReturnState(state);
      navigate("/send-otp", { state, replace: true });
      return;
    }
  }, [isAuthenticated, businessId, navigate, initialSelectedServices, initialSelectedServicesData, initialBusinessName, rescheduleQueueUserId, rescheduleInitialDate]);

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
  const [selectedQueueServiceIds, setSelectedQueueServiceIds] = useState<string[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [appointmentMode, setAppointmentMode] = useState<"QUEUE" | "FIXED" | "APPROXIMATE">("QUEUE");
  const [selectedSlot, setSelectedSlot] = useState<SlotData | null>(null);
  const [timeSlots, setTimeSlots] = useState<SlotsListResponse | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);

  const { connected: wsConnectedState } = useQueueWebSocket({
    businessId: businessId || "",
    date: selectedDate || "",
    enabled: !!businessId && !!selectedDate,
  });

  const selectableDates = useMemo(() => getNext7Days(), []);

  useEffect(() => {
    if (!businessId) return;
    if (selectedDate != null) return;
    if (rescheduleInitialDate && !isDateInPast(rescheduleInitialDate)) {
      setSelectedDate(rescheduleInitialDate);
    } else {
      setSelectedDate(getToday());
    }
  }, [businessId, selectedDate, rescheduleInitialDate, setSelectedDate]);

  useEffect(() => {
    const loadServices = async () => {
      if (initialSelectedServicesData.length > 0) return;
      if (!businessId || initialSelectedServices.length === 0) return;
      try {
        setLoading(true);
        const businessService = new BusinessService();
        const allServices = await businessService.getBusinessServices(businessId);
        const selected = allServices.filter((s) =>
          s.variant_uuids?.length
            ? s.variant_uuids.some((uid) => initialSelectedServices.includes(uid))
            : initialSelectedServices.includes(s.uuid)
        );
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
    () =>
      selectedServices.flatMap((s) =>
        s.variant_uuids?.length ? s.variant_uuids : [s.uuid].filter(Boolean)
      ),
    [selectedServices]
  );

  // When a queue is selected, use the user's chosen queue_service_uuids (editable); else fall back to serviceIds.
  const resolvedServiceIds = useMemo(() => {
    if (selectedQueueOption && selectedQueueServiceIds.length > 0) {
      return selectedQueueServiceIds;
    }
    const queueSvcs = selectedQueueOption?.services;
    if (queueSvcs && queueSvcs.length > 0) {
      return queueSvcs.map((s: QueueServiceInfo) => s.queue_service_uuid);
    }
    return serviceIds;
  }, [selectedQueueOption, selectedQueueServiceIds, serviceIds]);

  // Map service_uuid -> resolved QueueServiceInfo for the selected queue.
  const resolvedByServiceUuid = useMemo<Record<string, QueueServiceInfo>>(() => {
    const queueSvcs = selectedQueueOption?.services;
    if (!queueSvcs || queueSvcs.length === 0) return {};
    return Object.fromEntries(queueSvcs.map((s: QueueServiceInfo) => [s.service_uuid, s]));
  }, [selectedQueueOption]);

  /** Services from the selected queue that are currently selected for booking (for display and totals). */
  const displayQueueServices = useMemo(() => {
    const option = selectedQueueOption;
    if (!option?.services?.length || selectedQueueServiceIds.length === 0) return [];
    const byId = new Set(selectedQueueServiceIds);
    return option.services.filter((s) => byId.has(s.queue_service_uuid));
  }, [selectedQueueOption, selectedQueueServiceIds]);

  /** Queue services not yet selected (for "Add service" list). */
  const availableToAddQueueServices = useMemo(() => {
    const option = selectedQueueOption;
    if (!option?.services?.length) return [];
    const selectedSet = new Set(selectedQueueServiceIds);
    return option.services.filter((s) => !selectedSet.has(s.queue_service_uuid));
  }, [selectedQueueOption, selectedQueueServiceIds]);

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

  const hasResolved = Object.keys(resolvedByServiceUuid).length > 0;
  const useQueueServicesForTotals = selectedQueueOption != null && displayQueueServices.length > 0;

  const totalPriceMin = useQueueServicesForTotals
    ? displayQueueServices.reduce((sum, s) => sum + (s.price ?? 0), 0)
    : hasResolved
    ? selectedServices.reduce((sum, s) => {
        const r = resolvedByServiceUuid[s.service_uuid];
        return sum + (r?.price ?? s.price_min ?? s.price ?? 0);
      }, 0)
    : selectedServices.reduce((sum, s) => sum + (s.price_min ?? s.price ?? 0), 0);

  const totalPriceMax = useQueueServicesForTotals
    ? totalPriceMin
    : hasResolved
    ? totalPriceMin
    : selectedServices.reduce((sum, s) => sum + (s.price_max ?? s.price ?? 0), 0);

  const totalPrice = totalPriceMin;
  const totalPriceRange = !useQueueServicesForTotals && !hasResolved && totalPriceMin !== totalPriceMax;

  const totalDuration = useQueueServicesForTotals
    ? displayQueueServices.reduce((sum, s) => sum + (s.duration ?? 0), 0)
    : hasResolved
    ? selectedServices.reduce((sum, s) => {
        const r = resolvedByServiceUuid[s.service_uuid];
        return sum + (r?.duration ?? s.duration_min ?? s.duration ?? 0);
      }, 0)
    : selectedServices.reduce(
        (sum, s) => sum + (s.duration_max ?? s.duration_min ?? s.duration ?? 0),
        0
      );

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
    setSelectedQueueServiceIds(option.services?.map((s) => s.queue_service_uuid) ?? []);
    setSelectedSlot(null);
    setTimeSlots(null);
    setSlotsError(null);
    const mode = option.booking_mode;
    if (mode === "FIXED") setAppointmentMode("FIXED");
    else if (mode === "APPROXIMATE") setAppointmentMode("APPROXIMATE");
    else setAppointmentMode("QUEUE");
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

  /** Whether the selected queue supports scheduled slots (FIXED / APPROXIMATE / HYBRID). */
  const queueSupportsScheduled = useMemo(() => {
    const mode = selectedQueueOption?.booking_mode;
    return mode === "FIXED" || mode === "APPROXIMATE" || mode === "HYBRID";
  }, [selectedQueueOption?.booking_mode]);

  /** Fetch time slots when queue + date + mode require it. */
  useEffect(() => {
    if (!selectedQueueOption || !selectedDate || !queueSupportsScheduled) return;
    if (appointmentMode !== "FIXED" && appointmentMode !== "APPROXIMATE") {
      setTimeSlots(null);
      setSelectedSlot(null);
      return;
    }
    let cancelled = false;
    const bookingService = new BookingService();
    setSlotsLoading(true);
    setSlotsError(null);
    bookingService
      .getQueueSlots(selectedQueueOption.queue_id, selectedDate)
      .then((res) => {
        if (!cancelled) {
          setTimeSlots(res);
          setSlotsError(null);
        }
      })
      .catch((err: any) => {
        if (!cancelled) {
          setSlotsError(err.response?.data?.detail || "Failed to load time slots.");
          setTimeSlots(null);
        }
      })
      .finally(() => {
        if (!cancelled) setSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedQueueOption?.queue_id, selectedDate, appointmentMode, queueSupportsScheduled]);

  const removeQueueService = (queueServiceUuid: string) => {
    setSelectedQueueServiceIds((prev) => {
      const next = prev.filter((id) => id !== queueServiceUuid);
      return next.length >= 1 ? next : prev;
    });
  };

  const addQueueService = (queueServiceUuid: string) => {
    if (selectedQueueServiceIds.includes(queueServiceUuid)) return;
    setSelectedQueueServiceIds((prev) => [...prev, queueServiceUuid]);
  };

  const handleConfirm = async () => {
    if (!businessId || !selectedDate) return;
    const queueId = selectedQueueOption?.queue_id ?? selectedQueue?.queue_id;
    if (!queueId) {
      setError("Please select a queue.");
      return;
    }
    if (selectedQueueOption && selectedQueueServiceIds.length === 0) {
      setError("Please select at least one service for this queue.");
      return;
    }
    if ((appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && !selectedSlot) {
      setError("Please select a time slot.");
      return;
    }
    if (isDateInPast(selectedDate)) {
      setError("Please select today or a future date.");
      return;
    }

    const finalServiceIds =
      resolvedServiceIds.length > 0
        ? resolvedServiceIds
        : serviceIds.length > 0
        ? serviceIds
        : initialSelectedServices;

    setBookingInProgress(true);
    setError(null);
    setBookingConfirmation(null);

    try {
      const bookingService = new BookingService();

      // ── Reschedule mode: update existing appointment ──────────────────────
      if (isReschedule && rescheduleQueueUserId) {
        await bookingService.rescheduleAppointment(rescheduleQueueUserId, {
          queue_id:    queueId,
          queue_date:  selectedDate,
          service_ids: finalServiceIds,
        });
        alert(t("appointmentRescheduled", { defaultValue: "Appointment rescheduled!" }));
        navigate("/profile?tab=appointments");
        return;
      }

      // ── New booking mode ──────────────────────────────────────────────────
      const result = await bookingService.createBooking({
        business_id: businessId,
        queue_id:    queueId,
        queue_date:  selectedDate,
        service_ids: finalServiceIds,
        ...((appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && selectedSlot?.uuid
          ? { appointment_type: appointmentMode, slot_id: selectedSlot.uuid }
          : {}),
      });
      if (result.already_in_queue) {
        setBookingConfirmation(result);
        return;
      }
      alert(t("bookingConfirmed"));
      navigate("/");
    } catch (err: any) {
      console.error(isReschedule ? "Reschedule failed:" : "Booking failed:", err);
      const errorMsg =
        err.response?.data?.detail ||
        (isReschedule ? "Reschedule failed. Please try again." : "Booking failed. Please try again.");
      setError(errorMsg);
      if (err.response?.status === HttpStatus.UNAUTHORIZED) {
        alert(t("pleaseLogin"));
        navigate("/send-otp", {
          state: {
            returnTo:             `/business/${businessId}/book`,
            selectedServices:     initialSelectedServices,
            selectedServicesData: initialSelectedServicesData,
            businessName:         initialBusinessName,
            rescheduleQueueUserId,
            rescheduleInitialDate,
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
  const needsSlot = (appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && queueSupportsScheduled;
  const canConfirm =
    (selectedQueueOption !== null || selectedQueue !== null) &&
    (!needsSlot || (needsSlot && selectedSlot !== null));
  const displayQueue = selectedQueueOption ?? selectedQueue;
  const alreadyInQueueData = bookingConfirmation?.already_in_queue ? bookingConfirmation : null;

  // ——— Main booking flow: Date → Services (table) → Time slots → Fix Appointment ———
  return (
    <div className="booking-page">
      <header className="bp-header">
        <h1 className="bp-title">
          {isReschedule ? "Reschedule Appointment" : "Book Appointment"}
        </h1>
        {initialBusinessName && <p className="bp-business-name">{initialBusinessName}</p>}
        {isReschedule && (
          <p className="bp-reschedule-hint">
            Choose a new date, queue, or both — your appointment will be updated.
          </p>
        )}
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

      {/* 2. Selected services — table (or queue-filtered editable list when queue chosen) + total */}
      <section className="bp-section" aria-labelledby="bp-services-title">
        <h2 id="bp-services-title" className="bp-section-title">{t("selectedServices")}</h2>
        {loading && selectedServices.length === 0 ? (
          <div className="bp-loading">
            <div className="bp-spinner" aria-hidden />
            <p>{t("loading")}</p>
          </div>
        ) : selectedServices.length === 0 && !selectedQueueOption ? (
          <div className="bp-empty">
            <p>{t("noServicesSelected")}</p>
            <Button
              text="Back to business"
              color="outline-blue"
              onClick={() => navigate(`/business/${businessId}`)}
            />
          </div>
        ) : selectedQueueOption ? (
          <div className="bp-services-wrap">
            <p className="bp-services-queue-hint">
              Services for <strong>{selectedQueueOption.queue_name}</strong> · You can remove or add services below.
            </p>
            <table className="bp-services-table">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Duration</th>
                  <th scope="col" className="bp-th-price">Price</th>
                  <th scope="col" className="bp-th-action" aria-label="Remove" />
                </tr>
              </thead>
              <tbody>
                {displayQueueServices.map((s) => (
                  <tr key={s.queue_service_uuid}>
                    <td className="bp-td-service">{s.service_name}</td>
                    <td className="bp-td-duration">{formatDurationMinutes(s.duration ?? 0)}</td>
                    <td className="bp-td-price">₹{s.price ?? 0}</td>
                    <td className="bp-td-action">
                      <button
                        type="button"
                        className="bp-service-remove"
                        onClick={() => removeQueueService(s.queue_service_uuid)}
                        disabled={displayQueueServices.length <= 1}
                        title={displayQueueServices.length <= 1 ? "At least one service required" : "Remove service"}
                        aria-label={`Remove ${s.service_name}`}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {availableToAddQueueServices.length > 0 && (
              <div className="bp-services-add">
                <span className="bp-services-add-label">Add service:</span>
                <div className="bp-services-add-btns">
                  {availableToAddQueueServices.map((s) => (
                    <button
                      key={s.queue_service_uuid}
                      type="button"
                      className="bp-service-add-btn"
                      onClick={() => addQueueService(s.queue_service_uuid)}
                    >
                      + {s.service_name} (₹{s.price ?? 0})
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="bp-services-total">
              <span className="bp-services-total-label">Total</span>
              <span className="bp-services-total-duration">{formatDurationMinutes(totalDuration)}</span>
              <span className="bp-services-total-amount">₹{totalPrice}</span>
            </div>
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
                {selectedServices.map((service) => {
                  const resolved = resolvedByServiceUuid[service.service_uuid];
                  let durationStr: string;
                  let priceStr: string;
                  if (resolved) {
                    durationStr = formatDurationMinutes(resolved.duration ?? 0);
                    priceStr = `₹${resolved.price ?? 0}`;
                  } else {
                    const hasDurationRange =
                      service.duration_min != null &&
                      service.duration_max != null &&
                      service.duration_min !== service.duration_max;
                    const hasPriceRange =
                      service.price_min != null &&
                      service.price_max != null &&
                      service.price_min !== service.price_max;
                    durationStr = hasDurationRange
                      ? `${formatDurationMinutes(service.duration_min ?? 0)} – ${formatDurationMinutes(service.duration_max ?? 0)}`
                      : formatDurationMinutes(service.duration ?? service.duration_min ?? service.duration_max ?? 0);
                    priceStr = hasPriceRange
                      ? `₹${service.price_min} – ₹${service.price_max}`
                      : `₹${service.price ?? service.price_min ?? service.price_max ?? 0}`;
                  }
                  return (
                    <tr key={service.uuid}>
                      <td className="bp-td-service">{service.name}</td>
                      <td className="bp-td-duration">{durationStr}</td>
                      <td className="bp-td-price">{priceStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="bp-services-total">
              <span className="bp-services-total-label">Total</span>
              <span className="bp-services-total-duration">{formatDurationMinutes(totalDuration)}</span>
              <span className="bp-services-total-amount">
                {totalPriceRange ? `₹${totalPriceMin} – ₹${totalPriceMax}` : `₹${totalPrice}`}
              </span>
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
                    <span className={`bp-slot-status ${option.available ? "available" : option.unavailability_reason === "employee_not_available" ? "not-available" : "full"}`}>
                      {option.is_recommended
                        ? "Recommended"
                        : option.available
                        ? "Available"
                        : option.unavailability_reason === "employee_not_available"
                        ? t("employeeNotAvailable")
                        : "Full"}
                    </span>
                  </div>
                  {option.unavailability_reason === "employee_not_available" ? (
                    <div className="bp-slot-unavailable-msg">
                      <p>{t("employeeNotAvailableOnDay")}</p>
                    </div>
                  ) : (
                    <div className="bp-slot-details">
                      <p className="bp-slot-row">
                        <span className="label">Position</span>
                        <span className="value">#{option.position}</span>
                      </p>
                      <p className="bp-slot-row">
                        <span className="label">Est. wait</span>
                        <span className="value">{formatDurationMinutes(option.estimated_wait_minutes)}</span>
                        {option.estimated_wait_range && (
                          <span className="value bp-slot-range"> ({option.estimated_wait_range})</span>
                        )}
                      </p>
                      <p className="bp-slot-row">
                        <span className="label">Expected at</span>
                        <span className="value">{formatTimeToDisplay(option.estimated_appointment_time)}</span>
                      </p>
                    </div>
                  )}
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

      {/* 3b. Appointment mode (Walk-in / Fixed / Approximate) when queue supports scheduled slots */}
      {selectedQueueOption && queueSupportsScheduled && (
        <section className="bp-section" aria-labelledby="bp-mode-title">
          <h2 id="bp-mode-title" className="bp-section-title">Appointment type</h2>
          <p className="bp-section-desc">Choose how you want to be scheduled</p>
          <div className="bp-mode-options" role="group" aria-label="Appointment type">
            {(selectedQueueOption.booking_mode === "HYBRID" || selectedQueueOption.booking_mode === "QUEUE") && (
              <button
                type="button"
                className={`bp-mode-btn ${appointmentMode === "QUEUE" ? "selected" : ""}`}
                onClick={() => {
                  setAppointmentMode("QUEUE");
                  setSelectedSlot(null);
                  setSlotPickerOpen(false);
                }}
                aria-pressed={appointmentMode === "QUEUE"}
              >
                <span className="bp-mode-icon">🚶</span> Walk-in
              </button>
            )}
            {(selectedQueueOption.booking_mode === "FIXED" || selectedQueueOption.booking_mode === "HYBRID") && (
              <button
                type="button"
                className={`bp-mode-btn ${appointmentMode === "FIXED" ? "selected" : ""}`}
                onClick={() => {
                  setAppointmentMode("FIXED");
                  setSelectedSlot(null);
                  setSlotPickerOpen(true);
                }}
                aria-pressed={appointmentMode === "FIXED"}
              >
                <span className="bp-mode-icon">📌</span> Fixed time
              </button>
            )}
            {(selectedQueueOption.booking_mode === "APPROXIMATE" || selectedQueueOption.booking_mode === "HYBRID") && (
              <button
                type="button"
                className={`bp-mode-btn ${appointmentMode === "APPROXIMATE" ? "selected" : ""}`}
                onClick={() => {
                  setAppointmentMode("APPROXIMATE");
                  setSelectedSlot(null);
                  setSlotPickerOpen(true);
                }}
                aria-pressed={appointmentMode === "APPROXIMATE"}
              >
                <span className="bp-mode-icon">⏰</span> Approximate time
              </button>
            )}
          </div>

          {/* Selected slot chip or "Choose slot" prompt */}
          {(appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && (
            <div className="bp-slot-trigger-row">
              {selectedSlot ? (
                <div className="bp-selected-slot-chip">
                  <span className="bp-selected-slot-chip__label">
                    {appointmentMode === "FIXED" ? "Fixed" : "Approx"}&nbsp;
                    Starts at {formatTimeToDisplay(selectedSlot.slot_start)} · {formatDurationMinutes(totalDuration)}
                  </span>
                  <button
                    type="button"
                    className="bp-selected-slot-chip__change"
                    onClick={() => setSlotPickerOpen(true)}
                    aria-label="Change time slot"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="bp-choose-slot-btn"
                  onClick={() => setSlotPickerOpen(true)}
                >
                  {slotsLoading ? "Loading slots…" : "Choose a time slot →"}
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {/* 3c. Slot picker popup */}
      {slotPickerOpen && (appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && (
        <div
          className="bp-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="bp-slot-picker-title"
          onClick={(e) => { if (e.target === e.currentTarget) setSlotPickerOpen(false); }}
        >
          <div className="bp-slot-picker-modal">
            <div className="bp-slot-picker-header">
              <div>
                <h2 id="bp-slot-picker-title" className="bp-modal-title">
                  {appointmentMode === "FIXED" ? "Fixed time slot" : "Approximate time slot"}
                </h2>
                <p className="bp-modal-subtitle">
                  {selectedQueueOption?.queue_name} · {selectedDate ? formatDateDisplay(selectedDate) : ""}
                </p>
                <p className="bp-slot-picker-duration-hint">
                  Your appointment will take about {formatDurationMinutes(totalDuration)}.
                </p>
              </div>
              <button
                type="button"
                className="bp-slot-picker-close"
                onClick={() => setSlotPickerOpen(false)}
                aria-label="Close slot picker"
              >
                ✕
              </button>
            </div>

            <div className="bp-slot-picker-body">
              {slotsLoading ? (
                <div className="bp-loading">
                  <div className="bp-spinner" aria-hidden />
                  <p>Loading available slots…</p>
                </div>
              ) : slotsError ? (
                <div className="bp-error" role="alert">
                  <p>{slotsError}</p>
                  <button
                    type="button"
                    className="bp-slot-retry-btn"
                    onClick={() => {
                      setSlotsError(null);
                      setSlotsLoading(true);
                      const bookingService = new BookingService();
                      bookingService
                        .getQueueSlots(selectedQueueOption!.queue_id, selectedDate!)
                        .then((res) => { setTimeSlots(res); setSlotsLoading(false); })
                        .catch((err: any) => {
                          setSlotsError(err.response?.data?.detail || "Failed to load time slots.");
                          setSlotsLoading(false);
                        });
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : !timeSlots?.slots?.length ? (
                <div className="bp-slot-picker-empty">
                  <span className="bp-slot-picker-empty__icon">📅</span>
                  <p className="bp-slot-picker-empty__title">No available slots</p>
                  <p className="bp-slot-picker-empty__hint">
                    {selectedDate === getToday()
                      ? "All slots for today have passed. Try booking for tomorrow."
                      : "No slots available for this date. Try another date."}
                  </p>
                </div>
              ) : (
                <div className="bp-slot-picker-grid" role="group" aria-label="Available time slots">
                  {timeSlots.slots
                    .filter((s) => s.available)
                    .map((slot) => (
                      <button
                        key={slot.uuid}
                        type="button"
                        className={`bp-slot-picker-item ${selectedSlot?.uuid === slot.uuid ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setSlotPickerOpen(false);
                        }}
                        aria-pressed={selectedSlot?.uuid === slot.uuid}
                      >
                        <span className="bp-slot-picker-item__start">{formatTimeToDisplay(slot.slot_start)}</span>
                        <span className="bp-slot-picker-item__dash">–</span>
                        <span className="bp-slot-picker-item__end">{formatTimeToDisplay(slot.slot_end)}</span>
                        {slot.remaining > 0 && slot.remaining <= 3 && (slot.capacity ?? 0) > 1 && (
                          <span className="bp-slot-picker-item__scarcity">{slot.remaining} left</span>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. Summary & Fix Appointment */}
      {canConfirm && displayQueue && (
        <section className="bp-section bp-section-summary">
          <div className="bp-summary-card">
            <div className="bp-summary-row">
              <span className="bp-summary-label">Total amount</span>
              <span className="bp-summary-amount">
                {totalPriceRange ? `₹${totalPriceMin} – ₹${totalPriceMax}` : `₹${totalPrice}`}
              </span>
            </div>
            <p className="bp-summary-meta">
              {selectedServices.length} {selectedServices.length === 1 ? t("service") : t("services")} · {selectedDate ? formatDateDisplay(selectedDate) : ""}
            </p>
            <p className="bp-summary-queue">
              {displayQueue.queue_name}
              {selectedSlot
                ? ` · ${appointmentMode === "FIXED" ? "Fixed" : "Approx"} starts ${formatTimeToDisplay(selectedSlot.slot_start)} · ${formatDurationMinutes(totalDuration)}`
                : ` · Wait ~${formatDurationMinutes(displayQueue.estimated_wait_minutes)}`
              }
              {!selectedSlot && selectedQueueOption?.estimated_wait_range && (
                <span className="bp-summary-range"> ({selectedQueueOption.estimated_wait_range})</span>
              )}
            </p>
            <p className="bp-summary-meta">
              {selectedSlot
                ? `Starts at ${formatTimeToDisplay(selectedSlot.slot_start)} · ${formatDurationMinutes(totalDuration)}`
                : `Expected at: ${formatTimeToDisplay(displayQueue.estimated_appointment_time)}`
              }
            </p>
          </div>
          <Button
            text={
              bookingInProgress
                ? t("confirming")
                : isReschedule
                ? t("confirmReschedule", { defaultValue: "Confirm Reschedule" })
                : t("fixAppointment")
            }
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
                  {formatDurationMinutes(alreadyInQueueData.estimated_wait_minutes)}
                  {alreadyInQueueData.estimated_wait_range && (
                    <span className="bp-modal-range"> ({alreadyInQueueData.estimated_wait_range})</span>
                  )}
                </span>
              </p>
              <p className="bp-modal-row">
                <span className="bp-modal-label">Expected at</span>
                <span className="bp-modal-value">{formatTimeToDisplay(alreadyInQueueData.estimated_appointment_time)}</span>
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
