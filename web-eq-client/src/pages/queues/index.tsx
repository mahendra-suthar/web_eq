import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QueueService, QueueData } from "../../services/queue/queue.service";
import { ProfileService } from "../../services/profile/profile.service";
import { useUserStore } from "../../utils/userStore";
import { ProfileType } from "../../utils/constants";
import { RouterConstant } from "../../routers";
import "./queues.scss";

const Queues = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const queueService = useMemo(() => new QueueService(), []);
    const profileService = useMemo(() => new ProfileService(), []);
    const { profile, setProfile, getBusinessId } = useUserStore();

    const [queues, setQueues] = useState<QueueData[]>([]);
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
                <div className="card-header">
                    <h2 className="card-title">{t("queues") || "Queues"}</h2>
                    <div className="card-actions">
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
                    </div>
                </div>

                {error && (
                    <div className="error-message" style={{ padding: "1rem", marginBottom: "1rem" }}>
                        {error}
                    </div>
                )}

                <div className="data-table-container">
                    {loadingProfile || loading ? (
                        <div className="loading-state" style={{ padding: "2rem", textAlign: "center" }}>
                            {t("loading")}
                        </div>
                    ) : queues.length === 0 ? (
                        <div className="empty-state" style={{ padding: "2rem", textAlign: "center" }}>
                            {t("noQueuesFound") || "No queues found for this business."}
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
                                {queues.map((q) => {
                                    const statusLabel =
                                        q.status === 1
                                            ? t("active") || "Active"
                                            : q.status === 0
                                                ? t("inactive") || "Inactive"
                                                : q.status != null
                                                    ? String(q.status)
                                                    : t("notAvailable");
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
                                                <span className={`status-badge ${q.status === 1 ? "active" : "inactive"}`}>
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
