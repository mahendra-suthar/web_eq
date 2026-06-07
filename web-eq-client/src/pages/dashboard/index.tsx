import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../utils/userStore';
import { ProfileType, QueueStatus, QueueUserStatus, BusinessStatus } from '../../utils/constants';
import {
  QueueService, QueueData, LiveQueueData, QueueUserData,
} from '../../services/queue/queue.service';
import { EmployeeService } from '../../services/employee/employee.service';
import { ProfileService } from '../../services/profile/profile.service';
import { UserService } from '../../services/user/user.service';
import type { UnifiedProfileResponse } from '../../services/profile/profile.service';
import { getInitials, getAvatarBackground } from '../../utils/utils';
import { RouterConstant } from '../../routers';
import './dashboard.scss';

interface BusinessData {
  queues: QueueData[];
  liveQueues: Record<string, LiveQueueData>;
  employeeCount: number;
  totalCustomers: number | null; // unique users with any appointment; null if the count fetch failed
  recentUsers: QueueUserData[];
}

interface EmployeeQueueData {
  liveQueue: LiveQueueData | null;
  recentUsers: QueueUserData[];
}

function formatLastUpdated(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  return mins === 1 ? '1 min ago' : `${mins} mins ago`;
}

function formatQueueDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const today = new Date();
  const isToday =
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear();
  return isToday
    ? 'Today'
    : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getUserStatusLabel(status: number | null | undefined): string {
  switch (status) {
    case QueueUserStatus.REGISTERED:         return 'Waiting';
    case QueueUserStatus.IN_PROGRESS:        return 'In Progress';
    case QueueUserStatus.COMPLETED:          return 'Completed';
    case QueueUserStatus.FAILED:             return 'Failed';
    case QueueUserStatus.CANCELLED:          return 'Cancelled';
    case QueueUserStatus.PRIORITY_REQUESTED: return 'Priority';
    default: return '—';
  }
}

function getUserStatusClass(status: number | null | undefined): string {
  switch (status) {
    case QueueUserStatus.REGISTERED:         return 'waiting';
    case QueueUserStatus.IN_PROGRESS:        return 'in-progress';
    case QueueUserStatus.COMPLETED:          return 'completed';
    case QueueUserStatus.FAILED:             return 'failed';
    case QueueUserStatus.CANCELLED:          return 'cancelled';
    case QueueUserStatus.PRIORITY_REQUESTED: return 'priority';
    default: return '';
  }
}

function getQueueStatusText(status: number | null | undefined): string {
  if (status === QueueStatus.RUNNING)    return 'Running';
  if (status === QueueStatus.STOPPED)    return 'Stopped';
  if (status === QueueStatus.REGISTERED) return 'Registered';
  return '—';
}

function getQueueStatusCls(status: number | null | undefined): string {
  if (status === QueueStatus.RUNNING)    return 'running';
  if (status === QueueStatus.STOPPED)    return 'stopped';
  if (status === QueueStatus.REGISTERED) return 'registered';
  return '';
}

function approvalBannerVariant(status: number): string {
  if (status === BusinessStatus.SUSPENDED) return 'suspended';
  if (status === BusinessStatus.TERMINATED) return 'terminated';
  return 'pending';
}

function approvalBannerIcon(status: number): string {
  if (status === BusinessStatus.SUSPENDED) return '⚠️';
  if (status === BusinessStatus.TERMINATED) return '🚫';
  return '⏳';
}

function approvalBannerTitle(status: number): string {
  if (status === BusinessStatus.SUSPENDED) return 'Account Suspended';
  if (status === BusinessStatus.TERMINATED) return 'Account Terminated';
  return 'Pending Approval';
}

function approvalBannerBody(status: number): string {
  if (status === BusinessStatus.SUSPENDED)
    return 'Your business has been suspended. Please contact support.';
  if (status === BusinessStatus.TERMINATED)
    return 'This business account has been terminated.';
  if (status === BusinessStatus.DRAFT)
    return 'Complete your business registration to go live.';
  return 'Your business is under review. Customers cannot find you until approved by the admin.';
}

function isBusinessOpenToday(profile: UnifiedProfileResponse | null): boolean | null {
  if (!profile) return null;
  if (profile.schedule?.is_always_open || profile.business?.is_always_open) return true;
  if (!profile.schedule?.schedules?.length) return null;
  const todayDow = new Date().getDay();
  const sched = profile.schedule.schedules.find(s => s.day_of_week === todayDow);
  if (!sched) return null;
  return sched.is_open;
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { profile, setProfile, getProfileType, getBusinessId, getEmployeeId } = useUserStore();
  const profileType = getProfileType();
  const businessId = getBusinessId();
  const employeeId = getEmployeeId();
  const employeeQueueId = profile?.employee?.queue_id ?? null;
  const queueService = useMemo(() => new QueueService(), []);
  const employeeService = useMemo(() => new EmployeeService(), []);
  const profileService = useMemo(() => new ProfileService(), []);
  const userService = useMemo(() => new UserService(), []);
  const [businessData, setBusinessData] = useState<BusinessData | null>(null);
  const [empData, setEmpData] = useState<EmployeeQueueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const genRef = useRef(0);
  const fetchData = useCallback(async (isRefresh = false) => {
    if (!businessId) return;

    genRef.current += 1;
    const gen = genRef.current;

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      if (profileType === ProfileType.BUSINESS) {
        const [fetchedQueues, fetchedEmployees, customersTotal] = await Promise.all([
          queueService.getQueues(businessId),
          employeeService.getEmployees(businessId, 1, 50).then((r) => r.items),
          // Unique customers (any appointment status). Secondary stat — never fatal:
          // limit:1 keeps the payload minimal since only the `total` count is needed.
          userService
            .getUsersAppointments({ business_id: businessId, page: 1, limit: 1 })
            .then((r) => r.total)
            .catch(() => null),
        ]);

        if (gen !== genRef.current) return;
        const liveResults =
          fetchedQueues.length > 0
            ? await Promise.allSettled(
                fetchedQueues.map(q => queueService.getLiveQueue(q.uuid))
              )
            : [];

        if (gen !== genRef.current) return;
        const liveMap: Record<string, LiveQueueData> = {};
        liveResults.forEach((r, i) => {
          if (r.status === 'fulfilled') liveMap[fetchedQueues[i].uuid] = r.value;
        });

        const recentUsers = (await queueService.getQueueUsers(
          businessId, undefined, undefined, 1, 8
        )).items;

        if (gen !== genRef.current) return;

        setBusinessData({
          queues:         fetchedQueues,
          liveQueues:     liveMap,
          employeeCount:  fetchedEmployees.length,
          totalCustomers: customersTotal,
          recentUsers,
        });

      } else if (profileType === ProfileType.EMPLOYEE) {
        const hasQueue = !!employeeQueueId;

        const [liveResult, usersResult] = await Promise.allSettled([
          hasQueue ? queueService.getLiveQueue(employeeQueueId!) : Promise.resolve(null),
          queueService.getQueueUsers(
            businessId,
            employeeQueueId || undefined,
            employeeId      || undefined,
            1,
            8
          ),
        ]);

        if (gen !== genRef.current) return;

        const liveQueue: LiveQueueData | null =
          liveResult.status === 'fulfilled' ? (liveResult.value as LiveQueueData | null) : null;
        const recentUsers: QueueUserData[] =
          usersResult.status === 'fulfilled' ? (usersResult.value as { items: QueueUserData[] }).items : [];

        setEmpData({ liveQueue, recentUsers });
      }

      setLastUpdated(new Date());
    } catch (err: any) {
      if (gen !== genRef.current) return;
      const msg =
        err?.response?.data?.detail?.message ||
        err?.message ||
        'Failed to load dashboard data.';
      setError(msg);
    } finally {
      if (gen === genRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [businessId, employeeId, employeeQueueId, profileType, queueService, employeeService, userService]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // Refetch immediately when the user returns to the tab after being away.
  useEffect(() => {
    const onResumed = () => fetchData(true);
    window.addEventListener("app:resumed", onResumed);
    return () => window.removeEventListener("app:resumed", onResumed);
  }, [fetchData]);

  // Refresh profile on mount and on tab resume so business.status is always current.
  // Profile changes are rare (admin approval), so polling every 60s would be wasteful.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      profileService.getProfile()
        .then((fresh) => { if (!cancelled) setProfile(fresh); })
        .catch(() => {});
    };
    refresh();
    const onResumed = () => refresh();
    window.addEventListener("app:resumed", onResumed);
    return () => {
      cancelled = true;
      window.removeEventListener("app:resumed", onResumed);
    };
  }, [profileService, setProfile]);

  useEffect(() => {
    if (!lastUpdated) return;
    const tick = () => setLastUpdatedLabel(formatLastUpdated(lastUpdated));
    tick();
    const t = setInterval(tick, 15_000);
    return () => clearInterval(t);
  }, [lastUpdated]);

  const totalCustomersToday = useMemo(
    () =>
      Object.values(businessData?.liveQueues ?? {}).reduce(
        (sum, lq) => sum + lq.waiting_count + lq.in_progress_count + lq.completed_count,
        0
      ),
    [businessData]
  );

  const completedToday = useMemo(
    () =>
      Object.values(businessData?.liveQueues ?? {}).reduce(
        (sum, lq) => sum + lq.completed_count,
        0
      ),
    [businessData]
  );

  const isOpen = isBusinessOpenToday(profile);
  const bizStatus = profile?.business?.status ?? null;
  const showApprovalBanner = bizStatus !== null && bizStatus !== BusinessStatus.ACTIVE;

  // Queue assigned to the owner as a self-employee
  const ownerQueueId = profile?.employee?.queue_id ?? null;
  const ownerLiveQueue = ownerQueueId ? businessData?.liveQueues[ownerQueueId] ?? null : null;
  const ownerQueueName =
    ownerLiveQueue?.queue_name ||
    businessData?.queues.find((q) => q.uuid === ownerQueueId)?.name ||
    'My Queue';

  const DashboardTopBar = ({ statusLeft }: { statusLeft?: React.ReactNode }) => (
    <div className="dashboard-top-bar">
      <div className="dashboard-top-bar__left">{statusLeft}</div>
      {lastUpdated && (
        <div className="dashboard-top-bar__right">
          <span className="refresh-time">Updated {lastUpdatedLabel}</span>
          <button
            type="button"
            className={`btn btn-secondary refresh-btn${refreshing ? ' spinning' : ''}`}
            onClick={() => fetchData(true)}
            disabled={refreshing}
            aria-label="Refresh dashboard"
          >
            ↻&nbsp;{refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      )}
    </div>
  );

  const UsersTable = ({
    users,
    queueNameFn,
  }: {
    users: QueueUserData[];
    queueNameFn?: (qid: string) => string;
  }) => {
    if (users.length === 0) {
      return (
        <div className="empty-table-state">No recent customers yet.</div>
      );
    }
    return (
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              {queueNameFn && <th>Queue</th>}
              <th>Token</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const name = u.user.full_name || `${u.user.country_code} ${u.user.phone_number}`;
              return (
                <tr
                  key={u.uuid}
                  className="clickable-row"
                  onClick={() =>
                    navigate(`${RouterConstant.ROUTERS_PATH.QUEUEUSERS}/${u.uuid}`)
                  }
                >
                  <td>
                    <div className="user-cell">
                      <div
                        className="user-avatar"
                        style={{ background: getAvatarBackground(name) }}
                      >
                        {getInitials(name)}
                      </div>
                      <div className="user-info">
                        <span className="user-name">{name}</span>
                        <span className="user-email">
                          {u.user.country_code}&nbsp;{u.user.phone_number}
                        </span>
                      </div>
                    </div>
                  </td>
                  {queueNameFn && <td>{queueNameFn(u.queue_id)}</td>}
                  <td>{u.token_number || '—'}</td>
                  <td>
                    <span className={`user-status-badge ${getUserStatusClass(u.status)}`}>
                      {getUserStatusLabel(u.status)}
                    </span>
                  </td>
                  <td>{formatQueueDate(u.queue_date)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="stats-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="stat-card skeleton-card">
              <div className="sk sk-label" />
              <div className="sk sk-value" />
            </div>
          ))}
        </div>
        <div className="content-card">
          <div className="sk sk-title" />
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="sk-row">
              <div className="sk sk-avatar" />
              <div className="sk-row-body">
                <div className="sk sk-text" />
                <div className="sk sk-text-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error && !businessData && !empData) {
    return (
      <div className="dashboard-page">
        <div className="content-card dashboard-error-card">
          <div className="error-icon-lg">⚠️</div>
          <h3 className="error-heading">Failed to load dashboard</h3>
          <p className="error-body">{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => fetchData()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (profileType === ProfileType.BUSINESS && businessData) {
    const queueNameFn = (qid: string) =>
      businessData.queues.find(q => q.uuid === qid)?.name || '—';

    return (
      <div className="dashboard-page">
        <DashboardTopBar statusLeft={
          isOpen !== null ? (
            <div className={`biz-status-pill ${isOpen ? 'open' : 'closed'}`}>
              <span className="status-dot" />
              {isOpen ? 'Open today' : 'Closed today — customers will not be queued'}
            </div>
          ) : undefined
        } />

        {/* Approval status banner */}
        {showApprovalBanner && bizStatus !== null && (
          <div className={`approval-status-banner approval-status-banner--${approvalBannerVariant(bizStatus)}`}>
            <span className="approval-status-banner__icon">{approvalBannerIcon(bizStatus)}</span>
            <div>
              <strong>{approvalBannerTitle(bizStatus)}</strong>
              <p>{approvalBannerBody(bizStatus)}</p>
            </div>
          </div>
        )}

        {/* Partial error (stale data visible) */}
        {error && (
          <div className="inline-error">
            ⚠️ Refresh failed: {error}&nbsp;
            <button type="button" className="inline-retry" onClick={() => fetchData(true)}>
              Retry
            </button>
          </div>
        )}

        <div className="stats-grid">
          <div className="stat-card stat-card--teal">
            <span className="stat-label">Total Customers</span>
            <span className="stat-value">{businessData.totalCustomers ?? '—'}</span>
          </div>

          <div className="stat-card stat-card--orange">
            <span className="stat-label">Total Employees</span>
            <span className="stat-value">{businessData.employeeCount}</span>
          </div>

          <div className="stat-card stat-card--blue">
            <span className="stat-label">Customers Today</span>
            <span className="stat-value">{totalCustomersToday}</span>
          </div>

          <div className="stat-card stat-card--green">
            <span className="stat-label">Completed Today</span>
            <span className="stat-value">{completedToday}</span>
          </div>
        </div>

        {/* My Queue — visible only when the owner is also a self-employee */}
        {ownerQueueId && (
          <div className="content-card my-queue-card">
            <div className="card-header">
              <div className="my-queue-title-group">
                <span className="my-queue-badge">My Queue</span>
                <h2 className="card-title">{ownerQueueName}</h2>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(RouterConstant.ROUTERS_PATH.LIVE_QUEUE)}
              >
                Go Live
              </button>
            </div>
            {ownerLiveQueue ? (
              <div className="my-queue-stats">
                <div className="mqs mqs-waiting">
                  <span className="mqs-value">{ownerLiveQueue.waiting_count}</span>
                  <span className="mqs-label">Waiting</span>
                </div>
                <div className="mqs mqs-inprogress">
                  <span className="mqs-value">{ownerLiveQueue.in_progress_count}</span>
                  <span className="mqs-label">In Progress</span>
                </div>
                <div className="mqs mqs-done">
                  <span className="mqs-value">{ownerLiveQueue.completed_count}</span>
                  <span className="mqs-label">Completed</span>
                </div>
                <div className="mqs mqs-total">
                  <span className="mqs-value">
                    {ownerLiveQueue.waiting_count + ownerLiveQueue.in_progress_count + ownerLiveQueue.completed_count}
                  </span>
                  <span className="mqs-label">Total Today</span>
                </div>
              </div>
            ) : (
              <div className="queue-card-no-live">Live data unavailable</div>
            )}
          </div>
        )}

        <div className="content-card">
          <div className="card-header">
            <h2 className="card-title">Queue Status</h2>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUES)}
            >
              Manage Queues
            </button>
          </div>

          {businessData.queues.length === 0 ? (
            <div className="dashboard-empty-state">
              <div className="empty-icon-lg">📋</div>
              <h3>No queues yet</h3>
              <p>Create your first queue to start serving customers.</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(`${RouterConstant.ROUTERS_PATH.QUEUES}/new`)}
              >
                Create Queue
              </button>
            </div>
          ) : (
            <div className={`queue-cards-grid${
              businessData.queues.length === 1 ? ' queue-cards-grid--single' : ''
            }`}>
              {businessData.queues.map(q => {
                const live = businessData.liveQueues[q.uuid];
                return (
                  <div key={q.uuid} className={`queue-status-card queue-status-card--${getQueueStatusCls(q.status) || 'default'}`}>
                    <div className="queue-card-top">
                      <span className="queue-card-name">{q.name}</span>
                      <span className={`status-badge ${getQueueStatusCls(q.status)}`}>
                        {getQueueStatusText(q.status)}
                      </span>
                    </div>

                    {live ? (
                      <div className="queue-card-stats">
                        <div className="qcs qcs-waiting">
                          <span className="qcs-value">{live.waiting_count}</span>
                          <span className="qcs-label">Waiting</span>
                        </div>
                        <div className="qcs qcs-inprogress">
                          <span className="qcs-value">{live.in_progress_count}</span>
                          <span className="qcs-label">In Progress</span>
                        </div>
                        <div className="qcs qcs-done">
                          <span className="qcs-value">{live.completed_count}</span>
                          <span className="qcs-label">Done</span>
                        </div>
                      </div>
                    ) : (
                      <div className="queue-card-no-live">Live data unavailable</div>
                    )}

                    {live?.employee_on_leave && (
                      <div className="on-leave-badge">Employee on leave</div>
                    )}

                    <div className="queue-card-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          navigate(`${RouterConstant.ROUTERS_PATH.QUEUES}/${q.uuid}`)
                        }
                      >
                        Details
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => navigate(RouterConstant.ROUTERS_PATH.LIVE_QUEUE)}
                      >
                        Go Live
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="content-card">
          <div className="card-header">
            <h2 className="card-title">Recent Customers</h2>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUEUSERS)}
            >
              View All
            </button>
          </div>
          <UsersTable users={businessData.recentUsers} queueNameFn={queueNameFn} />
        </div>
      </div>
    );
  }

  if (profileType === ProfileType.EMPLOYEE) {
    if (!employeeQueueId) {
      return (
        <div className="dashboard-page">
          <div className="content-card dashboard-empty-state centered">
            <div className="empty-icon-lg">🔗</div>
            <h3>No queue assigned</h3>
            <p>
              You have not been assigned to a queue yet.
              <br />
              Contact your business administrator to get assigned.
            </p>
          </div>
        </div>
      );
    }

    const lq = empData?.liveQueue ?? null;
    const queueName = lq?.queue_name || profile?.employee?.queue?.name || 'My Queue';

    return (
      <div className="dashboard-page">
        <DashboardTopBar />

        {error && (
          <div className="inline-error">
            ⚠️ Refresh failed: {error}&nbsp;
            <button type="button" className="inline-retry" onClick={() => fetchData(true)}>
              Retry
            </button>
          </div>
        )}

        {/* Employee queue header */}
        <div className="employee-queue-header">
          <div>
            <h2 className="employee-queue-name">{queueName}</h2>
            <p className="employee-queue-sub">Your assigned queue</p>
          </div>
          {lq && (
            <span className={`status-badge ${getQueueStatusCls(lq.queue_status)}`}>
              {getQueueStatusText(lq.queue_status)}
            </span>
          )}
        </div>

        {/* Stat cards */}
        <div className="stats-grid">
          <div className="stat-card stat-card--orange">
            <span className="stat-label">Waiting</span>
            <span className="stat-value">{lq?.waiting_count ?? '—'}</span>
          </div>

          <div className="stat-card stat-card--blue">
            <span className="stat-label">In Progress</span>
            <span className="stat-value">{lq?.in_progress_count ?? '—'}</span>
          </div>

          <div className="stat-card stat-card--green">
            <span className="stat-label">Completed Today</span>
            <span className="stat-value">{lq?.completed_count ?? '—'}</span>
          </div>

          <div className={`stat-card stat-card--${lq?.employee_on_leave ? 'red' : 'teal'}`}>
            <span className="stat-label">Your Status</span>
            <span className="stat-value stat-value-sm">
              {lq === null ? '—' : lq.employee_on_leave ? 'On Leave' : 'Available'}
            </span>
          </div>
        </div>

        {/* Recent customers + Go Live */}
        <div className="content-card">
          <div className="card-header">
            <h2 className="card-title">Recent Customers</h2>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(RouterConstant.ROUTERS_PATH.LIVE_QUEUE)}
            >
              Go to Live Queue
            </button>
          </div>
          <UsersTable users={empData?.recentUsers ?? []} />
        </div>
      </div>
    );
  }

  return null;
};

export default Dashboard;
