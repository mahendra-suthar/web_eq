import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { useCustomerQueueWS } from "../../hooks/useCustomerQueueWS";
import type { CustomerQueueUpdate } from "../../hooks/useCustomerQueueWS";
import type { TodayAppointmentResponse } from "../../services/appointment/appointment.service";
import "./my-queue-card.scss";

interface MyQueueCardProps {
  appointment: TodayAppointmentResponse;
}

function formatCountdown(expectedAtTs: number | null): string {
  if (expectedAtTs == null) return "";
  const remaining = expectedAtTs - Date.now();
  if (remaining <= 0) return "Any moment now";
  const mins = Math.ceil(remaining / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

const MyQueueCard: React.FC<MyQueueCardProps> = ({ appointment }) => {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);

  // Live data starts from the REST response, then gets updated via WS
  const [liveData, setLiveData] = useState<CustomerQueueUpdate>({
    queue_user_id: appointment.queue_user_id,
    position: appointment.position ?? null,
    status: appointment.status,
    expected_at_ts: appointment.expected_at_ts ?? null,
    estimated_wait_minutes: appointment.estimated_wait_minutes ?? null,
    estimated_appointment_time: appointment.estimated_appointment_time ?? null,
    current_token: appointment.current_token ?? null,
  });

  // 30s tick for client-side countdown refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleWsUpdate = useCallback((data: CustomerQueueUpdate) => {
    setLiveData(data);
  }, []);

  const todayStr = appointment.queue_date;

  useCustomerQueueWS(
    appointment.queue_id,
    todayStr,
    appointment.queue_user_id,
    { onUpdate: handleWsUpdate, token },
  );

  const isInProgress = liveData.status === 2;
  const countdownLabel = formatCountdown(liveData.expected_at_ts);
  const isOverrun = liveData.expected_at_ts != null && liveData.expected_at_ts < Date.now();

  return (
    <div className={`mqc${isInProgress ? " mqc--active" : ""}`}>
      <div className="mqc__bar" aria-hidden />

      <div className="mqc__body">
        <div className="mqc__left">
          <div className="mqc__icon" aria-hidden>
            {isInProgress ? "🔔" : "⏳"}
          </div>
          <div className="mqc__info">
            <div className="mqc__queue-name">
              {appointment.queue_name}
              {appointment.business_name && (
                <span className="mqc__business"> · {appointment.business_name}</span>
              )}
            </div>
            <div className="mqc__status-row">
              {isInProgress ? (
                <span className="mqc__badge mqc__badge--active">
                  {t("youreBeingServed") || "You're being served"}
                </span>
              ) : liveData.position != null ? (
                <span className="mqc__badge mqc__badge--waiting">
                  #{liveData.position} {t("inLine") || "in line"}
                </span>
              ) : null}
              {liveData.current_token && !isInProgress && (
                <span className="mqc__serving">
                  {t("nowServing") || "Now serving"}: <strong>{liveData.current_token}</strong>
                </span>
              )}
            </div>
            {appointment.service_summary && (
              <div className="mqc__services">{appointment.service_summary}</div>
            )}
          </div>
        </div>

        <div className="mqc__right">
          {appointment.token_number && (
            <div className="mqc__token">{appointment.token_number}</div>
          )}
          {countdownLabel && (
            <div className={`mqc__wait${isOverrun ? " mqc__wait--overrun" : ""}`}>
              {countdownLabel}
            </div>
          )}
          {liveData.estimated_appointment_time && !isInProgress && (
            <div className="mqc__time">
              {t("expectedAt") || "Expected at"} {liveData.estimated_appointment_time}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyQueueCard;
