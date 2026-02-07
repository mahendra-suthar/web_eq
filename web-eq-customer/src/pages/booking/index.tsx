import { useState, useEffect, useCallback } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useBookingStore, type AvailableSlotData } from "../../store/booking.store";
import { useAuthStore } from "../../store/auth.store";
import { useQueueWebSocket } from "../../hooks/useQueueWebSocket";
import { BookingService } from "../../services/booking/booking.service";
import { BusinessService, type BusinessServiceData } from "../../services/business/business.service";
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
  
  // Use passed service data if available, otherwise fetch
  const [selectedServices, setSelectedServices] = useState<BusinessServiceData[]>(initialSelectedServicesData);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [bookingInProgress, setBookingInProgress] = useState(false);
  
  const { connected: wsConnectedState, sendRefresh } = useQueueWebSocket({
    businessId: businessId || "",
    date: selectedDate || "",
    enabled: !!businessId && !!selectedDate,
  });
  
  useEffect(() => {
    const loadServices = async () => {
      if (initialSelectedServicesData.length > 0) {
        return;
      }
      
      if (!businessId || initialSelectedServices.length === 0) return;
      
      try {
        setLoading(true);
        const businessService = new BusinessService();
        const allServices = await businessService.getBusinessServices(businessId);
 
        const selected = allServices.filter(s => initialSelectedServices.includes(s.uuid));
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
    if (selectedDate) {
      fetchSlots();
    }
  }, [selectedDate, fetchSlots]);
  
  const getNext7Days = () => {
    const days = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      days.push(date.toISOString().split("T")[0]);
    }
    return days;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    if (dateOnly.getTime() === today.getTime()) {
      return "Today";
    }
    if (dateOnly.getTime() === today.getTime() + 86400000) {
      return "Tomorrow";
    }
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  };

  const totalPrice = selectedServices.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalDuration = selectedServices.reduce((sum, s) => sum + (s.duration || 0), 0);

  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    setSelectedQueue(null);
  };

  const handleQueueSelect = (slot: AvailableSlotData) => {
    if (!slot.available) return;
    setSelectedQueue(slot);
  };

  const handleConfirm = async () => {
    if (!businessId || !selectedQueue || !selectedDate) return;
    
    setBookingInProgress(true);
    
    try {
      const bookingService = new BookingService();
      await bookingService.createBooking({
        business_id: businessId,
        queue_id: selectedQueue.queue_id,
        queue_date: selectedDate,
        service_ids: initialSelectedServices,
      });
      
      // Show success and redirect
      alert(t("bookingConfirmed"));
      
      navigate("/");
    } catch (err: any) {
      console.error("Booking failed:", err);
      const errorMsg = err.response?.data?.detail || "Booking failed. Please try again.";
      setError(errorMsg);
      
      // Check if auth required
      if (err.response?.status === HttpStatus.UNAUTHORIZED) {
        alert(t("pleaseLogin"));
        navigate("/send-otp", { 
          state: { 
            returnTo: `/business/${businessId}/book`,
            selectedServices: initialSelectedServices,
            selectedServicesData: initialSelectedServicesData,
            businessName: initialBusinessName 
          } 
        });
        return;
      }
    } finally {
      setBookingInProgress(false);
    }
  };

  const canProceedToDate = selectedServices.length > 0;
  const canProceedToSlots = selectedDate !== null && selectedDate !== "";
  const canConfirm = selectedQueue !== null;

  // Confirmation screen
  if (showConfirmation) {
    return (
      <div className="booking-page booking-page-confirm">
        <h1 className="booking-page-title">Confirm Booking</h1>

        <div className="booking-card">
          <h3 className="booking-card-title">Business</h3>
          <p className="booking-card-text">{initialBusinessName}</p>
        </div>

        <div className="booking-card">
          <h3 className="booking-card-title">Services</h3>
          {selectedServices.map((service) => (
            <div key={service.uuid} className="booking-service-item">
              <p className="booking-service-name">{service.name}</p>
              <p className="booking-service-details">
                ₹{service.price || 0} · {service.duration || 0} min
              </p>
            </div>
          ))}
        </div>

        <div className="booking-card">
          <h3 className="booking-card-title">Date & Queue</h3>
          <p className="booking-card-text">{selectedDate ? formatDate(selectedDate) : ""}</p>
          <p className="booking-card-subtext">
            {selectedQueue?.queue_name} · Est. wait: {selectedQueue?.estimated_wait_minutes} min
          </p>
          <p className="booking-card-subtext">
            Expected time: {selectedQueue?.estimated_appointment_time}
          </p>
        </div>

        <div className="booking-card booking-card-total">
          <div className="booking-total-row">
            <h3 className="booking-total-label">Total</h3>
            <p className="booking-total-amount">₹{totalPrice}</p>
          </div>
        </div>

        {error && (
          <div className="booking-error">
            <p>{error}</p>
          </div>
        )}

        <div className="booking-actions">
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

  // Main booking page
  return (
    <div className="booking-page">
      <div className="booking-header">
        <h1 className="booking-page-title">Book Appointment</h1>
        {initialBusinessName && <p className="booking-business-name">{initialBusinessName}</p>}
        
        {/* Real-time connection indicator */}
        {selectedDate && (
          <div className={`booking-ws-status ${wsConnectedState ? "connected" : "disconnected"}`}>
            <span className="status-dot"></span>
            {wsConnectedState ? t("liveUpdates") : t("connecting")}
          </div>
        )}
      </div>

      {/* Services Section */}
      <div className="booking-section">
        <h2 className="booking-section-title">{t("selectedServices")}</h2>
        {loading && selectedServices.length === 0 ? (
          <p className="booking-loading-text">{t("loading")}</p>
        ) : selectedServices.length === 0 ? (
          <p className="booking-empty-text">
            {t("noServicesSelected")}
          </p>
        ) : (
          <div className="booking-services-grid">
            {selectedServices.map((service) => (
              <div key={service.uuid} className="booking-service-card">
                <h3 className="booking-service-card-name">{service.name}</h3>
                {service.description && (
                  <p className="booking-service-card-desc">{service.description}</p>
                )}
                <div className="booking-service-card-meta">
                  <span>⏱️ {service.duration || 0} min</span>
                  <span className="booking-service-card-price">₹{service.price || 0}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {selectedServices.length > 0 && (
          <div className="booking-services-summary">
            <span>Total: {totalDuration} min</span>
            <span>₹{totalPrice}</span>
          </div>
        )}
      </div>

      {canProceedToDate && (
        <>
          <div className="booking-divider" />
          
          {/* Date Selection Section */}
          <div className="booking-section">
            <h2 className="booking-section-title">{t("selectDate")}</h2>
            <div className="booking-dates-grid">
              {getNext7Days().map((date) => (
                <div
                  key={date}
                  className={`booking-date-card ${selectedDate === date ? "selected" : ""}`}
                  onClick={() => handleDateSelect(date)}
                >
                  <h3 className="booking-date-day">{formatDate(date).split(" ")[0]}</h3>
                  <p className="booking-date-rest">{formatDate(date).split(" ").slice(1).join(" ")}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {canProceedToSlots && (
        <>
          <div className="booking-divider" />
          
          {/* Queue Selection Section */}
          <div className="booking-section">
            <h2 className="booking-section-title">{t("selectTimeSlot")}</h2>
            <p className="booking-section-subtitle">
              Choose a queue · Updates in real-time
            </p>
            
            {loading ? (
              <div className="booking-loading">
                <p>Loading available slots...</p>
              </div>
            ) : error ? (
              <div className="booking-error">
                <p>{error}</p>
                <Button text="Retry" color="outline-blue" onClick={fetchSlots} />
              </div>
            ) : availableSlots.length === 0 ? (
              <p className="booking-empty-text">
                {t("noSlotsAvailable")}
              </p>
            ) : (
              <div className="booking-slots-grid">
                {availableSlots.map((slot) => (
                  <div
                    key={slot.queue_id}
                    className={`booking-slot-card ${selectedQueue?.queue_id === slot.queue_id ? "selected" : ""} ${!slot.available ? "unavailable" : ""}`}
                    onClick={() => handleQueueSelect(slot)}
                  >
                    <div className="booking-slot-header">
                      <h3 className="booking-slot-queue">{slot.queue_name}</h3>
                      <span className={`booking-slot-status ${slot.available ? "available" : "full"}`}>
                        {slot.status}
                      </span>
                    </div>
                    
                    <div className="booking-slot-details">
                      <p className="booking-slot-position">
                        <span className="label">Position</span>
                        <span className="value">#{slot.current_position + 1}</span>
                      </p>
                      <p className="booking-slot-wait">
                        <span className="label">Est. wait</span>
                        <span className="value">{slot.estimated_wait_minutes} min</span>
                      </p>
                      <p className="booking-slot-time">
                        <span className="label">Expected at</span>
                        <span className="value">{slot.estimated_appointment_time}</span>
                      </p>
                      {slot.capacity && (
                        <p className="booking-slot-capacity">
                          <span className="label">Capacity</span>
                          <span className="value">{slot.current_position}/{slot.capacity}</span>
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {wsConnectedState && !loading && (
              <button className="booking-refresh-btn" onClick={sendRefresh}>
                ↻ Refresh
              </button>
            )}
          </div>
        </>
      )}

      {canConfirm && (
        <>
          <div className="booking-divider" />
          
          {/* Summary & Action */}
          <div className="booking-section">
            <div className="booking-summary-card">
              <div className="booking-summary-row">
                <h3 className="booking-summary-label">Total Amount</h3>
                <p className="booking-summary-amount">₹{totalPrice}</p>
              </div>
              <p className="booking-summary-details">
                {selectedServices.length} {selectedServices.length === 1 ? t("service") : t("services")} · {selectedDate ? formatDate(selectedDate) : ""}
              </p>
              <p className="booking-summary-queue">
                {selectedQueue?.queue_name} · Wait ~{selectedQueue?.estimated_wait_minutes} min
              </p>
            </div>

            <Button
              text={t("continueToConfirm")}
              color="blue"
              size="lg"
              onClick={() => setShowConfirmation(true)}
              className="booking-continue-button"
            />
          </div>
        </>
      )}
    </div>
  );
}
