import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QueueService, QueueData } from "../../services/queue/queue.service";
import { ProfileService } from "../../services/profile/profile.service";
import { useUserStore } from "../../utils/userStore";
import { ProfileType, QueueStatus } from "../../utils/constants";
import { RouterConstant } from "../../routers";
import { getQueueStatusLabel, getQueueStatusBadgeClass } from "../../utils/utils";
import PageToolbar from "../../components/page-toolbar";
import "./queues.scss";

const Queues = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queueService = useMemo(() => new QueueService(), []);
    const profileService = useMemo(() => new ProfileService(), []);
    const { profile, setProfile, getBusinessId } = useUserStore();
    const [queues, setQueues] = useState<QueueData[]>([]);
    const [statusFilter, setStatusFilter] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [loadingProfile, setLoadingProfile] = useState(false);
    const businessId = getBusinessId() || "";

    useEffect(() => {
        const fetchProfileIfNeeded = async () => {
            if (profile) return;
            try {
                setLoadingProfile(true);
                const fetched = await profileService.getProfile();
                setProfile(fetched);
                if (
                    (fetched.profile_type === ProfileType.BUSINESS && !fetched.business?.uuid) ||
                    (fetched.profile_type === ProfileType.EMPLOYEE && !fetched.employee?.business_id)
                ) {
                    setError(t("noBusinessFound") || "No business found for current user");
                }
            } catch (err: unknown) {
                console.error("Failed to fetch profile:", err);
                setError(t("failedToLoadBusinessId") || "Failed to load business information");
            } finally {
                setLoadingProfile(false);
            }
        };
        fetchProfileIfNeeded();
    }, [profile, profileService, setProfile, t]);

    useEffect(() => {
        if (loadingProfile || !businessId) return;

        const fetchQueues = async () => {
            setLoading(true);
            setError("");
            try {
                const data = await queueService.getQueues(businessId);
                setQueues(data);
            } catch (err: unknown) {
                const e = err as { response?: { data?: { detail?: { message?: string } } }; message?: string };
                const msg =
                    e?.response?.data?.detail?.message || (e?.message as string) || t("failedToLoadQueues") || "Failed to load queues";
                setError(msg);
                setQueues([]);
            } finally {
                setLoading(false);
            }
        };

        fetchQueues();
    }, [businessId, loadingProfile, queueService, t]);

    if (!businessId && !loadingProfile) {
        return (
            <div className="queues-page">
                <div className="content-card">
                    <div className="error-message">{t("businessIdRequiredQueues")}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="queues-page">
            <div className="content-card">
                <PageToolbar
                    filters={
                        <select
                            className="filter-select"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            disabled={loading}
                        >
                            <option value="">{t("allStatuses") || "All statuses"}</option>
                            <option value={String(QueueStatus.REGISTERED)}>{t("registered") || "Registered"}</option>
                            <option value={String(QueueStatus.RUNNING)}>{t("running") || "Running"}</option>
                            <option value={String(QueueStatus.STOPPED)}>{t("stopped") || "Stopped"}</option>
                        </select>
                    }
                    actions={
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() =>
                                navigate(`${RouterConstant.ROUTERS_PATH.QUEUES}/new`, {
                                    state: businessId ? { businessId } : undefined,
                                })
                            }
                            disabled={loading || loadingProfile || !businessId}
                        >
                            {t("addQueue") || "Add queue"}
                        </button>
                    }
                />

                {error && (
                    <div className="error-message" style={{ padding: "1rem", marginBottom: "1rem" }}>
                        {error}
                    </div>
                )}

                <div className="data-table-container">
                    {loadingProfile || loading ? (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{t("queueName") || "Queue name"}</th>
                                    <th>{t("status") || "Status"}</th>
                                    <th>{t("isCounter") || "Is counter"}</th>
                                    <th>{t("queueLimit") || "Limit"}</th>
                                    <th>{t("createdAt") || "Created at"}</th>
                                    <th>{t("actions") || "Actions"}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="skeleton-row">
                                        <td><div className="skeleton-cell skeleton-cell--wide" /></td>
                                        <td><div className="skeleton-cell skeleton-cell--short" /></td>
                                        <td><div className="skeleton-cell skeleton-cell--short" /></td>
                                        <td><div className="skeleton-cell skeleton-cell--short" /></td>
                                        <td><div className="skeleton-cell skeleton-cell--med" /></td>
                                        <td><div className="skeleton-cell skeleton-cell--short" /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : queues.length === 0 ? (
                        <div className="empty-state">
                            <div className="empty-state-icon">🗂️</div>
                            <div className="empty-state-title">{t("noQueuesFound") || "No queues found"}</div>
                            <div className="empty-state-sub">Create your first queue to get started.</div>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>{t("queueName") || "Queue name"}</th>
                                    <th>{t("status") || "Status"}</th>
                                    <th>{t("isCounter") || "Is counter"}</th>
                                    <th>{t("queueLimit") || "Limit"}</th>
                                    <th>{t("createdAt") || "Created at"}</th>
                                    <th>{t("actions") || "Actions"}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {queues.filter((q) => statusFilter === "" || String(q.status) === statusFilter).map((q) => {
                                    const statusLabel = getQueueStatusLabel(q.status, t);
                                    const statusBadgeClass = getQueueStatusBadgeClass(q.status);
                                    const createdLabel =
                                        q.created_at != null
                                            ? new Date(q.created_at).toLocaleString(undefined, {
                                                dateStyle: "short",
                                                timeStyle: "short",
                                            })
                                            : t("notAvailable");
                                    return (
                                        <tr key={q.uuid}>
                                            <td>{q.name}</td>
                                            <td>
                                                <span className={`status-badge ${statusBadgeClass}`}>
                                                    {statusLabel}
                                                </span>
                                            </td>
                                            <td>{q.is_counter === true ? t("yes") || "Yes" : q.is_counter === false ? t("no") || "No" : t("notAvailable")}</td>
                                            <td>{q.limit != null ? String(q.limit) : "—"}</td>
                                            <td>{createdLabel}</td>
                                            <td>
                                                <div className="action-buttons">
                                                    <button
                                                        type="button"
                                                        className="action-btn"
                                                        title={t("view") || "View"}
                                                        aria-label={t("view") || "View queue"}
                                                        onClick={() => navigate(`${RouterConstant.ROUTERS_PATH.QUEUES}/${q.uuid}`)}
                                                    >
                                                        👁️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Queues;
