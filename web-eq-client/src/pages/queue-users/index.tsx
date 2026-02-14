import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QueueService, QueueUserData } from '../../services/queue/queue.service';
import { ProfileService } from '../../services/profile/profile.service';
import { useUserStore } from '../../utils/userStore';
import { getInitials, getAvatarBackground } from '../../utils/utils';
import { QueueUserStatus, DEFAULT_PAGE_LIMIT, DEFAULT_PAGE, DEFAULT_DEBOUNCE_DELAY_MS, ProfileType } from '../../utils/constants';
import Pagination from '../../components/pagination';
import "./queue-users.scss";

const QueueUsers = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queueService = useMemo(() => new QueueService(), []);
    const profileService = useMemo(() => new ProfileService(), []);
    const { profile, setProfile, getBusinessId, getEmployeeId } = useUserStore();
    
    const [queueUsers, setQueueUsers] = useState<QueueUserData[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [currentPage, setCurrentPage] = useState<number>(DEFAULT_PAGE);
    const [totalPages, setTotalPages] = useState<number>(1);
    const [limit] = useState<number>(DEFAULT_PAGE_LIMIT);
    const [debouncedSearch, setDebouncedSearch] = useState<string>("");
    
    const businessId = getBusinessId() || "";
    const defaultEmployeeId = getEmployeeId() || "";
    const [queueId, setQueueId] = useState<string>("");
    const [employeeId, setEmployeeId] = useState<string>(defaultEmployeeId);
    const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
    
    useEffect(() => {
        if (defaultEmployeeId) {
            setEmployeeId(defaultEmployeeId);
        }
    }, [defaultEmployeeId]);
    
    const isEmployee = !!defaultEmployeeId;

    useEffect(() => {
        const fetchProfileIfNeeded = async () => {
            if (profile) {
                return;
            }

            try {
                setLoadingProfile(true);
                const fetchedProfile = await profileService.getProfile();
                setProfile(fetchedProfile);
                
                if (fetchedProfile.profile_type === ProfileType.BUSINESS && !fetchedProfile.business?.uuid) {
                    setError(t("noBusinessFound") || "No business found for current user");
                } else if (fetchedProfile.profile_type === ProfileType.EMPLOYEE && !fetchedProfile.employee?.business_id) {
                    setError(t("noBusinessFound") || "No business found for current user");
                }
            } catch (err: any) {
                console.error("Failed to fetch profile:", err);
                setError(t("failedToLoadBusinessId") || "Failed to load business information");
            } finally {
                setLoadingProfile(false);
            }
        };

        fetchProfileIfNeeded();
    }, [profile, profileService, setProfile, t]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(DEFAULT_PAGE);
        }, DEFAULT_DEBOUNCE_DELAY_MS);

        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        if (loadingProfile || !businessId) {
            return;
        }

        const fetchQueueUsers = async () => {
            setLoading(true);
            setError("");

            try {
                const data = await queueService.getQueueUsers(
                    businessId,
                    queueId || undefined,
                    employeeId || undefined,
                    currentPage,
                    limit,
                    debouncedSearch || undefined
                );
                setQueueUsers(data);
                if (data.length < limit) {
                    setTotalPages(currentPage);
                } else {
                    setTotalPages(currentPage + 1);
                }
            } catch (err: any) {
                console.error("Failed to fetch queue users:", err);
                let errorMessage = t("failedToLoadQueueUsers") || "Failed to load queue users";
                
                if (err?.response?.data?.detail?.message) {
                    errorMessage = err.response.data.detail.message;
                } else if (err?.message) {
                    errorMessage = err.message;
                } else if (err?.code === "ERR_NETWORK" || !err?.response) {
                    errorMessage = t("networkError");
                }
                
                setError(errorMessage);
                setQueueUsers([]);
            } finally {
                setLoading(false);
            }
        };

        fetchQueueUsers();
    }, [businessId, queueId, employeeId, currentPage, limit, debouncedSearch, queueService, t, loadingProfile]);

    const handlePageChange = (page: number) => {
        setCurrentPage(page);
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return t("notAvailable");
        try {
            return new Date(dateString).toLocaleString();
        } catch {
            return dateString;
        }
    };

    const getStatusBadge = (status?: number) => {
        if (!status) return <span className="status-badge unknown">{t("unknown")}</span>;
        
        switch (status) {
            case QueueUserStatus.REGISTERED:
                return <span className="status-badge registered">{t("registered")}</span>;
            case QueueUserStatus.IN_PROGRESS:
                return <span className="status-badge in-progress">{t("inProgress")}</span>;
            case QueueUserStatus.COMPLETED:
                return <span className="status-badge completed">{t("completed")}</span>;
            case QueueUserStatus.FAILED:
                return <span className="status-badge failed">{t("failed")}</span>;
            case QueueUserStatus.CANCELLED:
                return <span className="status-badge cancelled">{t("cancelled")}</span>;
            case QueueUserStatus.PRIORITY_REQUESTED:
                return <span className="status-badge priority">{t("priority")}</span>;
            default:
                return <span className="status-badge unknown">{t("unknown")}</span>;
        }
    };

    return (
        <div className="queue-users-page">
            <div className="content-card">
                <div className="card-header">
                    <h2 className="card-title">{t("queueUsers")}</h2>
                    <div className="card-actions">
                        <button className="btn btn-secondary" disabled={loading || queueUsers.length === 0}>
                            {t("export")}
                        </button>
                    </div>
                </div>

                <div className="filter-bar">
                    <div className="filter-row">
                        <input
                            type="text"
                            className="filter-input"
                            placeholder={t("searchQueueUsers") || "Search by name, email, phone, or token..."}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            disabled={loading}
                        />
                    </div>
                    <div className="filter-row">
                        <input
                            type="text"
                            className="filter-input"
                            placeholder={t("queueId") || "Queue ID (optional)"}
                            value={queueId}
                                onChange={(e) => {
                                    setQueueId(e.target.value);
                                    setCurrentPage(DEFAULT_PAGE);
                                }}
                            disabled={loading}
                        />
                        <input
                            type="text"
                            className="filter-input"
                            placeholder={t("employeeId") || "Employee ID (optional)"}
                            value={employeeId}
                            onChange={(e) => {
                                setEmployeeId(e.target.value);
                                setCurrentPage(DEFAULT_PAGE);
                            }}
                            disabled={loading || isEmployee}
                            title={isEmployee ? "Employee ID is auto-set for employees" : ""}
                        />
                    </div>
                </div>

                {error && (
                    <div className="error-message" style={{ padding: "1rem", color: "red", marginBottom: "1rem" }}>
                        {error}
                    </div>
                )}

                <div className="data-table-container">
                    {loadingProfile ? (
                        <div className="loading-state" style={{ padding: "2rem", textAlign: "center" }}>
                            {t("loading")}...
                        </div>
                    ) : loading ? (
                        <div className="loading-state" style={{ padding: "2rem", textAlign: "center" }}>
                            {t("loading")}...
                        </div>
                    ) : queueUsers.length === 0 ? (
                        <div className="empty-state" style={{ padding: "2rem", textAlign: "center" }}>
                            {debouncedSearch 
                                ? t("noQueueUsersFoundSearch") || "No queue users found matching your search."
                                : t("noQueueUsersFound") || "No queue users found."
                            }
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{t("user")}</th>
                                    <th>{t("phoneNumber") || "Phone Number"}</th>
                                    <th>{t("tokenNumber")}</th>
                                    <th>{t("queueDate")}</th>
                                    <th>{t("enqueueTime")}</th>
                                    <th>{t("status")}</th>
                                    <th>{t("priority")}</th>
                                    <th>{t("actions")}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queueUsers.map((queueUser) => (
                                    <tr key={queueUser.uuid}>
                                        <td>
                                            <div className="user-cell">
                                                <div 
                                                    className="user-avatar" 
                                                    style={{ background: getAvatarBackground(queueUser.user.full_name || queueUser.user.phone_number) }}
                                                >
                                                    {getInitials(queueUser.user.full_name || queueUser.user.phone_number)}
                                                </div>
                                                <div className="user-info">
                                                    <div className="user-name">{queueUser.user.full_name || t("notAvailable")}</div>
                                                    {queueUser.user.email && (
                                                        <div className="user-details">
                                                            <span>{queueUser.user.email}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>{queueUser.user.country_code} {queueUser.user.phone_number}</td>
                                        <td>{queueUser.token_number || t("notAvailable")}</td>
                                        <td>{queueUser.queue_date || t("notAvailable")}</td>
                                        <td>{formatDate(queueUser.enqueue_time)}</td>
                                        <td>{getStatusBadge(queueUser.status)}</td>
                                        <td>
                                            <span className={`status-badge ${queueUser.priority ? 'priority' : 'normal'}`}>
                                                {queueUser.priority ? t("yes") : t("no")}
                                            </span>
                                        </td>
                                        <td>
                                            <div className="action-buttons">
                                                <button 
                                                    className="action-btn" 
                                                    title={t("view")}
                                                    aria-label={t("view")}
                                                    onClick={() => navigate(`/admin/queue-users/${queueUser.uuid}`)}
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
                        currentPage={currentPage}
                        totalPages={totalPages}
                        onPageChange={handlePageChange}
                        disabled={loading}
                    />
                )}
            </div>
        </div>
    );
};

export default QueueUsers;
