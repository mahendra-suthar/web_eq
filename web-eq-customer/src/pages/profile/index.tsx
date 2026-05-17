import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { useNotificationStore } from "../../store/notification.store";
import { AuthService } from "../../services/auth/auth.service";
import type { CustomerProfileResponse, CustomerProfileUpdateInput } from "../../services/auth/auth.service";
import { AppointmentService } from "../../services/appointment/appointment.service";
import type { CustomerAppointmentListItem } from "../../services/appointment/appointment.service";
import { BookingService } from "../../services/booking/booking.service";
import AppointmentActions from "../../components/appointment-actions";
import LoadingSpinner from "../../components/loading-spinner";
import ErrorMessage from "../../components/error-message";
import { formatAppointmentTimeSummary, formatDelayMessage, formatTimeToDisplay, formatApptType, getInitials, getApiErrorMessage } from "../../utils/util";
import { SUPPORT } from "../../utils/support";
import "./profile.scss";

type TabId = "profile" | "appointments" | "settings";
type ApptFilter = "all" | "upcoming" | "completed" | "cancelled";

const PAGE_SIZE = 10;
const VALID_TABS: TabId[] = ["profile", "appointments", "settings"];

function isValidTab(t: string): t is TabId {
  return VALID_TABS.includes(t as TabId);
}


function parseApptDate(dateStr: string): { day: string; mon: string } {
  try {
    const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
    const day = String(d.getDate()).padStart(2, "0");
    const mon = d.toLocaleString("en", { month: "short" }).toUpperCase();
    return { day, mon };
  } catch {
    return { day: "--", mon: "---" };
  }
}

function useToast() {
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState("");
  const show = useCallback((message: string) => {
    setMsg(message);
    setVisible(true);
    setTimeout(() => setVisible(false), 3000);
  }, []);
  return { visible, msg, show };
}

function ProfileInfoSection({ onSaved }: { onSaved: (msg: string) => void }) {
  const { t } = useTranslation();
  const { setUserInfo } = useAuthStore();
  const [data, setData] = useState<CustomerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dobError, setDobError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerProfileUpdateInput>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const svc = new AuthService();
      const res = await svc.getCustomerProfile();
      setData(res);
      setForm({
        full_name: res.user.full_name ?? undefined,
        email: res.user.email ?? undefined,
        date_of_birth: res.user.date_of_birth ?? undefined,
        gender: res.user.gender ?? undefined,
      });
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load profile"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    if (form.date_of_birth) {
      const birth = new Date(form.date_of_birth + "T00:00:00");
      const today = new Date();
      if (birth.getFullYear() < 1900) {
        setDobError(t("profile.birthdateTooOld"));
        return;
      }
      if (birth > today) {
        setDobError(t("profile.birthdateInvalid"));
        return;
      }
    }
    setDobError(null);
    setSaving(true);
    setError(null);
    try {
      const svc = new AuthService();
      const updated = await svc.updateCustomerProfile(form);
      setData(updated);
      setUserInfo(updated.user);
      onSaved(t("profile.profileUpdated"));
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to update profile"));
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (!data) return;
    setForm({
      full_name: data.user.full_name ?? undefined,
      email: data.user.email ?? undefined,
      date_of_birth: data.user.date_of_birth ?? undefined,
      gender: data.user.gender ?? undefined,
    });
    setError(null);
  };

  if (loading) {
    return (
      <div className="ac-loading">
        <LoadingSpinner size="md" />
        <span>{t("profile.loadingProfile")}</span>
      </div>
    );
  }

  const user = data?.user;

  return (
    <>
      {/* Personal Information */}
      <div className="ac-card">
        <div className="ac-card-header">
          <div className="ac-card-title">
            <div className="ac-card-icon">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            {t("profile.personalInfo")}
          </div>
        </div>
        <div className="ac-card-body">
          {error && (
            <div className="ac-error-wrap">
              <ErrorMessage role="alert">{error}</ErrorMessage>
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <div className="ac-form-grid">
              <div className="ac-form-group">
                <label className="ac-form-label" htmlFor="ac-fullname">{t("profile.fullName")}</label>
                <input
                  id="ac-fullname"
                  type="text"
                  className="ac-form-input"
                  value={form.full_name ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value || undefined }))}
                  placeholder={t("profile.fullNamePlaceholder")}
                  autoComplete="name"
                />
              </div>

              <div className="ac-form-group">
                <label className="ac-form-label">{t("profile.phoneNumber")}</label>
                <div className="ac-phone-row">
                  <div className="ac-phone-prefix">{user?.country_code || "+91"}</div>
                  <input
                    type="tel"
                    className="ac-form-input"
                    value={user?.phone_number ?? ""}
                    disabled
                  />
                </div>
              </div>

              <div className="ac-form-group ac-form-group--full">
                <label className="ac-form-label" htmlFor="ac-email">
                  {t("profile.emailAddress")}
                  {user?.email_verify && (
                    <span className="ac-verified-badge">
                      <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {t("profile.emailVerified")}
                    </span>
                  )}
                </label>
                <input
                  id="ac-email"
                  type="email"
                  className="ac-form-input"
                  value={form.email ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.toLowerCase() || undefined }))}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <div className="ac-form-hint">{t("profile.emailHint")}</div>
              </div>

              <div className="ac-form-group">
                <label className="ac-form-label" htmlFor="ac-dob">{t("profile.dateOfBirth")}</label>
                <input
                  id="ac-dob"
                  type="date"
                  className={`ac-form-input${dobError ? " ac-form-input--error" : ""}`}
                  value={form.date_of_birth ?? ""}
                  min="1900-01-01"
                  max={new Date().toISOString().split("T")[0]}
                  onChange={(e) => {
                    setDobError(null);
                    setForm((f) => ({ ...f, date_of_birth: e.target.value || undefined }));
                  }}
                />
                {dobError && <div className="ac-form-error">{dobError}</div>}
              </div>

              <div className="ac-form-group">
                <label className="ac-form-label" htmlFor="ac-gender">{t("profile.gender")}</label>
                <select
                  id="ac-gender"
                  className="ac-form-select"
                  value={form.gender ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, gender: e.target.value === "" ? undefined : Number(e.target.value) }))
                  }
                >
                  <option value="">{t("profile.genderUnspecified")}</option>
                  <option value="1">{t("profile.genderMale")}</option>
                  <option value="2">{t("profile.genderFemale")}</option>
                  <option value="3">{t("profile.genderOther")}</option>
                </select>
              </div>
            </div>

            <div className="ac-form-actions">
              <button type="submit" className="ac-btn-save" disabled={saving}>
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {saving ? t("profile.saving") : t("profile.saveChanges")}
              </button>
              <button type="button" className="ac-btn-cancel" onClick={handleDiscard}>
                {t("profile.discard")}
              </button>
              <div className="ac-save-note">
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                {t("profile.dataSecure")}
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Appointments Section ──────────────────────────────────────────────────────
type ApptStatusClass = "upcoming" | "completed" | "expired" | "cancelled" | "other";

function getRichStatusClass(status: number): ApptStatusClass {
  if (status === 1 || status === 2 || status === 8) return "upcoming";
  if (status === 3) return "completed";
  if (status === 7) return "expired";
  if (status === 4 || status === 5) return "cancelled";
  return "other";
}


function getMonthYear(dateStr: string): string {
  try {
    const d = new Date(dateStr + (dateStr.includes("T") ? "" : "T00:00:00"));
    return d.toLocaleString("en", { month: "long", year: "numeric" });
  } catch {
    return "Unknown";
  }
}

function AppointmentsSection() {
  const navigate = useNavigate();
  const { t } = useTranslation();


  const STATUS_LABELS = useMemo<Record<number, string>>(() => ({
    1: t("profile.statusWaiting"),
    2: t("profile.statusInProgress"),
    3: t("profile.statusCompleted"),
    4: t("profile.statusFailed"),
    5: t("profile.statusCancelled"),
    7: t("profile.statusExpired"),
    8: t("profile.statusScheduled"),
  }), [t]);
  const getStatusLabel = useCallback(
    (status: number) => STATUS_LABELS[status] ?? t("profile.statusUnknown"),
    [STATUS_LABELS, t]
  );
  const [list, setList] = useState<CustomerAppointmentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ApptFilter>("all");

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    setError(null);
    try {
      const svc = new AppointmentService();
      const res = await svc.getAppointments(PAGE_SIZE, offset);
      setList((prev) => (append ? [...prev, ...res.items] : res.items));
      setTotal(res.total);
      setHasMore(res.has_more);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load appointments"));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { loadPage(0, false); }, [loadPage]);
  const refreshList = useCallback(() => { loadPage(0, false); }, [loadPage]);

  const markArrived = useCallback(async (queueUserId: string) => {
    try {
      await new BookingService().arrive(queueUserId);
      setList((prev) =>
        prev.map((it) => it.queue_user_id === queueUserId ? { ...it, is_checked_in: true } : it)
      );
    } catch {
      // non-critical
    }
  }, []);

  // Stats derived from full list
  const stats = {
    total: list.length,
    upcoming: list.filter((i) => getRichStatusClass(i.status) === "upcoming").length,
    completed: list.filter((i) => getRichStatusClass(i.status) === "completed").length,
    other: list.filter((i) => ["expired", "cancelled"].includes(getRichStatusClass(i.status))).length,
  };

  // Filtered list
  const filteredList = list.filter((item) => {
    if (filter === "all") return true;
    const cls = getRichStatusClass(item.status);
    if (filter === "upcoming") return cls === "upcoming";
    if (filter === "completed") return cls === "completed";
    if (filter === "cancelled") return cls === "expired" || cls === "cancelled";
    return true;
  });

  // Group by month
  const grouped: { month: string; items: CustomerAppointmentListItem[] }[] = [];
  filteredList.forEach((item) => {
    const m = getMonthYear(item.queue_date);
    const last = grouped[grouped.length - 1];
    if (last && last.month === m) last.items.push(item);
    else grouped.push({ month: m, items: [item] });
  });

  const FILTERS = useMemo<{ key: ApptFilter; label: string; count: number }[]>(() => [
    { key: "all", label: t("profile.filterAll"), count: list.length },
    { key: "upcoming", label: t("profile.filterUpcoming"), count: stats.upcoming },
    { key: "completed", label: t("profile.filterCompleted"), count: stats.completed },
    { key: "cancelled", label: t("profile.filterPast"), count: stats.other },
  ], [t, list.length, stats.upcoming, stats.completed, stats.other]);

  return (
    <>

      {/* Stats strip */}
      {!loading && list.length > 0 && (
        <div className="ac-stats-strip">
          <div className="ac-stat-tile ac-stat-tile--total">
            <div className="ac-stat-num">{total || list.length}</div>
            <div className="ac-stat-label">{t("profile.statTotal")}</div>
          </div>
          <div className="ac-stat-tile ac-stat-tile--upcoming">
            <div className="ac-stat-num">{stats.upcoming}</div>
            <div className="ac-stat-label">{t("profile.statUpcoming")}</div>
          </div>
          <div className="ac-stat-tile ac-stat-tile--done">
            <div className="ac-stat-num">{stats.completed}</div>
            <div className="ac-stat-label">{t("profile.statCompleted")}</div>
          </div>
          <div className="ac-stat-tile ac-stat-tile--other">
            <div className="ac-stat-num">{stats.other}</div>
            <div className="ac-stat-label">{t("profile.statOther")}</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="ac-appt-toolbar">
        <div className="ac-appt-filters">
          {FILTERS.map(({ key, label, count }) => (
            <button
              key={key}
              className={`ac-appt-filter${filter === key ? " ac-appt-filter--active" : ""}`}
              onClick={() => setFilter(key)}
            >
              {label}
              {!loading && <span className="ac-filter-count">{count}</span>}
            </button>
          ))}
        </div>
        <button className="ac-book-btn" onClick={() => navigate("/")}>
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {t("profile.bookAppointment")}
        </button>
      </div>

      {error && (
        <div className="ac-error-wrap">
          <ErrorMessage role="alert">{error}</ErrorMessage>
        </div>
      )}

      {loading ? (
        <div className="ac-loading">
          <LoadingSpinner size="md" />
          <span>{t("profile.loadingAppointments")}</span>
        </div>
      ) : filteredList.length === 0 ? (
        <div className="ac-empty">
          {filter === "all" ? t("profile.noAppointments") : t("profile.noFilteredAppointments", { filter })}
        </div>
      ) : (
        <>
          {grouped.map(({ month, items }) => (
            <div key={month}>
              <div className="ac-month-sep">{month}</div>
              {items.map((item) => {
                const cls = getRichStatusClass(item.status);
                const isPast = cls === "completed" || cls === "expired" || cls === "cancelled";
                const { day, mon } = parseApptDate(item.queue_date);
                const timeSummary = formatAppointmentTimeSummary(
                  item.appointment_type,
                  item.scheduled_start ?? null,
                  item.scheduled_end ?? null,
                  item.estimated_appointment_time ?? null
                );
                const delayMsg = formatDelayMessage(item.delay_minutes ?? null);
                const services = item.service_summary
                  ? item.service_summary.split(",").map((s) => s.trim()).filter(Boolean)
                  : [];
                const servedAt = item.dequeue_time ? formatTimeToDisplay(item.dequeue_time)
                  : item.enqueue_time ? formatTimeToDisplay(item.enqueue_time) : null;
                const apptTypeLabel = formatApptType(item.appointment_type);

                return (
                  <div key={item.queue_user_id} className={`ac-appt-card ac-appt-card--${cls}`}>
                    {/* Main body */}
                    <div className="ac-appt-main">
                      <div className="ac-appt-date">
                        <div className="ac-appt-date-num">{day}</div>
                        <div className="ac-appt-date-mon">{mon}</div>
                      </div>

                      <div className="ac-appt-info">
                        <div className="ac-appt-top">
                          <div className="ac-appt-biz">{item.business_name}</div>
                          <div className={`ac-appt-status ac-appt-status--${cls}${cls === "upcoming" ? " ac-appt-status--live" : ""}`}>
                            <div className="ac-status-dot" />
                            {getStatusLabel(item.status)}
                          </div>
                        </div>

                        <div className="ac-appt-meta">
                          <span>{item.queue_name}</span>
                          {delayMsg && (
                            <>
                              <span className="ac-appt-sep">·</span>
                              <span className="ac-appt-delay">{delayMsg}</span>
                            </>
                          )}
                        </div>

                        {services.length > 0 && (
                          <div className="ac-appt-services">
                            {services.map((s) => (
                              <div key={s} className="ac-service-tag">{s}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Live status bar — active (waiting/in-progress) only, not pre-scheduled */}
                    {!isPast && item.status !== 8 && (
                      <div className={`ac-live-bar${
                        item.status === 2 ? " ac-live-bar--serving"
                        : item.position === 1 ? " ac-live-bar--next"
                        : item.position != null && item.position <= 3 ? " ac-live-bar--close"
                        : ""
                      }`}>
                        <div className="ac-live-bar__info">
                          {item.status === 2 ? (
                            <>
                              <span className="ac-live-bar__dot" aria-hidden="true" />
                              <span className="ac-live-bar__serving-text">{t("youreBeingServed")}</span>
                            </>
                          ) : item.position === 1 ? (
                            <>
                              <span className="ac-live-bar__next-icon">⚡</span>
                              <span className="ac-live-bar__next-text">{t("youreNext")}</span>
                              {item.estimated_appointment_time && (
                                <span className="ac-live-bar__wait">{t("expectedAt")} {item.estimated_appointment_time}</span>
                              )}
                            </>
                          ) : (
                            <>
                              {item.position != null && (
                                <>
                                  <span className="ac-live-bar__pos">#{item.position}</span>
                                  <span className="ac-live-bar__pos-label">{t("inLine")}</span>
                                </>
                              )}
                              {item.estimated_appointment_time ? (
                                <span className="ac-live-bar__wait">{t("expectedAt")} {item.estimated_appointment_time}</span>
                              ) : item.estimated_wait_minutes != null && item.estimated_wait_minutes > 0 ? (
                                <span className="ac-live-bar__wait">~{item.estimated_wait_minutes} {t("minWait")}</span>
                              ) : null}
                            </>
                          )}
                        </div>
                        {(item.status === 8 || (item.status === 1 && item.position != null && item.position <= 3)) && (
                          item.is_checked_in ? (
                            <span className="appt-actions__arrived">
                              <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {t("arrived")}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="appt-actions__btn appt-actions__btn--arrive"
                              onClick={(e) => { e.stopPropagation(); markArrived(item.queue_user_id); }}
                            >
                              {t("iveArrived")}
                            </button>
                          )
                        )}
                      </div>
                    )}

                    {/* Footer */}
                    <div className="ac-appt-footer">
                      {item.token_number && (
                        <div className="ac-appt-token">
                          <div>
                            <div className="ac-token-label">{t("profile.tokenLabel")}</div>
                            <div className="ac-token-value">{item.token_number}</div>
                          </div>
                        </div>
                      )}

                      {item.total_fee != null && item.total_fee > 0 && (
                        <div className="ac-appt-fee-chip">
                          <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M16 8h-6a2 2 0 000 4h4a2 2 0 010 4H8" />
                            <line x1="12" y1="6" x2="12" y2="8" />
                            <line x1="12" y1="16" x2="12" y2="18" />
                          </svg>
                          ₹{item.total_fee.toFixed(2)}
                        </div>
                      )}

                      {/* Appointment type chip — shown for all statuses */}
                      <div className="ac-appt-type-chip" data-type={item.appointment_type || "QUEUE"}>
                        {apptTypeLabel}
                      </div>

                      {/* Past/Completed/Cancelled/Expired: show actual/scheduled time + served time + cancellation reason */}
                      {isPast ? (
                        <>
                          {timeSummary && (
                            <div className="ac-appt-time-chip">
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                              </svg>
                              {timeSummary}
                            </div>
                          )}
                          {cls === "completed" && servedAt && (
                            <div className="ac-appt-time-chip ac-appt-time-chip--served">
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                              {t("profile.servedAt") || "Served at"} {servedAt}
                            </div>
                          )}
                          {(cls === "cancelled" || cls === "expired") && item.cancellation_reason && (
                            <div className="ac-appt-cancel-reason">
                              {item.cancellation_reason}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {timeSummary && (
                            <div className="ac-appt-time-chip">
                              <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                              </svg>
                              {timeSummary}
                            </div>
                          )}
                        </>
                      )}

                      <div className="ac-appt-footer-actions">
                        <AppointmentActions appointment={item} onUpdated={refreshList} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {hasMore && (
            <div className="ac-load-more">
              <button
                className="ac-load-more-btn"
                onClick={() => loadPage(list.length, true)}
                disabled={loadingMore}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                {loadingMore ? t("profile.loadingMore") : t("profile.loadOlder")}
              </button>
            </div>
          )}
          {total > 0 && (
            <p className="ac-appt-count">
              Showing {filteredList.length} of {total}
            </p>
          )}
        </>
      )}
    </>
  );
}
{/* Settings Section */}
function SettingsSection() {
  const { t } = useTranslation();

  const notifItems = [
    { name: t("profile.notifBooking"), desc: t("profile.notifBookingDesc") },
    { name: t("profile.notifQueue"), desc: t("profile.notifQueueDesc") },
    { name: t("profile.notifReminder"), desc: t("profile.notifReminderDesc") },
    { name: t("profile.notifPromo"), desc: t("profile.notifPromoDesc") },
  ];

  return (
    <>
      {/* Notifications */}
      <div className="ac-card">
        <div className="ac-card-header">
          <div className="ac-card-title">
            <div className="ac-card-icon">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 01-3.46 0" />
              </svg>
            </div>
            {t("profile.notificationsTitle")}
          </div>
        </div>
        <div className="ac-card-body">
          {notifItems.map(({ name, desc }) => (
            <div key={name} className="ac-setting-row ac-setting-row--disabled">
              <div className="ac-setting-info">
                <div className="ac-setting-name">{name}</div>
                <div className="ac-setting-desc">{desc}</div>
              </div>
              <label className="ac-toggle ac-toggle--disabled">
                <input type="checkbox" disabled checked={false} onChange={() => {}} />
                <span className="ac-toggle-slider" />
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Preferences */}
      <div className="ac-card">
        <div className="ac-card-header">
          <div className="ac-card-title">
            <div className="ac-card-icon">
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
              </svg>
            </div>
            {t("profile.preferencesTitle")}
          </div>
        </div>
        <div className="ac-card-body">
          <div className="ac-setting-row ac-setting-row--disabled">
            <div className="ac-setting-info">
              <div className="ac-setting-name">{t("profile.prefLanguage")}</div>
              <div className="ac-setting-desc">{t("profile.prefLanguageDesc")}</div>
            </div>
            <select className="ac-setting-select" disabled>
              <option>English</option>
            </select>
          </div>
          <div className="ac-setting-row ac-setting-row--disabled">
            <div className="ac-setting-info">
              <div className="ac-setting-name">{t("profile.prefLocation")}</div>
              <div className="ac-setting-desc">{t("profile.prefLocationDesc")}</div>
            </div>
            <select className="ac-setting-select" disabled>
              <option>Ahmedabad</option>
            </select>
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="ac-danger-zone ac-danger-zone--disabled">
        <div className="ac-danger-title">
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          {t("profile.dangerZoneTitle")}
        </div>
        <p className="ac-danger-desc">{t("profile.dangerZoneDesc")}</p>
        <button className="ac-btn-danger" disabled>{t("profile.deleteAccount")}</button>
      </div>
    </>
  );
}
{/* Main Page */}
export default function ProfilePage() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { userInfo, resetUser } = useAuthStore();

  const SIDENAV_ITEMS = useMemo<{ id: TabId; label: string; icon: React.ReactNode }[]>(() => [
    {
      id: "profile",
      label: t("profile.navProfile"),
      icon: (
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    {
      id: "appointments",
      label: t("profile.navAppointments"),
      icon: (
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      id: "settings",
      label: t("profile.navSettings"),
      icon: (
        <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
        </svg>
      ),
    },
  ], [t]);
  const { visible: toastVisible, msg: toastMsg, show: showToast } = useToast();

  const tabParam = searchParams.get("tab") ?? "profile";
  const activeTab: TabId = isValidTab(tabParam) ? tabParam : "profile";

  const setTab = useCallback(
    (id: TabId) => setSearchParams({ tab: id }, { replace: true }),
    [setSearchParams]
  );

  const handleLogout = async () => {
    await new AuthService().logout();
    resetUser();
    useNotificationStore.getState().reset();
    navigate("/");
  };

  const initials = getInitials(userInfo?.full_name, userInfo?.phone_number);
  const displayName = userInfo?.full_name || userInfo?.phone_number || "Account";

  return (
    <div className="ac-page">
      <div className="ac-back-row">
        <button
          className="ac-back-btn"
          onClick={() => navigate(-1)}
          aria-label={t("back")}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t("back")}
        </button>
      </div>

      <div className="ac-shell">

        <aside className="ac-sidebar">
          {/* Profile card */}
          <div className="ac-profile-card">
            <div className="ac-avatar-wrap">
              <div className="ac-avatar">{initials}</div>
            </div>
            <div className="ac-profile-name">{displayName}</div>
            <div className="ac-profile-phone">
              {userInfo?.country_code} {userInfo?.phone_number}
            </div>
            <div className="ac-profile-badge">
              <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {t("profile.verifiedMember")}
            </div>
          </div>

          {/* Sidenav */}
          <nav className="ac-sidenav">
            {SIDENAV_ITEMS.map((item) => (
              <button
                key={item.id}
                className={`ac-sidenav-item${activeTab === item.id ? " ac-sidenav-item--active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                <div className="ac-sidenav-icon">{item.icon}</div>
                {item.label}
              </button>
            ))}
            <a
              href={SUPPORT.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ac-sidenav-item"
            >
              <div className="ac-sidenav-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.847L.057 23.5l5.797-1.522A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.648-.52-5.152-1.422l-.369-.219-3.44.903.919-3.352-.24-.386A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                </svg>
              </div>
              {t("profile.contactWhatsApp")}
            </a>
            <button className="ac-sidenav-item ac-sidenav-item--danger" onClick={handleLogout}>
              <div className="ac-sidenav-icon">
                <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </div>
              {t("profile.navSignOut")}
            </button>
          </nav>
        </aside>

        <main className="ac-main">
          <div className="ac-page-header">
            <h1 className="ac-page-title">
              {activeTab === "profile" && t("profile.myProfile")}
              {activeTab === "appointments" && t("profile.myAppointments")}
              {activeTab === "settings" && t("profile.mySettings")}
            </h1>
            <p className="ac-page-sub">
              {activeTab === "profile" && t("profile.subProfile")}
              {activeTab === "appointments" && t("profile.subAppointments")}
              {activeTab === "settings" && t("profile.subSettings")}
            </p>
          </div>

          {/* Panels */}
          {activeTab === "profile" && (
            <ProfileInfoSection onSaved={showToast} />
          )}
          {activeTab === "appointments" && <AppointmentsSection />}
          {activeTab === "settings" && <SettingsSection />}
        </main>
      </div>

      {/* Toast */}
      <div className={`ac-toast${toastVisible ? " ac-toast--show" : ""}`} role="status" aria-live="polite">
        <svg className="ac-toast-icon" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        {toastMsg}
      </div>
    </div>
  );
}
