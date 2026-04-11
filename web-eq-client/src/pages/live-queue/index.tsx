import React, { useMemo, useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { QueueService, LiveQueueData, QueueData } from "../../services/queue/queue.service";
import { useUserStore } from "../../utils/userStore";
import { useLiveQueueWS } from "../../hooks/useLiveQueueWS";
import { QueueUserStatus } from "../../utils/constants";
import { formatDurationMinutes, formatTimeToDisplay } from "../../utils/utils";
import AddCustomerModal from "../../components/add-customer-modal";
import "./live-queue.scss";


const queueService = new QueueService();

/** Human-readable appointment type for display. */
function appointmentTypeLabel(type: string | null | undefined): string {
  if (!type) return "Queue";
  const upper = type.toUpperCase();
  if (upper === "FIXED") return "Fixed";
  if (upper === "APPROXIMATE") return "Approximate";
  return "Queue";
}

/** Scheduled time for FIXED/APPROXIMATE: { labelKey, value } or null. */
function formatScheduledLabel(user: {
  appointment_type?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
}): { labelKey: "scheduledAt" | "scheduledWindow"; value: string } | null {
  const start = user.scheduled_start?.trim();
  if (!start) return null;
  const type = (user.appointment_type || "").toUpperCase();
  const startDisplay = formatTimeToDisplay(start);
  if (type === "APPROXIMATE" && user.scheduled_end?.trim()) {
    return {
      labelKey: "scheduledWindow",
      value: `${startDisplay} – ${formatTimeToDisplay(user.scheduled_end)}`,
    };
  }
  return { labelKey: "scheduledAt", value: startDisplay };
}

type UIUser = {
  id: string;
  full_name: string;
  phone: string;
  token: string;
  service_summary: string;
  time_label: string;
  estimated_wait_label: string;
  expected_at_label: string;
  est_remaining_label: string;   // for IN_PROGRESS: "~X min remaining" or "Any moment now"
  expected_at_ts?: number | null;
  position?: number | null;
  appointment_type?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  delay_minutes?: number | null;
};

type CurrentUser = UIUser & { position: number | null; estimated_token: string };

function mapLiveData(data: LiveQueueData): {
  completed: UIUser[];
  current: CurrentUser | null;
  waiting: UIUser[];
} {
  const completed: UIUser[] = [];
  const waiting: UIUser[] = [];
  let current: CurrentUser | null = null;
  const now = Date.now();

  for (const u of data.users) {
    const timeLabel = formatTimeToDisplay(u.dequeue_time || u.enqueue_time);

    // Use epoch timestamp for drift-free countdown — no server round-trip needed
    let estWaitLabel = "";
    if (u.expected_at_ts != null) {
      const remainingMs = u.expected_at_ts - now;
      estWaitLabel = remainingMs <= 60_000
        ? "< 1m"
        : formatDurationMinutes(Math.ceil(remainingMs / 60_000));
    } else if (u.estimated_wait_minutes != null) {
      estWaitLabel = u.estimated_wait_minutes === 0
        ? "< 1m"
        : formatDurationMinutes(u.estimated_wait_minutes);
    }

    const expectedAtLabel = u.estimated_appointment_time ?? "";

    // For IN_PROGRESS: compute finish countdown using expected_at_ts
    let estRemainingLabel = "";
    if (u.status === QueueUserStatus.IN_PROGRESS && u.expected_at_ts != null) {
      const remainingMs = u.expected_at_ts - now;
      estRemainingLabel = remainingMs <= 0
        ? "Any moment now"
        : `~${formatDurationMinutes(Math.ceil(remainingMs / 60_000))} remaining`;
    }

    const base: UIUser = {
      id: u.uuid,
      full_name: u.full_name || "—",
      phone: u.phone,
      token: u.token || "",
      service_summary: u.service_summary,
      time_label: timeLabel,
      estimated_wait_label: estWaitLabel,
      expected_at_label: expectedAtLabel,
      est_remaining_label: estRemainingLabel,
      expected_at_ts: u.expected_at_ts ?? null,
      position: u.position ?? null,
      appointment_type: u.appointment_type ?? null,
      scheduled_start: u.scheduled_start ?? null,
      scheduled_end: u.scheduled_end ?? null,
      delay_minutes: u.delay_minutes ?? null,
    };

    if (u.status === QueueUserStatus.COMPLETED) {
      completed.push(base);
    } else if (u.status === QueueUserStatus.IN_PROGRESS) {
      current = {
        ...base,
        position: u.position ?? null,
        estimated_token: u.token || "",
      };
    } else {
      waiting.push(base);
    }
  }

  return { completed, current, waiting };
}

const LiveQueue: React.FC = () => {
  const { t } = useTranslation();
  const profile = useUserStore((s) => s.profile);
  const getBusinessId = useUserStore((s) => s.getBusinessId);
  const businessId = getBusinessId();
  const employeeQueueId: string | null =
    profile?.profile_type === "EMPLOYEE"
      ? (profile?.employee as any)?.queue_id ?? null
      : null;

  const [selectedQueueId, setSelectedQueueId] = useState<string | null>(employeeQueueId);
  const [queues, setQueues] = useState<QueueData[]>([]);
  const [queuesLoading, setQueuesLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [liveData, setLiveData] = useState<LiveQueueData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextLoading, setNextLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showAddCustomer, setShowAddCustomer] = useState(false);

  const todayLabel = useMemo(() => {
    try {
      return new Date().toLocaleDateString(undefined, {
        weekday: "long",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return "Today";
    }
  }, []);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  // Fetch queue list for business-type users (selector)
  useEffect(() => {
    if (employeeQueueId || !businessId) return;
    setQueuesLoading(true);
    queueService
      .getQueues(businessId)
      .then((list) => {
        setQueues(list);
        if (list.length > 0 && !selectedQueueId) {
          setSelectedQueueId(String(list[0].uuid));
        }
      })
      .catch(() => {})
      .finally(() => setQueuesLoading(false));
  }, [businessId, employeeQueueId]);

  // Fetch live queue data
  const fetchLiveQueue = useCallback(async (queueId: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await queueService.getLiveQueue(queueId);
      setLiveData(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load live queue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedQueueId) {
      fetchLiveQueue(selectedQueueId);
    }
  }, [selectedQueueId, fetchLiveQueue]);

  // Tick every 30s so the countdown re-renders without a server round-trip
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Real-time WebSocket updates
  const handleWsUpdate = useCallback((data: LiveQueueData) => {
    setLiveData(data);
  }, []);

  const handleWsStarted = useCallback(
    (payload: { queue_id: string; queue_status: number }) => {
      setLiveData((prev) =>
        prev ? { ...prev, queue_status: payload.queue_status } : prev
      );
    },
    []
  );

  const handleWsStopped = useCallback(
    (payload: { queue_id: string; queue_status: number }) => {
      setLiveData((prev) =>
        prev ? { ...prev, queue_status: payload.queue_status } : prev
      );
    },
    []
  );

  useLiveQueueWS(selectedQueueId, todayStr, {
    onUpdate: handleWsUpdate,
    onStarted: handleWsStarted,
    onStopped: handleWsStopped,
  });

  // Derived UI state — recalculates on new server data OR every 30s tick
  const { completed, current, waiting } = useMemo(() => {
    if (!liveData) return { completed: [], current: null, waiting: [] };
    return mapLiveData(liveData);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveData, tick]);

  const inProgressCount = liveData?.in_progress_count ?? 0;
  const waitingCount = liveData?.waiting_count ?? 0;
  const completedCount = liveData?.completed_count ?? 0;
  const queueName = liveData?.queue_name ?? "Live Queue";
  const queueStatus = liveData?.queue_status;
  const employeeOnLeave = liveData?.employee_on_leave ?? false;

  const handleNext = useCallback(async () => {
    if (!selectedQueueId || nextLoading) return;
    setActionError(null);
    setNextLoading(true);
    try {
      const updated = await queueService.advanceQueue(selectedQueueId);
      setLiveData(updated);
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || "Failed to advance queue");
    } finally {
      setNextLoading(false);
    }
  }, [selectedQueueId, nextLoading]);

  const handleRefresh = useCallback(() => {
    if (selectedQueueId) fetchLiveQueue(selectedQueueId);
  }, [selectedQueueId, fetchLiveQueue]);

  const handleStart = useCallback(async () => {
    if (!selectedQueueId || !businessId || actionLoading) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await queueService.startQueue(selectedQueueId, businessId);
      setLiveData((prev) => (prev ? { ...prev, queue_status: 2 } : prev));
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || "Failed to start queue");
    } finally {
      setActionLoading(false);
    }
  }, [selectedQueueId, businessId, actionLoading]);

  const handleStop = useCallback(async () => {
    if (!selectedQueueId || !businessId || actionLoading) return;
    setActionError(null);
    setActionLoading(true);
    try {
      await queueService.stopQueue(selectedQueueId, businessId);
      setLiveData((prev) => (prev ? { ...prev, queue_status: 3 } : prev));
    } catch (e: any) {
      setActionError(e?.response?.data?.detail || "Failed to stop queue");
    } finally {
      setActionLoading(false);
    }
  }, [selectedQueueId, businessId, actionLoading]);

  const timelineItems = useMemo(() => {
    type TItem = { id: string; status: "done" | "progress" | "waiting"; user: UIUser };
    const items: TItem[] = [];
    completed.forEach((u) => items.push({ id: u.id, status: "done", user: u }));
    if (current) items.push({ id: current.id, status: "progress", user: current });
    waiting.forEach((u) => items.push({ id: u.id, status: "waiting", user: u }));
    return items;
  }, [completed, current, waiting]);

  const isRunning = queueStatus === 2;
  const isStopped = queueStatus === 3;

  // True when the in-progress customer has gone past their expected finish time
  const isQueueRunningLate =
    current != null &&
    current.expected_at_ts != null &&
    current.expected_at_ts < Date.now();

  // Queue selector (only for business owners who have multiple queues)
  const showSelector = !employeeQueueId && queues.length > 1;
  const actionsDisabled = employeeOnLeave;

  if (!selectedQueueId && !queuesLoading) {
    return (
      <div className="live-queue-page">
        <div className="lq-shell lq-shell--empty">
          <p className="lq-empty-msg">No queue found. Please assign a queue to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="live-queue-page">
      <div className="lq-shell">
        {/* Header */}
        <header className="lq-header">
          <div className="lq-header__left">
            <div className="lq-header__title-row">
              {showSelector ? (
                <select
                  className="lq-queue-select"
                  value={selectedQueueId ?? ""}
                  onChange={(e) => setSelectedQueueId(e.target.value)}
                >
                  {queues.map((q) => (
                    <option key={String(q.uuid)} value={String(q.uuid)}>
                      {q.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="lq-header__title">
                  {loading && !liveData ? "Loading…" : queueName}
                </div>
              )}
              {isStopped && <span className="lq-badge lq-badge--stopped">Stopped</span>}
              {isRunning && <span className="lq-badge lq-badge--running">Running</span>}
              {isQueueRunningLate && (
                <span className="lq-badge lq-badge--late">
                  {t("runningLateQueue") || "Running late"}
                </span>
              )}
              {employeeOnLeave && (
                <span className="lq-badge lq-badge--onLeave">
                  {t("employeeOnLeave") || "On leave"}
                </span>
              )}
            </div>
            <div className="lq-header__line2">
              {t("today") || "Today"} · {todayLabel}
              {current && (
                <>
                  <span className="lq-sep" aria-hidden />
                  {t("currentServing") || "Serving"} <strong>{current.token}</strong>
                  <span className="lq-sep" aria-hidden />
                  {t("position") || "Position"} <strong>#{current.position}</strong>
                </>
              )}
            </div>
            <div className="lq-header__counters">
              <span className="lq-counter lq-counter--progress">
                {t("inProgress") || "In Progress"}: {inProgressCount}
              </span>
              <span className="lq-sep" aria-hidden />
              <span className="lq-counter lq-counter--waiting">
                {t("waiting") || "Waiting"}: {waitingCount}
              </span>
              <span className="lq-sep" aria-hidden />
              <span className="lq-counter lq-counter--done">
                {t("completed") || "Completed"}: {completedCount}
              </span>
            </div>
          </div>
          <div className="lq-header__right">
            <button
              type="button"
              className="lq-iconAction"
              aria-label={t("refresh") || "Refresh"}
              title={t("refresh") || "Refresh"}
              onClick={handleRefresh}
              disabled={loading}
            >
              ↻
            </button>
            <button
              type="button"
              className="lq-actionBtn lq-actionBtn--addCustomer"
              onClick={() => setShowAddCustomer(true)}
              disabled={!selectedQueueId || actionsDisabled}
            >
              <span aria-hidden>+</span> {t("addCustomer") || "Add Customer"}
            </button>
            <button
              type="button"
              className="lq-actionBtn lq-actionBtn--start"
              onClick={handleStart}
              disabled={actionsDisabled || actionLoading || isRunning}
            >
              <span aria-hidden>▶</span> {t("startQueue") || "Start Queue"}
            </button>
            <button
              type="button"
              className="lq-actionBtn lq-actionBtn--stop"
              onClick={handleStop}
              disabled={actionsDisabled || actionLoading || isStopped}
            >
              <span aria-hidden>■</span> {t("stopQueue") || "Stop Queue"}
            </button>
          </div>
        </header>

        {/* Loading / Error states */}
        {loading && !liveData && (
          <div className="lq-state-msg">Loading live queue…</div>
        )}
        {error && !liveData && (
          <div className="lq-state-msg lq-state-msg--error">{error}</div>
        )}
        {actionError && (
          <div className="lq-state-msg lq-state-msg--error lq-action-error" role="alert">
            {actionError}
            <button
              type="button"
              className="lq-action-error-dismiss"
              onClick={() => setActionError(null)}
              aria-label={t("dismiss") || "Dismiss"}
            >
              ×
            </button>
          </div>
        )}

        {/* Current user card – always shown once data is loaded */}
        {!loading && liveData && (
          <section
            className={`lq-currentCard${!current ? " lq-currentCard--idle" : ""}${employeeOnLeave ? " lq-currentCard--onLeave" : ""}`}
            aria-label={t("currentServing") || "Current Serving"}
          >
            <div className="lq-currentCard__bar" aria-hidden />

            {employeeOnLeave ? (
              /* ── Employee on leave – view only ── */
              <>
                <div className="lq-currentCard__main">
                  <div className="lq-currentCard__avatar lq-currentCard__avatar--idle" aria-hidden>
                    🏖
                  </div>
                  <div className="lq-currentCard__info">
                    <div className="lq-currentCard__topRow">
                      <div className="lq-currentCard__name lq-currentCard__name--idle">
                        {t("employeeOnLeaveTitle") || "You're on leave today"}
                      </div>
                    </div>
                    <div className="lq-currentCard__subRow">
                      <span>
                        {t("employeeOnLeaveHint") || "Queue is view-only. Start, Stop, and Next are disabled."}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : current ? (
              /* ── Active user ── */
              <>
                <div className="lq-currentCard__main">
                  <div className="lq-currentCard__avatar" aria-hidden>
                    {(current.full_name || "?").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="lq-currentCard__info">
                    <div className="lq-currentCard__topRow">
                      <div className="lq-currentCard__name">{current.full_name}</div>
                      <span className="lq-badge lq-badge--apptType" data-type={current.appointment_type || "QUEUE"}>
                        {appointmentTypeLabel(current.appointment_type)}
                      </span>
                      <span className="lq-badge lq-badge--progress">
                        {t("inProgress") || "In Progress"}
                      </span>
                    </div>
                    {current.est_remaining_label && (
                      <div className="lq-currentCard__delay">
                        {current.est_remaining_label}
                      </div>
                    )}
                    {current.appointment_type === "APPROXIMATE" &&
                      current.delay_minutes != null &&
                      current.delay_minutes > 0 && (
                        <div className="lq-currentCard__delay">
                          {t("runningLate") || "Running"} ~{current.delay_minutes} {t("minLate") || "min late"}
                        </div>
                      )}
                    {(() => {
                      const scheduled = formatScheduledLabel(current);
                      return scheduled ? (
                        <div className="lq-currentCard__scheduled">
                          <span className="lq-currentCard__scheduledLabel">
                            {t(scheduled.labelKey)}:
                          </span>{" "}
                          <strong>{scheduled.value}</strong>
                        </div>
                      ) : null;
                    })()}
                    <div className="lq-currentCard__subRow">
                      <span>{current.phone}</span>
                      <span className="lq-sep" aria-hidden />
                      <span>
                        {t("tokenNumber") || "Token"} <strong>{current.token}</strong>
                      </span>
                      {current.expected_at_label && (
                        <>
                          <span className="lq-sep" aria-hidden />
                          <span>
                            {t("expectedAt") || "Expected at"}{" "}
                            <strong>{current.expected_at_label}</strong>
                          </span>
                        </>
                      )}
                      {current.time_label && (
                        <>
                          <span className="lq-sep" aria-hidden />
                          <span>
                            {t("startedAt") || "Started"}{" "}
                            <strong>{current.time_label}</strong>
                          </span>
                        </>
                      )}
                    </div>
                    {current.service_summary && (
                      <div className="lq-currentCard__service">
                        {current.service_summary}
                      </div>
                    )}
                  </div>
                </div>
                <div className="lq-currentCard__actions">
                  <button
                    type="button"
                    className="lq-nextBtn"
                    onClick={handleNext}
                    disabled={nextLoading || actionsDisabled}
                  >
                    {nextLoading ? "…" : t("next") || "Next"}
                  </button>
                </div>
              </>
            ) : (
              /* ── No current user – idle state ── */
              <>
                <div className="lq-currentCard__main">
                  <div className="lq-currentCard__avatar lq-currentCard__avatar--idle" aria-hidden>
                    {waiting.length > 0 ? "⏳" : completedCount > 0 ? "✓" : "—"}
                  </div>
                  <div className="lq-currentCard__info">
                    <div className="lq-currentCard__topRow">
                      <div className="lq-currentCard__name lq-currentCard__name--idle">
                        {waiting.length > 0
                          ? isRunning
                            ? t("readyToServe") || "Ready to serve next customer"
                            : t("waitingToStart") || "Queue not started yet"
                          : completedCount > 0
                          ? t("allServed") || "All customers have been served"
                          : t("queueEmpty") || "Queue is empty"}
                      </div>
                    </div>
                    <div className="lq-currentCard__subRow">
                      {waiting.length > 0 && isRunning && (
                        <span>
                          {t("nextUp") || "Next up"}{" "}
                          <strong>{waiting[0]?.token}</strong>
                          {" · "}
                          {waiting[0]?.full_name}
                        </span>
                      )}
                      {waiting.length > 0 && !isRunning && (
                        <span>
                          {t("startQueueHint") || "Start the queue to begin serving customers"}
                        </span>
                      )}
                      {waiting.length === 0 && (
                        <span>
                          {completedCount > 0
                            ? `${completedCount} ${t("customersServedToday") || "customer(s) served today"}`
                            : t("noCustomersYet") || "No customers in queue"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                {/* Show Next button only when there are waiting users and queue is running (and not on leave) */}
                {waiting.length > 0 && isRunning && !actionsDisabled && (
                  <div className="lq-currentCard__actions">
                    <button
                      type="button"
                      className="lq-nextBtn"
                      onClick={handleNext}
                      disabled={nextLoading}
                    >
                      {nextLoading ? "…" : t("next") || "Next"}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Continuous vertical timeline */}
        {timelineItems.length > 0 && (
          <section
            className="lq-timeline"
            aria-label={t("liveQueue") || "Live Queue"}
          >
            <div className="lq-timeline__rail">
              {timelineItems.map((item) => (
                <div
                  key={item.id}
                  className={`lq-timelineItem lq-timelineItem--${item.status}`}
                  data-status={item.status}
                >
                  <div className="lq-timelineItem__nodeWrap">
                    <span
                      className={`lq-node lq-node--${item.status}`}
                      aria-hidden
                    >
                      {item.status === "done" ? "✓" : null}
                    </span>
                  </div>
                  <div className="lq-timelineItem__content">
                    <article className={`lq-row lq-row--${item.status}`}>
                      <div className="lq-row__left">
                        <div className="lq-row__avatar" aria-hidden>
                          {(item.user.full_name || "?").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="lq-row__meta">
                          <div className="lq-row__top">
                            <span className="lq-row__name">{item.user.full_name}</span>
                            {item.user.token && (
                              <span className="lq-tokenChip">{item.user.token}</span>
                            )}
                            <span className="lq-badge lq-badge--apptType" data-type={item.user.appointment_type || "QUEUE"}>
                              {appointmentTypeLabel(item.user.appointment_type)}
                            </span>
                            <span className={`lq-badge lq-badge--${item.status}`}>
                              {item.status === "done"
                                ? t("completed") || "Completed"
                                : item.status === "progress"
                                ? t("inProgress") || "In Progress"
                                : t("waiting") || "Waiting"}
                            </span>
                          </div>
                          <div className="lq-row__sub">
                            <span>{item.user.phone}</span>
                            {item.user.service_summary && (
                              <>
                                <span className="lq-sep" aria-hidden />
                                <span>{item.user.service_summary}</span>
                              </>
                            )}
                            {item.user.appointment_type === "APPROXIMATE" &&
                              item.user.delay_minutes != null &&
                              item.user.delay_minutes > 0 && (
                                <>
                                  <span className="lq-sep" aria-hidden />
                                  <span className="lq-row__delay">
                                    ~{item.user.delay_minutes} {t("minLate") || "min late"}
                                  </span>
                                </>
                              )}
                          </div>
                        </div>
                      </div>
                      <div className="lq-row__right">
                        {(() => {
                          const scheduled = formatScheduledLabel(item.user);
                          return scheduled ? (
                            <span className="lq-row__scheduled">
                              {t(scheduled.labelKey)} {scheduled.value}
                            </span>
                          ) : null;
                        })()}
                        {item.user.position != null && (
                          <span className="lq-row__position">
                            {t("position") || "Position"} #{item.user.position}
                          </span>
                        )}
                        {item.status === "progress" && item.user.est_remaining_label && (
                          <span className="lq-row__est">
                            {item.user.est_remaining_label}
                          </span>
                        )}
                        {item.status !== "progress" && item.user.estimated_wait_label && (
                          <span className="lq-row__est">
                            {t("est") || "Est."} {item.user.estimated_wait_label}
                          </span>
                        )}
                        {item.user.expected_at_label && (
                          <span className="lq-row__expected">
                            {t("expectedAt") || "Expected at"} {item.user.expected_at_label}
                          </span>
                        )}
                        {item.user.time_label && !item.user.expected_at_label && (
                          <span className="lq-time">{item.user.time_label}</span>
                        )}
                      </div>
                    </article>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {showAddCustomer && businessId && (
        <AddCustomerModal
          queueId={queues.length <= 1 ? selectedQueueId ?? undefined : undefined}
          queues={queues.map((q) => ({ id: String(q.uuid), name: q.name }))}
          businessId={businessId}
          onClose={() => setShowAddCustomer(false)}
          onSuccess={() => {
            if (selectedQueueId) fetchLiveQueue(selectedQueueId);
          }}
        />
      )}
    </div>
  );
};

export default LiveQueue;
