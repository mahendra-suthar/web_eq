import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { useUserStore } from "../../utils/userStore";
import { ProfileType } from "../../utils/constants";
import { ProfileService } from "../../services/profile/profile.service";
import {
  ScheduleService,
  type PendingLeave,
  type ScheduleExceptionData,
  type LeaveScope,
} from "../../services/schedule/schedule.service";
import { EmployeeService, type EmployeeResponse } from "../../services/employee/employee.service";
import { ConfirmModal } from "../../components/confirm-modal";
import {
  todayISO,
  relativeLabel,
  leaveTypeLabel,
  getInitials,
  groupLeaves,
  spanLabel,
  dayCountLabel,
  summarize,
  type LeaveGroup,
} from "./leave.utils";
import "../../components/leave-approvals/leave-approvals.scss";
import "./leave.scss";

const STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "leave-status--pending" },
  APPROVED: { label: "Approved", cls: "leave-status--approved" },
  REJECTED: { label: "Rejected", cls: "leave-status--rejected" },
  MIXED: { label: "Mixed", cls: "leave-status--pending" },
};
function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, cls: "leave-status--pending" };
  return <span className={`leave-status ${meta.cls}`}>{meta.label}</span>;
}
function Avatar({ name }: { name: string }) {
  return <span className="leave-avatar" aria-hidden="true">{getInitials(name)}</span>;
}
function RequestedByTag({ role }: { role?: string | null }) {
  const employee = role === "EMPLOYEE";
  return (
    <span className={`leave-by ${employee ? "leave-by--employee" : "leave-by--business"}`}>
      {employee ? "Requested" : "Marked by business"}
    </span>
  );
}

/* ── small shared UI ─────────────────────────────────────────────────────────── */
function Segmented<T extends string>({ options, value, onChange, ariaLabel }: {
  options: { key: T; label: string }[]; value: T; onChange: (v: T) => void; ariaLabel: string;
}) {
  return (
    <div className="leave-scope" role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          role="tab"
          aria-selected={value === o.key}
          className={`leave-scope__btn${value === o.key ? " is-active" : ""}`}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
const SCOPES: { key: LeaveScope; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];
function SkeletonList() {
  return (
    <ul className="leave-list">
      {[0, 1].map((i) => (
        <li key={i} className="leave-request leave-request--sk">
          <span className="skeleton-cell skeleton-cell--avatar" />
          <div className="leave-sk-lines">
            <span className="skeleton-cell skeleton-cell--med" />
            <span className="skeleton-cell skeleton-cell--short" />
          </div>
        </li>
      ))}
    </ul>
  );
}
function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="empty-state empty-state--compact">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      <div className="empty-state-sub">{sub}</div>
    </div>
  );
}

/* ── shared leave create form (full/custom hours + date range) ───────────────── */
type LeaveType = "full" | "custom";

function LeaveForm({ mode, fixedEntityId, employees, onCreated }: {
  mode: "business" | "employee";
  fixedEntityId?: string;
  employees?: EmployeeResponse[];
  onCreated: () => void;
}) {
  const scheduleService = useMemo(() => new ScheduleService(), []);
  const today = useMemo(() => todayISO(), []);

  const [employeeId, setEmployeeId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [type, setType] = useState<LeaveType>("full");
  const [openTime, setOpenTime] = useState("09:00");
  const [closeTime, setCloseTime] = useState("13:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setStart(""); setEnd(""); setReason(""); setType("full"); };

  const submit = async () => {
    const entityId = mode === "business" ? employeeId : (fixedEntityId ?? "");
    if (mode === "business" && !entityId) { toast.error("Pick an employee first"); return; }
    if (!start) { toast.error("Pick a start date first"); return; }
    if (end && end < start) { toast.error("End date can't be before the start date"); return; }
    if (type === "custom" && openTime >= closeTime) { toast.error("Opening time must be before closing time"); return; }
    if (!reason.trim()) { toast.error("Please add a reason"); return; }

    setSubmitting(true);
    try {
      const result = await scheduleService.createLeaveRange({
        entity_type: "EMPLOYEE",
        entity_id: entityId,
        start_date: start,
        end_date: end || start,
        is_closed: type === "full",
        special_opening_time: type === "custom" ? openTime : null,
        special_closing_time: type === "custom" ? closeTime : null,
        reason: reason.trim(),
      });
      toast.success(summarize(result, mode === "business" ? "Marked" : "Requested"));
      reset();
      onCreated();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || "Couldn't save the leave. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="leave-card-body">
      <div className="leave-mark-form">
        {mode === "business" && (
          <div className="leave-field">
            <label className="info-label" htmlFor="lf-employee">Employee</label>
            <select id="lf-employee" className="filter-select" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={submitting || (employees?.length ?? 0) === 0}>
              <option value="">{(employees?.length ?? 0) === 0 ? "No employees" : "Select employee…"}</option>
              {employees?.map((e) => <option key={e.uuid} value={e.uuid}>{e.full_name}</option>)}
            </select>
          </div>
        )}
        <div className="leave-field">
          <label className="info-label" htmlFor="lf-start">From</label>
          <input id="lf-start" type="date" className="info-input" min={today} value={start} onChange={(e) => setStart(e.target.value)} disabled={submitting} />
        </div>
        <div className="leave-field">
          <label className="info-label" htmlFor="lf-end">To <span className="leave-field-opt">(optional)</span></label>
          <input id="lf-end" type="date" className="info-input" min={start || today} value={end} onChange={(e) => setEnd(e.target.value)} disabled={submitting || !start} />
        </div>
        <div className="leave-field leave-field--grow">
          <label className="info-label" htmlFor="lf-reason">Reason</label>
          <input id="lf-reason" type="text" className="info-input" placeholder="e.g. Sick, personal" value={reason} maxLength={120} required onChange={(e) => setReason(e.target.value)} disabled={submitting} />
        </div>
      </div>

      <div className="leave-type-row">
        <span className="info-label">Type</span>
        <Segmented<LeaveType>
          ariaLabel="Leave type"
          value={type}
          onChange={setType}
          options={[{ key: "full", label: "Full day off" }, { key: "custom", label: "Custom hours" }]}
        />
        {type === "custom" && (
          <div className="leave-hours">
            <input type="time" className="info-input" value={openTime} onChange={(e) => setOpenTime(e.target.value)} disabled={submitting} aria-label="Opening time" />
            <span className="leave-hours__sep">to</span>
            <input type="time" className="info-input" value={closeTime} onChange={(e) => setCloseTime(e.target.value)} disabled={submitting} aria-label="Closing time" />
          </div>
        )}
        <button type="button" className="btn btn-primary leave-submit" onClick={submit} disabled={submitting || !start || !reason.trim() || (mode === "business" && !employeeId)}>
          {submitting ? "Saving…" : mode === "business" ? "Mark leave" : "Request leave"}
        </button>
      </div>

      <p className="leave-hint">
        {mode === "business"
          ? "Business-marked leave is approved immediately. A date range applies to every working day in it; non-working days are skipped."
          : "Your request is sent to the business for approval and only blocks bookings once approved. A range covers every working day in it."}
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Business view
 * ───────────────────────────────────────────────────────────────────────────── */
function BusinessLeaveView({ businessId }: { businessId: string }) {
  const scheduleService = useMemo(() => new ScheduleService(), []);
  const employeeService = useMemo(() => new EmployeeService(), []);

  const [pending, setPending] = useState<PendingLeave[]>([]);
  const [upcoming, setUpcoming] = useState<PendingLeave[]>([]);
  const [scopeData, setScopeData] = useState<PendingLeave[]>([]);
  const [employees, setEmployees] = useState<EmployeeResponse[]>([]);

  const [loadingTop, setLoadingTop] = useState(true);
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [actingKey, setActingKey] = useState<string | null>(null);

  const [scope, setScope] = useState<LeaveScope>("upcoming");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [confirmRemove, setConfirmRemove] = useState<LeaveGroup<PendingLeave> | null>(null);
  const [removing, setRemoving] = useState(false);

  const loadTop = useCallback(async () => {
    const [p, u] = await Promise.allSettled([
      scheduleService.getPendingLeaves(businessId),
      scheduleService.getBusinessLeaves(businessId, "upcoming"),
    ]);
    setPending(p.status === "fulfilled" ? p.value ?? [] : []);
    setUpcoming(u.status === "fulfilled" ? u.value ?? [] : []);
  }, [scheduleService, businessId]);

  const loadScope = useCallback(async (s: LeaveScope) => {
    if (s === "upcoming") return;
    setLoadingRoster(true);
    try {
      setScopeData(await scheduleService.getBusinessLeaves(businessId, s));
    } catch {
      setScopeData([]);
    } finally {
      setLoadingRoster(false);
    }
  }, [scheduleService, businessId]);

  useEffect(() => {
    if (!businessId) return;
    setLoadingTop(true);
    setLoadingRoster(true);
    Promise.allSettled([
      loadTop(),
      employeeService.getEmployees(businessId, 1, 100).then((r) => setEmployees(r.items ?? [])),
    ]).finally(() => { setLoadingTop(false); setLoadingRoster(false); });
  }, [businessId, loadTop, employeeService]);

  useEffect(() => { if (scope !== "upcoming") loadScope(scope); }, [scope, loadScope]);

  const refresh = useCallback(async () => {
    await loadTop();
    if (scope !== "upcoming") await loadScope(scope);
  }, [loadTop, loadScope, scope]);

  const reviewGroup = async (g: LeaveGroup<PendingLeave>, approve: boolean) => {
    setActingKey(g.key);
    try {
      if (g.groupId) await scheduleService.reviewGroup(g.groupId, approve);
      else await scheduleService.reviewException(g.first.uuid, approve);
      toast.success(approve ? "Leave approved" : "Leave rejected");
      await refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || "Couldn't update the request. Please try again.");
    } finally {
      setActingKey(null);
    }
  };

  const doRemove = async () => {
    if (!confirmRemove) return;
    const g = confirmRemove;
    setRemoving(true);
    try {
      if (g.groupId) await scheduleService.deleteGroup(g.groupId);
      else await scheduleService.deleteException(g.first.schedule_id, g.first.exception_date);
      toast.success("Leave removed");
      setConfirmRemove(null);
      await refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || "Couldn't remove the leave. Please try again.");
    } finally {
      setRemoving(false);
    }
  };

  const pendingGroups = groupLeaves(pending);
  const rosterRows = scope === "upcoming" ? upcoming : scopeData;
  const filteredRoster = rosterRows.filter(
    (l) => (!employeeFilter || l.employee_id === employeeFilter) && (!statusFilter || l.status === statusFilter)
  );
  const rosterGroups = groupLeaves(filteredRoster);

  return (
    <div className="leave-page">
      {/* Pending approvals — only while loading or when something needs action */}
      {(loadingTop || pendingGroups.length > 0) && (
        <div className="content-card">
          <div className="card-header">
            <h2 className="card-title">Pending approvals{pendingGroups.length > 0 ? ` (${pendingGroups.length})` : ""}</h2>
          </div>
          <div className="leave-card-body">
            {loadingTop ? (
              <SkeletonList />
            ) : (
              <ul className="leave-list">
                {pendingGroups.map((g) => (
                  <li key={g.key} className="leave-request">
                    <Avatar name={g.first.employee_name} />
                    <div className="leave-request__info">
                      <span className="leave-request__name">{g.first.employee_name}</span>
                      <span className="leave-request__meta">
                        <span className="leave-request__date">{spanLabel(g)}</span>
                        {g.count > 1 && <span className="leave-chip">{dayCountLabel(g.count)}</span>}
                        <span className="leave-dot">·</span>
                        <span className="leave-request__rel">{relativeLabel(g.startDate)}</span>
                        <span className="leave-dot">·</span>
                        <span className="leave-request__type">{leaveTypeLabel(g.first)}</span>
                      </span>
                      {g.first.reason && <span className="leave-request__reason">“{g.first.reason}”</span>}
                    </div>
                    <div className="leave-request__actions">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={actingKey === g.key} onClick={() => reviewGroup(g, false)}>Reject</button>
                      <button type="button" className="btn btn-primary btn-sm" disabled={actingKey === g.key} onClick={() => reviewGroup(g, true)}>
                        {actingKey === g.key ? "…" : "Approve"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Mark leave */}
      <div className="content-card">
        <div className="card-header"><h2 className="card-title">Mark leave for an employee</h2></div>
        <LeaveForm mode="business" employees={employees} onCreated={refresh} />
      </div>

      {/* Roster */}
      <div className="content-card">
        <div className="card-header leave-roster-header">
          <h2 className="card-title">Leave roster</h2>
          <Segmented<LeaveScope> ariaLabel="Leave window" value={scope} onChange={setScope} options={SCOPES} />
        </div>
        <div className="card-header leave-filters-row">
          <select className="filter-select" value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
            <option value="">All employees</option>
            {employees.map((e) => <option key={e.uuid} value={e.uuid}>{e.full_name}</option>)}
          </select>
          <select className="filter-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr><th>Employee</th><th>Dates</th><th>Type</th><th>Reason</th><th>Source</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {loadingRoster ? (
                [0, 1, 2].map((i) => (
                  <tr key={i} className="skeleton-row">
                    {[0, 1, 2, 3, 4, 5, 6].map((j) => <td key={j}><span className="skeleton-cell skeleton-cell--med" /></td>)}
                  </tr>
                ))
              ) : rosterGroups.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon="🌴" title="No leave to show" sub={scope === "upcoming" ? "No upcoming leave for your team." : "Nothing matches this view."} /></td></tr>
              ) : (
                rosterGroups.map((g) => (
                  <tr key={g.key}>
                    <td><div className="leave-cell-emp"><Avatar name={g.first.employee_name} /><span>{g.first.employee_name}</span></div></td>
                    <td>
                      <div className="leave-cell-date">
                        <span>{spanLabel(g)}{g.count > 1 ? ` · ${dayCountLabel(g.count)}` : ""}</span>
                        <span className="leave-cell-rel">{relativeLabel(g.startDate)}</span>
                      </div>
                    </td>
                    <td>{leaveTypeLabel(g.first)}</td>
                    <td className="leave-cell-reason">{g.first.reason ? `“${g.first.reason}”` : <span className="leave-muted">—</span>}</td>
                    <td><RequestedByTag role={g.first.created_by_role} /></td>
                    <td><StatusBadge status={g.status} /></td>
                    <td className="leave-row-actions">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmRemove(g)}>Remove</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {confirmRemove && (
        <ConfirmModal
          title="Remove leave"
          message={<>Remove <strong>{confirmRemove.first.employee_name}</strong>’s leave on <strong>{spanLabel(confirmRemove)}</strong>{confirmRemove.count > 1 ? ` (${dayCountLabel(confirmRemove.count)})` : ""}? This frees {confirmRemove.count > 1 ? "those days" : "that day"} for bookings.</>}
          confirmLabel="Remove leave"
          cancelLabel="Keep"
          destructive
          loading={removing}
          onConfirm={doRemove}
          onCancel={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Employee view
 * ───────────────────────────────────────────────────────────────────────────── */
function EmployeeLeaveView({ employeeId }: { employeeId: string }) {
  const scheduleService = useMemo(() => new ScheduleService(), []);

  const [mine, setMine] = useState<ScheduleExceptionData[]>([]);
  const [scope, setScope] = useState<LeaveScope>("upcoming");
  const [loading, setLoading] = useState(true);

  const [confirmCancel, setConfirmCancel] = useState<LeaveGroup<ScheduleExceptionData> | null>(null);
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async (s: LeaveScope) => {
    setLoading(true);
    try {
      setMine(await scheduleService.getMyExceptions(s));
    } catch {
      setMine([]);
    } finally {
      setLoading(false);
    }
  }, [scheduleService]);

  useEffect(() => { if (employeeId) load(scope); }, [employeeId, scope, load]);

  const onCreated = () => { if (scope === "upcoming") load("upcoming"); else setScope("upcoming"); };

  const doCancel = async () => {
    if (!confirmCancel) return;
    const g = confirmCancel;
    setCanceling(true);
    try {
      if (g.groupId) await scheduleService.deleteGroup(g.groupId);
      else await scheduleService.deleteException(g.first.schedule_id, g.first.exception_date);
      toast.success("Leave request cancelled");
      setConfirmCancel(null);
      await load(scope);
    } catch (err: unknown) {
      toast.error((err as { message?: string })?.message || "Couldn't cancel the request. Please try again.");
    } finally {
      setCanceling(false);
    }
  };

  const groups = groupLeaves(mine);

  return (
    <div className="leave-page">
      <div className="content-card">
        <div className="card-header"><h2 className="card-title">Request a day off</h2></div>
        <LeaveForm mode="employee" fixedEntityId={employeeId} onCreated={onCreated} />
      </div>

      <div className="content-card">
        <div className="card-header leave-roster-header">
          <h2 className="card-title">My leave</h2>
          <Segmented<LeaveScope> ariaLabel="Leave window" value={scope} onChange={setScope} options={SCOPES} />
        </div>
        <div className="leave-card-body">
          {loading ? (
            <SkeletonList />
          ) : groups.length === 0 ? (
            <EmptyState icon="🌴" title="No leave to show" sub={scope === "upcoming" ? "You have no upcoming leave." : "Nothing in this view yet."} />
          ) : (
            <ul className="leave-list">
              {groups.map((g) => {
                const own = g.first.created_by_role === "EMPLOYEE";
                const cancellable = own && g.rows.every((r) => r.status === "PENDING");
                return (
                  <li key={g.key} className="leave-request">
                    <span className={`leave-type-ico${g.first.is_closed ? "" : " leave-type-ico--hours"}`} aria-hidden="true">
                      {g.first.is_closed ? "🌴" : "🕐"}
                    </span>
                    <div className="leave-request__info">
                      <span className="leave-request__meta leave-request__meta--lead">
                        <span className="leave-request__date">{spanLabel(g)}</span>
                        {g.count > 1 && <span className="leave-chip">{dayCountLabel(g.count)}</span>}
                        <span className="leave-dot">·</span>
                        <span className="leave-request__rel">{relativeLabel(g.startDate)}</span>
                        <span className="leave-dot">·</span>
                        <span className="leave-request__type">{leaveTypeLabel(g.first)}</span>
                        {!own && (<><span className="leave-dot">·</span><RequestedByTag role={g.first.created_by_role} /></>)}
                      </span>
                      {g.first.reason && <span className="leave-request__reason">“{g.first.reason}”</span>}
                    </div>
                    <div className="leave-request__actions">
                      <StatusBadge status={g.status} />
                      {cancellable && (
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmCancel(g)}>Cancel</button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {confirmCancel && (
        <ConfirmModal
          title="Cancel leave request"
          message={<>Cancel your leave request for <strong>{spanLabel(confirmCancel)}</strong>{confirmCancel.count > 1 ? ` (${dayCountLabel(confirmCancel.count)})` : ""}?</>}
          confirmLabel="Cancel request"
          cancelLabel="Keep"
          destructive
          loading={canceling}
          onConfirm={doCancel}
          onCancel={() => setConfirmCancel(null)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Page entry: role-aware
 * ───────────────────────────────────────────────────────────────────────────── */
export default function LeavePage() {
  const profile = useUserStore((s) => s.profile);
  const setProfile = useUserStore((s) => s.setProfile);
  const profileType = useUserStore((s) => s.getProfileType());
  const businessId = useUserStore((s) => s.getBusinessId());
  const employeeId = useUserStore((s) => s.getEmployeeId());

  const [loadingProfile, setLoadingProfile] = useState(!profile);

  useEffect(() => {
    if (profile) { setLoadingProfile(false); return; }
    let active = true;
    new ProfileService()
      .getProfile()
      .then((p) => { if (active) setProfile(p); })
      .catch(() => undefined)
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [profile, setProfile]);

  if (loadingProfile) {
    return (
      <div className="leave-page">
        <div className="content-card"><div className="leave-card-body"><p className="leave-muted">Loading…</p></div></div>
      </div>
    );
  }

  if (profileType === ProfileType.EMPLOYEE && employeeId) {
    return <EmployeeLeaveView employeeId={employeeId} />;
  }
  if (profileType === ProfileType.BUSINESS && businessId) {
    return <BusinessLeaveView businessId={businessId} />;
  }
  return (
    <div className="leave-page">
      <div className="content-card"><div className="leave-card-body"><p className="leave-muted">Leave management isn't available for this account.</p></div></div>
    </div>
  );
}
