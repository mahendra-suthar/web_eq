import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserService, AppointmentUserItem } from '../../services/user/user.service';
import { ProfileService } from '../../services/profile/profile.service';
import { EmployeeService, EmployeeResponse } from '../../services/employee/employee.service';
import { useUserStore } from '../../utils/userStore';
import { getInitials, getAvatarBackground } from '../../utils/utils';
import { DEFAULT_PAGE, ProfileType } from '../../utils/constants';
import Pagination from '../../components/common/Pagination';
import PageToolbar from '../../components/page-toolbar';
import './all-users.scss';

/** Role-based fetch params: business sees all or filtered by queue; employee sees only their queue. */
function useAppointmentsParams(
    profile: { profile_type?: string; employee?: { queue_id?: string | null } } | null,
    businessId: string,
    employeeId: string,
    employees: EmployeeResponse[],
    filterEmployeeId: string
) {
    const isEmployee = !!employeeId;
    const queueIdFromFilter = useMemo(() => {
        if (!filterEmployeeId || !employees.length) return undefined;
        const emp = employees.find((e) => e.uuid === filterEmployeeId);
        return emp?.queue_id || undefined;
    }, [filterEmployeeId, employees]);

    return useMemo(() => {
        if (isEmployee) {
            const queueId = profile?.employee?.queue_id ?? undefined;
            return { businessId: undefined, queueId, hasContext: !!queueId };
        }
        const queueId = queueIdFromFilter;
        const useBusiness = !!businessId && !queueId;
        const useQueue = !!queueId;
        return {
            businessId: useBusiness ? businessId : undefined,
            queueId: useQueue ? queueId : undefined,
            hasContext: !!businessId,
        };
    }, [isEmployee, businessId, queueIdFromFilter, profile?.employee?.queue_id]);
}

const AllUsers = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const userService = useMemo(() => new UserService(), []);
    const profileService = useMemo(() => new ProfileService(), []);
    const employeeService = useMemo(() => new EmployeeService(), []);
    const { profile, setProfile, getBusinessId, getEmployeeId } = useUserStore();

    const [items, setItems] = useState<AppointmentUserItem[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');
    const [page, setPage] = useState(DEFAULT_PAGE);
    const [limit, setLimit] = useState(20);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
    const [filterEmployeeId, setFilterEmployeeId] = useState<string>('');

    const businessId = getBusinessId() || '';
    const employeeId = getEmployeeId() || '';
    const isEmployee = !!employeeId;

    const params = useAppointmentsParams(
        profile,
        businessId,
        employeeId,
        employees,
        filterEmployeeId
    );

    useEffect(() => {
        const loadProfile = async () => {
            if (profile) {
                setLoadingProfile(false);
                return;
            }
            try {
                const p = await profileService.getProfile();
                setProfile(p);
            } catch (e) {
                console.error('Failed to load profile', e);
                setError(t('networkError') || 'Network error');
            } finally {
                setLoadingProfile(false);
            }
        };
        loadProfile();
    }, [profile, profileService, setProfile, t]);

    useEffect(() => {
        if (!businessId || profile?.profile_type !== ProfileType.BUSINESS) return;
        employeeService
            .getEmployees(businessId, 1, 500, '')
            .then(setEmployees)
            .catch(() => setEmployees([]));
    }, [businessId, profile?.profile_type, employeeService]);

    useEffect(() => {
        if (!params.hasContext) {
            setItems([]);
            setTotal(0);
            return;
        }
        if (isEmployee && !params.queueId) {
            setItems([]);
            setTotal(0);
            return;
        }

        setLoading(true);
        setError('');
        userService
            .getUsersAppointments({
                business_id: params.businessId,
                queue_id: params.queueId,
                page,
                limit,
            })
            .then((res) => {
                setItems(res.items);
                setTotal(res.total);
            })
            .catch((err: any) => {
                const msg =
                    err?.response?.data?.detail?.message ||
                    err?.message ||
                    t('failedToLoadQueueUsers') ||
                    'Failed to load users';
                setError(msg);
                setItems([]);
                setTotal(0);
            })
            .finally(() => setLoading(false));
    }, [params.businessId, params.queueId, params.hasContext, isEmployee, page, limit, userService, t]);

    const formatLastVisit = (dateStr?: string | null) => {
        if (!dateStr) return t('notAvailable');
        try {
            return new Date(dateStr).toLocaleString();
        } catch {
            return dateStr;
        }
    };


    return (
        <div className="all-users-page">
            <div className="content-card">
                <PageToolbar
                    filters={
                        profile?.profile_type === ProfileType.BUSINESS && employees.length > 0 ? (
                            <select
                                className="filter-select"
                                value={filterEmployeeId}
                                onChange={(e) => {
                                    setFilterEmployeeId(e.target.value);
                                    setPage(DEFAULT_PAGE);
                                }}
                                disabled={loading}
                            >
                                <option value="">{t('allQueues') || 'All queues'}</option>
                                {employees.map((emp) => (
                                    <option key={emp.uuid} value={emp.uuid}>
                                        {emp.full_name}
                                    </option>
                                ))}
                            </select>
                        ) : undefined
                    }
                    actions={
                        <button className="btn btn-secondary" disabled>
                            {t('export')}
                        </button>
                    }
                />

                {error && (
                    <div className="error-message all-users-error">
                        {error}
                    </div>
                )}

                {!loadingProfile && !params.hasContext && (
                    <div className="empty-state all-users-empty">
                        {isEmployee
                            ? (t('noQueueAssigned') || 'You are not assigned to a queue. No users to show.')
                            : (t('noBusinessFound') || 'No business context. Please log in as business or employee.')}
                    </div>
                )}

                {params.hasContext && (
                    <>
                        <div className="data-table-container">
                            {loadingProfile || loading ? (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{t('user')}</th>
                                            <th>{t('email')}</th>
                                            <th>{t('phoneNumber')}</th>
                                            <th>{t('totalAppointments')}</th>
                                            <th>{t('lastVisit')}</th>
                                            <th>{t('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="skeleton-row">
                                                <td>
                                                    <div className="skeleton-user-cell">
                                                        <div className="skeleton-cell skeleton-cell--avatar" />
                                                        <div className="skeleton-cell skeleton-cell--med" />
                                                    </div>
                                                </td>
                                                <td><div className="skeleton-cell skeleton-cell--wide" /></td>
                                                <td><div className="skeleton-cell skeleton-cell--med" /></td>
                                                <td><div className="skeleton-cell skeleton-cell--short" /></td>
                                                <td><div className="skeleton-cell skeleton-cell--med" /></td>
                                                <td><div className="skeleton-cell skeleton-cell--short" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : items.length === 0 ? (
                                <div className="empty-state">
                                    <div className="empty-state-icon">🧑‍🤝‍🧑</div>
                                    <div className="empty-state-title">{t('noQueueUsersFound') || 'No users found'}</div>
                                    <div className="empty-state-sub">Users with appointments will appear here.</div>
                                </div>
                            ) : (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>{t('user')}</th>
                                            <th>{t('email')}</th>
                                            <th>{t('phoneNumber')}</th>
                                            <th>{t('totalAppointments')}</th>
                                            <th>{t('lastVisit')}</th>
                                            <th>{t('actions')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((user) => (
                                            <tr key={user.user_id}>
                                                <td>
                                                    <div className="user-cell">
                                                        <div
                                                            className="user-avatar"
                                                            style={{
                                                                background: getAvatarBackground(
                                                                    user.full_name || user.phone_number
                                                                ),
                                                            }}
                                                        >
                                                            {getInitials(user.full_name || user.phone_number)}
                                                        </div>
                                                        <div className="user-info">
                                                            <div className="user-name">
                                                                {user.full_name || t('notAvailable')}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>{user.email || t('notAvailable')}</td>
                                                <td>{user.phone_number || t('notAvailable')}</td>
                                                <td>{user.total_appointments ?? 0}</td>
                                                <td>{formatLastVisit(user.last_visit_date)}</td>
                                                <td>
                                                    <div className="action-buttons">
                                                        <button
                                                            type="button"
                                                            className="action-btn"
                                                            title={t('view')}
                                                            aria-label={t('view')}
                                                            onClick={() => navigate(`/admin/users/${user.user_id}`)}
                                                        >
                                                            👁️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {!loading && (
                            <Pagination
                                page={page}
                                limit={limit}
                                total={total}
                                onPageChange={setPage}
                                onLimitChange={setLimit}
                                limitOptions={[10, 20, 50]}
                                disabled={loading}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default AllUsers;
