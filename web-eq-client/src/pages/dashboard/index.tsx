import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUserStore } from '../../utils/userStore';
import { ProfileType, QueueStatus, QueueUserStatus } from '../../utils/constants';
import {
  QueueService, QueueData, LiveQueueData, QueueUserData,
} from '../../services/queue/queue.service';
import { EmployeeService } from '../../services/employee/employee.service';
import type { UnifiedProfileResponse } from '../../services/profile/profile.service';
import { getInitials, getAvatarBackground } from '../../utils/utils';
import { RouterConstant } from '../../routers';
import './dashboard.scss';

interface BusinessData {
  queues: QueueData[];
  liveQueues: Record<string, LiveQueueData>;
  employeeCount: number;
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
  const { profile, getProfileType, getBusinessId, getEmployeeId } = useUserStore();
  const profileType = getProfileType();
  const businessId = getBusinessId();
  const employeeId = getEmployeeId();
  const employeeQueueId = profile?.employee?.queue_id ?? null;
  const queueService = useMemo(() => new QueueService(), []);
  const employeeService = useMemo(() => new EmployeeService(), []);
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
        const [fetchedQueues, fetchedEmployees] = await Promise.all([
          queueService.getQueues(businessId),
          employeeService.getEmployees(businessId, 1, 50),
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

        const recentUsers = await queueService.getQueueUsers(
          businessId, undefined, undefined, 1, 8
        );

        if (gen !== genRef.current) return;

        setBusinessData({
          queues:        fetchedQueues,
          liveQueues:    liveMap,
          employeeCount: fetchedEmployees.length,
          recentUsers,
        });

      } else if (profileType === ProfileType.EMPLOYEE) {
        const promises: Promise<LiveQueueData | QueueUserData[]>[] = [];
        const hasQueue = !!employeeQueueId;

        if (hasQueue) {
          promises.push(queueService.getLiveQueue(employeeQueueId!));
        }
        promises.push(
          queueService.getQueueUsers(
            businessId,
            employeeQueueId  || undefined,
            employeeId       || undefined,
            1,
            8
          )
        );

        const results = await Promise.allSettled(promises);
        if (gen !== genRef.current) return;

        let liveQueue: LiveQueueData | null = null;
        let recentUsers: QueueUserData[]    = [];

        if (hasQueue) {
          if (results[0].status === 'fulfilled')
            liveQueue   = results[0].value as LiveQueueData;
          if (results[1]?.status === 'fulfilled')
            recentUsers = results[1].value as QueueUserData[];
        } else {
          if (results[0]?.status === 'fulfilled')
            recentUsers = results[0].value as QueueUserData[];
        }

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
  }, [businessId, employeeId, employeeQueueId, profileType, queueService, employeeService]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

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

  const runningQueuesCount = useMemo(
    () => (businessData?.queues ?? []).filter(q => q.status === QueueStatus.RUNNING).length,
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

  const RefreshBar = () =>
    lastUpdated ? (
      <div className="dashboard-refresh-bar">
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
    ) : null;

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
              <div className="sk sk-icon" />
              <div className="sk sk-value" />
              <div className="sk sk-label" />
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
        <RefreshBar />

        {/* Business open / closed banner */}
        {isOpen !== null && (
          <div className={`business-status-banner ${isOpen ? 'open' : 'closed'}`}>
            <span className="status-dot" />
            {isOpen
              ? 'Your business is open today'
              : 'Your business is closed today — customers will not be queued'}
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
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon blue">👥</div>
            </div>
            <div className="stat-value">{totalCustomersToday}</div>
            <div className="stat-label">Customers Today</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon green">▶</div>
            </div>
            <div className="stat-value">{runningQueuesCount}</div>
            <div className="stat-label">Queues Running</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon orange">👤</div>
            </div>
            <div className="stat-value">{businessData.employeeCount}</div>
            <div className="stat-label">Total Employees</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon teal">✓</div>
            </div>
            <div className="stat-value">{completedToday}</div>
            <div className="stat-label">Completed Today</div>
          </div>
        </div>

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
            <div className="queue-cards-grid">
              {businessData.queues.map(q => {
                const live = businessData.liveQueues[q.uuid];
                return (
                  <div key={q.uuid} className="queue-status-card">
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
        <RefreshBar />

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
          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon orange">⏳</div>
            </div>
            <div className="stat-value">{lq?.waiting_count ?? '—'}</div>
            <div className="stat-label">Waiting</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon blue">▶</div>
            </div>
            <div className="stat-value">{lq?.in_progress_count ?? '—'}</div>
            <div className="stat-label">In Progress</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div className="stat-icon teal">✓</div>
            </div>
            <div className="stat-value">{lq?.completed_count ?? '—'}</div>
            <div className="stat-label">Completed Today</div>
          </div>

          <div className="stat-card">
            <div className="stat-card-header">
              <div className={`stat-icon ${lq?.employee_on_leave ? 'red' : 'green'}`}>
                {lq?.employee_on_leave ? '🚫' : '✓'}
              </div>
            </div>
            <div className="stat-value stat-value-sm">
              {lq === null ? '—' : lq.employee_on_leave ? 'On Leave' : 'Available'}
            </div>
            <div className="stat-label">Your Status</div>
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
