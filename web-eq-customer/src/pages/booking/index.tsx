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
      initialSelectedServices: (location.state?.selectedServices as string[]) || [],
      initialSelectedServicesData: (location.state?.selectedServicesData as BusinessServiceData[]) || [],
      initialBusinessName: (location.state?.businessName as string) || "",
      rescheduleQueueUserId: (location.state?.rescheduleQueueUserId as string | undefined) || undefined,
      rescheduleInitialDate: (location.state?.rescheduleInitialDate as string | undefined) || undefined,
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
        initialSelectedServices: stored.selectedServices || [],
        initialSelectedServicesData: (stored.selectedServicesData || []) as BusinessServiceData[],
        initialBusinessName: stored.businessName || "",
        rescheduleQueueUserId: stored.rescheduleQueueUserId,
        rescheduleInitialDate: stored.rescheduleInitialDate,
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
      returnTo: `/business/${businessId}/book`,
      selectedServices: initialSelectedServices,
      selectedServicesData: initialSelectedServicesData,
      businessName: initialBusinessName,
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
        selectedServices: initialSelectedServices,
        selectedServicesData: initialSelectedServicesData,
        businessName: initialBusinessName,
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
        setError(t("bk.failedLoadService"));
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
        err.response?.data?.detail || t("bk.failedLoadQueue");
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
          setSlotsError(err.response?.data?.detail || t("bk.failedLoadSlots"));
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
      setError(t("bk.selectQueue"));
      return;
    }
    if (selectedQueueOption && selectedQueueServiceIds.length === 0) {
      setError(t("bk.selectService"));
      return;
    }
    if ((appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && !selectedSlot) {
      setError(t("bk.selectSlot"));
      return;
    }
    if (isDateInPast(selectedDate)) {
      setError(t("bk.selectFutureDate"));
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
          queue_id: queueId,
          queue_date: selectedDate,
          service_ids: finalServiceIds,
        });
        alert(t("bk.rescheduled"));
        navigate("/profile?tab=appointments");
        return;
      }

      // ── New booking mode ──────────────────────────────────────────────────
      const result = await bookingService.createBooking({
        business_id: businessId,
        queue_id: queueId,
        queue_date: selectedDate,
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
        (isReschedule ? t("bk.rescheduleFailed") : t("bookingFailed"));
      setError(errorMsg);
      if (err.response?.status === HttpStatus.UNAUTHORIZED) {
        alert(t("pleaseLogin"));
        navigate("/send-otp", {
          state: {
            returnTo: `/business/${businessId}/book`,
            selectedServices: initialSelectedServices,
            selectedServicesData: initialSelectedServicesData,
            businessName: initialBusinessName,
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

  // ——— Main booking flow ———
  return (
    <div className="bk-page">

      {/* ── Left panel ─────────────────────────────────────────────────── */}
      <div className="bk-left">

        {/* Step progress */}
        <div className="bk-steps">
          <div className="bk-step bk-step--done">
            <div className="bk-step-num">✓</div>
            <div className="bk-step-label">{t("bk.stepServices")}</div>
          </div>
          <div className="bk-step-connector" />
          <div className="bk-step bk-step--active">
            <div className="bk-step-num">2</div>
            <div className="bk-step-label">{t("bk.stepDateSlot")}</div>
          </div>
          <div className="bk-step-connector" />
          <div className="bk-step">
            <div className="bk-step-num">3</div>
            <div className="bk-step-label">{t("bk.stepConfirm")}</div>
          </div>
          <div className="bk-step-connector" />
          <div className="bk-step">
            <div className="bk-step-num">4</div>
            <div className="bk-step-label">{t("bk.stepDone")}</div>
          </div>
        </div>

        {/* Header */}
        <header className="bk-header">
          <button className="bk-back" onClick={() => navigate(`/business/${businessId}`)}>
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="m15 18-6-6 6-6" /></svg>
            {t("bk.backTo", { name: initialBusinessName || t("bk.book") })}
          </button>
          <h1 className="bk-title">
            {isReschedule ? t("bk.reschedule") : t("bk.book")} <em>{t("bk.appointment")}</em>
          </h1>
          <div className="bk-biz-row">
            {initialBusinessName && <span className="bk-biz-name">{initialBusinessName}</span>}
            {selectedDate && (
              <div className={`bk-live-badge${wsConnectedState ? "" : " bk-live-badge--off"}`}>
                <span className="bk-live-dot" aria-hidden />
                {wsConnectedState ? t("bk.liveQueueUpdates") : t("connecting")}
              </div>
            )}
          </div>
          {isReschedule && (
            <p className="bk-reschedule-hint">{t("bk.rescheduleHint")}</p>
          )}
        </header>

        {/* ── Section 1: Date ─────────────────────────────────────────── */}
        <section className="bk-section">
          <div className="bk-section-head">
            <div>
              <div className="bk-section-title"><span className="bk-section-num">1</span> {t("selectDate")}</div>
              <div className="bk-section-sub">{t("bk.selectDateSub")}</div>
            </div>
          </div>
          <div className="bk-date-strip" role="group" aria-label="Select date">
            {selectableDates.map((date) => {
              const disabled = isDateInPast(date);
              const d = new Date(date + "T00:00:00");
              const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
              const monNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const isToday = date === getToday();
              return (
                <button
                  key={date}
                  type="button"
                  className={`bk-date-btn${selectedDate === date ? " bk-date-btn--active" : ""}${disabled ? " bk-date-btn--unavailable" : ""}`}
                  onClick={() => handleDateSelect(date)}
                  disabled={disabled}
                  aria-pressed={selectedDate === date}
                >
                  {isToday && <span className="bk-date-now-tag">{t("bk.now")}</span>}
                  <span className="bk-date-day">{isToday ? t("today") : dayNames[d.getDay()]}</span>
                  <span className="bk-date-num">{d.getDate()}</span>
                  <span className="bk-date-mon">{monNames[d.getMonth()]}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Section 2: Services ──────────────────────────────────────── */}
        <section className="bk-section">
          <div className="bk-section-head">
            <div>
              <div className="bk-section-title"><span className="bk-section-num">2</span> {t("selectedServices")}</div>
              <div className="bk-section-sub">{t("bk.servicesSub")}</div>
            </div>
          </div>

          {loading && selectedServices.length === 0 ? (
            <div className="bk-loading"><div className="bk-spinner" aria-hidden /><p>{t("loading")}</p></div>
          ) : selectedServices.length === 0 && !selectedQueueOption ? (
            <div className="bk-empty">
              <p>{t("noServicesSelected")}</p>
              <button className="bk-outline-btn" onClick={() => navigate(`/business/${businessId}`)}>{t("bk.backToBusiness")}</button>
            </div>
          ) : (
            <div className="bk-services-table">
              <div className="bk-st-head">
                <div className="bk-st-hcell">{t("bk.thService")}</div>
                <div className="bk-st-hcell bk-st-hcell--right">{t("bk.thDuration")}</div>
                <div className="bk-st-hcell bk-st-hcell--right">{t("bk.thPrice")}</div>
              </div>

              {selectedQueueOption ? (
                <>
                  {displayQueueServices.map((s) => (
                    <div key={s.queue_service_uuid} className="bk-st-row">
                      <div className="bk-st-name">
                        {s.service_name}
                        <button type="button" className="bk-remove-svc" onClick={() => removeQueueService(s.queue_service_uuid)} disabled={displayQueueServices.length <= 1} aria-label={`Remove ${s.service_name}`}>×</button>
                      </div>
                      <div className="bk-st-duration">
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {formatDurationMinutes(s.duration ?? 0)}
                      </div>
                      <div className="bk-st-price">₹{s.price ?? 0}</div>
                    </div>
                  ))}
                  {availableToAddQueueServices.length > 0 && (
                    <div className="bk-st-add-row">
                      <span className="bk-st-add-label">{t("bk.addService")}</span>
                      <div className="bk-st-add-btns">
                        {availableToAddQueueServices.map((s) => (
                          <button key={s.queue_service_uuid} type="button" className="bk-service-add-btn" onClick={() => addQueueService(s.queue_service_uuid)}>
                            + {s.service_name} (₹{s.price ?? 0})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                selectedServices.map((service) => {
                  const resolved = resolvedByServiceUuid[service.service_uuid];
                  let durationStr: string;
                  let priceStr: string;
                  if (resolved) {
                    durationStr = formatDurationMinutes(resolved.duration ?? 0);
                    priceStr = `₹${resolved.price ?? 0}`;
                  } else {
                    const hasDurRange = service.duration_min != null && service.duration_max != null && service.duration_min !== service.duration_max;
                    const hasPrRange = service.price_min != null && service.price_max != null && service.price_min !== service.price_max;
                    durationStr = hasDurRange
                      ? `${formatDurationMinutes(service.duration_min ?? 0)} – ${formatDurationMinutes(service.duration_max ?? 0)}`
                      : formatDurationMinutes(service.duration ?? service.duration_min ?? service.duration_max ?? 0);
                    priceStr = hasPrRange ? `₹${service.price_min} – ₹${service.price_max}` : `₹${service.price ?? service.price_min ?? service.price_max ?? 0}`;
                  }
                  return (
                    <div key={service.uuid} className="bk-st-row">
                      <div className="bk-st-name">{service.name}</div>
                      <div className="bk-st-duration">
                        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        {durationStr}
                      </div>
                      <div className="bk-st-price">{priceStr}</div>
                    </div>
                  );
                })
              )}

              {/* Total row */}
              <div className="bk-st-row bk-st-row--total">
                <div className="bk-st-name bk-st-name--total">{t("bk.total")}</div>
                <div className="bk-st-duration">
                  <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  {formatDurationMinutes(totalDuration)}
                </div>
                <div className="bk-st-price bk-st-price--total">
                  {totalPriceRange ? `₹${totalPriceMin} – ₹${totalPriceMax}` : `₹${totalPrice}`}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── Section 3: Queue selection ───────────────────────────────── */}
        {canProceedToSlots && (
          <section className="bk-section">
            <div className="bk-section-head">
              <div>
                <div className="bk-section-title"><span className="bk-section-num">3</span> {t("selectTimeSlot")}</div>
                <div className="bk-section-sub">{t("bk.queueSub")}</div>
              </div>
              {wsConnectedState && !previewLoading && <div className="bk-updated-tag">{t("bk.updatedNow")}</div>}
            </div>

            {previewLoading ? (
              <div className="bk-loading"><div className="bk-spinner" aria-hidden /><p>{t("bk.loadingQueue")}</p></div>
            ) : previewError ? (
              <div className="bk-error" role="alert">
                <p>{previewError}</p>
                <button className="bk-outline-btn" onClick={fetchBookingPreview}>{t("bk.retry")}</button>
              </div>
            ) : queueOptions.length === 0 ? (
              <div className="bk-empty"><p>{t("noSlotsAvailable")}</p><p>{t("bk.tryAnotherDate")}</p></div>
            ) : (
              <div className="bk-queue-grid">
                {queueOptions.map((option) => {
                  const isSelected = selectedQueueOption?.queue_id === option.queue_id;
                  const isFull = !option.available;
                  const tagClass = isFull ? "bk-tag--full" : option.is_recommended ? "bk-tag--available" : option.position <= 2 ? "bk-tag--limited" : "bk-tag--available";
                  const tagLabel = isFull ? t("bk.tagFull") : option.unavailability_reason === "employee_not_available" ? t("bk.tagNA") : option.is_recommended ? t("bk.tagRecommended") : t("bk.tagAvailable");
                  return (
                    <div
                      key={option.queue_id}
                      className={`bk-queue-card${isSelected ? " bk-queue-card--selected" : ""}${isFull ? " bk-queue-card--full" : ""}`}
                      onClick={() => !isFull && handleQueueOptionSelect(option)}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isFull ? -1 : 0}
                      onKeyDown={(e) => e.key === "Enter" && !isFull && handleQueueOptionSelect(option)}
                    >
                      <div className="bk-queue-head">
                        <div className="bk-queue-name">{option.queue_name}</div>
                        <div className={`bk-queue-tag ${tagClass}`}>{tagLabel}</div>
                      </div>
                      {option.unavailability_reason === "employee_not_available" ? (
                        <p className="bk-queue-unavail">{t("employeeNotAvailableOnDay")}</p>
                      ) : (
                        <div className="bk-queue-stats">
                          <div className="bk-q-stat">
                            <div className="bk-q-stat-label">{t("bk.statPosition")}</div>
                            <div className="bk-q-stat-value">#{option.position}</div>
                            <div className="bk-q-stat-sub">{option.position === 1 ? t("bk.nextInLine") : t("bk.ahead", { n: option.position })}</div>
                          </div>
                          <div className="bk-q-stat">
                            <div className="bk-q-stat-label">{t("bk.statEstWait")}</div>
                            <div className="bk-q-stat-value">{formatDurationMinutes(option.estimated_wait_minutes)}</div>
                            {option.estimated_wait_range && <div className="bk-q-stat-sub">{option.estimated_wait_range}</div>}
                          </div>
                          <div className="bk-q-stat bk-q-stat--full">
                            <div className="bk-q-stat-label">{t("bk.statExpectedAt")}</div>
                            <div className="bk-q-stat-value bk-q-stat-value--time">{formatTimeToDisplay(option.estimated_appointment_time)}</div>
                          </div>
                        </div>
                      )}
                      {isSelected && <div className="bk-queue-check" aria-hidden>✓</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {wsConnectedState && !previewLoading && queueOptions.length > 0 && (
              <div className="bk-refresh-row">
                <button type="button" className="bk-refresh-btn" onClick={fetchBookingPreview}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                  {t("bk.refreshEstimates")}
                </button>
              </div>
            )}
          </section>
        )}

        {/* ── Appointment mode (FIXED / APPROXIMATE / HYBRID) ──────────── */}
        {selectedQueueOption && queueSupportsScheduled && (
          <section className="bk-section">
            <div className="bk-section-head">
              <div>
                <div className="bk-section-title"><span className="bk-section-num">4</span> {t("bk.apptType")}</div>
                <div className="bk-section-sub">{t("bk.apptTypeSub")}</div>
              </div>
            </div>
            <div className="bk-mode-options" role="group" aria-label="Appointment type">
              {(selectedQueueOption.booking_mode === "HYBRID" || selectedQueueOption.booking_mode === "QUEUE") && (
                <button type="button" className={`bk-mode-btn${appointmentMode === "QUEUE" ? " bk-mode-btn--selected" : ""}`} onClick={() => { setAppointmentMode("QUEUE"); setSelectedSlot(null); setSlotPickerOpen(false); }} aria-pressed={appointmentMode === "QUEUE"}>
                  <span>🚶</span> {t("bk.walkin")}
                </button>
              )}
              {(selectedQueueOption.booking_mode === "FIXED" || selectedQueueOption.booking_mode === "HYBRID") && (
                <button type="button" className={`bk-mode-btn${appointmentMode === "FIXED" ? " bk-mode-btn--selected" : ""}`} onClick={() => { setAppointmentMode("FIXED"); setSelectedSlot(null); setSlotPickerOpen(true); }} aria-pressed={appointmentMode === "FIXED"}>
                  <span>📌</span> {t("bk.fixedTime")}
                </button>
              )}
              {(selectedQueueOption.booking_mode === "APPROXIMATE" || selectedQueueOption.booking_mode === "HYBRID") && (
                <button type="button" className={`bk-mode-btn${appointmentMode === "APPROXIMATE" ? " bk-mode-btn--selected" : ""}`} onClick={() => { setAppointmentMode("APPROXIMATE"); setSelectedSlot(null); setSlotPickerOpen(true); }} aria-pressed={appointmentMode === "APPROXIMATE"}>
                  <span>⏰</span> {t("bk.approxTime")}
                </button>
              )}
            </div>
            {(appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && (
              <div className="bk-slot-trigger-row">
                {selectedSlot ? (
                  <div className="bk-selected-slot-chip">
                    <span className="bk-selected-slot-chip__label">
                      {appointmentMode === "FIXED" ? t("bk.fixedChip") : t("bk.approxChip")} · {t("bk.startsAt", { time: formatTimeToDisplay(selectedSlot.slot_start) })} · {formatDurationMinutes(totalDuration)}
                    </span>
                    <button type="button" className="bk-selected-slot-chip__change" onClick={() => setSlotPickerOpen(true)}>{t("bk.change")}</button>
                  </div>
                ) : (
                  <button type="button" className="bk-choose-slot-btn" onClick={() => setSlotPickerOpen(true)}>
                    {slotsLoading ? t("bk.loadingSlots") : t("bk.chooseSlot")}
                  </button>
                )}
              </div>
            )}
          </section>
        )}

        {/* Error */}
        {error && (
          <div className="bk-error" role="alert"><p>{error}</p></div>
        )}

      </div>{/* /bk-left */}

      {/* ── Right panel ─────────────────────────────────────────────────── */}
      <div className="bk-right">
        <div className="bk-summary-title">{t("bk.summary")}</div>

        {/* Biz strip */}
        <div className="bk-biz-strip">
          <div className="bk-biz-strip-avatar">{(initialBusinessName || "B").charAt(0).toUpperCase()}</div>
          <div>
            <div className="bk-biz-strip-name">{initialBusinessName || "Business"}</div>
            {wsConnectedState && (
              <div className="bk-biz-strip-meta">
                <span className="bk-live-dot bk-live-dot--sm" />
                {t("bk.liveActive")}
              </div>
            )}
          </div>
        </div>

        {/* Summary rows */}
        <div className="bk-summary-card">
          <div className="bk-sc-row">
            <div className="bk-sc-label">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {t("bk.labelDate")}
            </div>
            <div className="bk-sc-value">{selectedDate ? formatDateDisplay(selectedDate) : <span className="bk-sc-empty">{t("bk.notSelected")}</span>}</div>
          </div>
          <div className="bk-sc-row">
            <div className="bk-sc-label">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {t("bk.labelQueue")}
            </div>
            <div className="bk-sc-value">{displayQueue ? displayQueue.queue_name : <span className="bk-sc-empty">{t("bk.notSelected")}</span>}</div>
          </div>
          <div className="bk-sc-row">
            <div className="bk-sc-label">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {t("bk.statExpectedAt")}
            </div>
            <div className="bk-sc-value">
              {selectedSlot
                ? formatTimeToDisplay(selectedSlot.slot_start)
                : displayQueue?.estimated_appointment_time
                ? formatTimeToDisplay(displayQueue.estimated_appointment_time)
                : <span className="bk-sc-empty">–</span>}
            </div>
          </div>
          <div className="bk-sc-row">
            <div className="bk-sc-label">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
              {t("bk.thService")}
            </div>
            <div className="bk-sc-value">
              {selectedServices.length > 0 ? selectedServices.map(s => s.name).join(" + ") : <span className="bk-sc-empty">{t("bk.none")}</span>}
            </div>
          </div>
          <div className="bk-sc-row">
            <div className="bk-sc-label">
              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              {t("bk.labelDuration")}
            </div>
            <div className="bk-sc-value">{totalDuration > 0 ? formatDurationMinutes(totalDuration) : <span className="bk-sc-empty">–</span>}</div>
          </div>
        </div>

        {/* Total */}
        <div className="bk-total-block">
          <div className="bk-total-label">{t("bk.estimatedTotal")}</div>
          <div className="bk-total-amount">{totalPriceRange ? `₹${totalPriceMin} – ₹${totalPriceMax}` : `₹${totalPrice}`}</div>
          <div className="bk-total-sub">{t("bk.payAtCounter")}</div>
        </div>

        {/* Confirm */}
        <button className="bk-confirm-btn" onClick={handleConfirm} disabled={!canConfirm || bookingInProgress}>
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
          {bookingInProgress ? t("confirming") : isReschedule ? t("bk.confirmReschedule") : t("fixAppointment")}
        </button>
        <div className="bk-guarantee-row">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          {t("bk.freeCancellation")}
        </div>
        <div className="bk-disclaimer">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <p>{t("bk.priceDisclaimer")}</p>
        </div>
      </div>{/* /bk-right */}

      {/* ── Slot picker modal ────────────────────────────────────────────── */}
      {slotPickerOpen && (appointmentMode === "FIXED" || appointmentMode === "APPROXIMATE") && (
        <div className="bk-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bk-slot-picker-title" onClick={(e) => { if (e.target === e.currentTarget) setSlotPickerOpen(false); }}>
          <div className="bk-slot-picker-modal">
            <div className="bk-slot-picker-header">
              <div>
                <h2 id="bk-slot-picker-title" className="bk-modal-title">{appointmentMode === "FIXED" ? t("bk.fixedSlotTitle") : t("bk.approxSlotTitle")}</h2>
                <p className="bk-modal-subtitle">{selectedQueueOption?.queue_name} · {selectedDate ? formatDateDisplay(selectedDate) : ""}</p>
                <p className="bk-slot-picker-hint">{t("bk.apptTakes", { duration: formatDurationMinutes(totalDuration) })}</p>
              </div>
              <button type="button" className="bk-slot-picker-close" onClick={() => setSlotPickerOpen(false)} aria-label="Close slot picker">✕</button>
            </div>
            <div className="bk-slot-picker-body">
              {slotsLoading ? (
                <div className="bk-loading"><div className="bk-spinner" aria-hidden /><p>{t("bk.loadingAvailSlots")}</p></div>
              ) : slotsError ? (
                <div className="bk-error" role="alert">
                  <p>{slotsError}</p>
                  <button type="button" className="bk-outline-btn" onClick={() => {
                    setSlotsError(null); setSlotsLoading(true);
                    const bookingService = new BookingService();
                    bookingService.getQueueSlots(selectedQueueOption!.queue_id, selectedDate!)
                      .then((res) => { setTimeSlots(res); setSlotsLoading(false); })
                      .catch((err: any) => { setSlotsError(err.response?.data?.detail || t("bk.failedLoadSlots")); setSlotsLoading(false); });
                  }}>{t("bk.retry")}</button>
                </div>
              ) : !timeSlots?.slots?.length ? (
                <div className="bk-slot-picker-empty">
                  <span className="bk-slot-picker-empty__icon">📅</span>
                  <p className="bk-slot-picker-empty__title">{t("bk.noSlots")}</p>
                  <p className="bk-slot-picker-empty__hint">{selectedDate === getToday() ? t("bk.slotsTodayPassed") : t("bk.slotsNotAvailable")}</p>
                </div>
              ) : (
                <div className="bk-slot-picker-grid" role="group" aria-label="Available time slots">
                  {timeSlots.slots.filter(s => s.available).map((slot) => (
                    <button key={slot.uuid} type="button" className={`bk-slot-picker-item${selectedSlot?.uuid === slot.uuid ? " bk-slot-picker-item--selected" : ""}`} onClick={() => { setSelectedSlot(slot); setSlotPickerOpen(false); }} aria-pressed={selectedSlot?.uuid === slot.uuid}>
                      <span className="bk-slot-start">{formatTimeToDisplay(slot.slot_start)}</span>
                      <span className="bk-slot-dash">–</span>
                      <span className="bk-slot-end">{formatTimeToDisplay(slot.slot_end)}</span>
                      {slot.remaining > 0 && slot.remaining <= 3 && (slot.capacity ?? 0) > 1 && <span className="bk-slot-scarcity">{t("bk.slotLeft", { count: slot.remaining })}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Already in queue modal ───────────────────────────────────────── */}
      {alreadyInQueueData && (
        <div className="bk-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="bk-already-title" onClick={() => setBookingConfirmation(null)}>
          <div className="bk-modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 id="bk-already-title" className="bk-modal-title">{t("alreadyInQueueForToday")}</h2>
            <p className="bk-modal-subtitle">{t("bk.alreadyQueueDetails")}</p>
            <div className="bk-modal-details">
              <div className="bk-modal-row"><span className="bk-modal-label">{t("bk.labelQueue")}</span><span className="bk-modal-value">{alreadyInQueueData.queue_name}</span></div>
              <div className="bk-modal-row"><span className="bk-modal-label">{t("bk.statPosition")}</span><span className="bk-modal-value">#{alreadyInQueueData.position}</span></div>
              <div className="bk-modal-row">
                <span className="bk-modal-label">{t("bk.statEstWait")}</span>
                <span className="bk-modal-value">
                  {formatDurationMinutes(alreadyInQueueData.estimated_wait_minutes)}
                  {alreadyInQueueData.estimated_wait_range && <span className="bk-modal-range"> ({alreadyInQueueData.estimated_wait_range})</span>}
                </span>
              </div>
              <div className="bk-modal-row"><span className="bk-modal-label">{t("bk.statExpectedAt")}</span><span className="bk-modal-value">{formatTimeToDisplay(alreadyInQueueData.estimated_appointment_time)}</span></div>
            </div>
            <div className="bk-modal-actions">
              <button className="bk-outline-btn" onClick={() => setBookingConfirmation(null)}>{t("back")}</button>
              <button className="bk-confirm-btn bk-confirm-btn--sm" onClick={() => { setBookingConfirmation(null); navigate("/"); }}>{t("backToHome")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
