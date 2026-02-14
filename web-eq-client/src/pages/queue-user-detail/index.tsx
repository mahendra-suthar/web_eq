import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QueueService, QueueUserDetailResponse } from '../../services/queue/queue.service';
import { RouterConstant } from '../../routers/index';
import { QueueUserStatus } from '../../utils/constants';
import './queue-user-detail.scss';

const getStatusLabel = (status: number | undefined | null, t: (k: string) => string): string => {
    if (status == null) return t("notAvailable");
    switch (status) {
        case QueueUserStatus.REGISTERED: return t("registered");
        case QueueUserStatus.IN_PROGRESS: return t("inProgress");
        case QueueUserStatus.COMPLETED: return t("completed");
        case QueueUserStatus.FAILED: return t("failed");
        case QueueUserStatus.CANCELLED: return t("cancelled");
        case QueueUserStatus.PRIORITY_REQUESTED: return t("priority");
        default: return t("unknown");
    }
};

const formatDateTime = (value?: string | null) => {
    if (value == null || value === '') return null;
    try {
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toLocaleString();
    } catch {
        return value;
    }
};

const QueueUserDetail = () => {
    const { t } = useTranslation();
    const { queueUserId } = useParams<{ queueUserId: string }>();
    const navigate = useNavigate();
    const queueService = useMemo(() => new QueueService(), []);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [data, setData] = useState<QueueUserDetailResponse | null>(null);

    useEffect(() => {
        if (!queueUserId) return;
        setLoading(true);
        setError('');
        queueService.getQueueUserDetail(queueUserId)
            .then(setData)
            .catch((err: any) => {
                setError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadQueueUsers"));
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [queueUserId, queueService, t]);

    const handleQueueNameClick = () => {
        if (data?.employee_id) {
            navigate(`${RouterConstant.ROUTERS_PATH.EMPLOYEES}/${data.employee_id}`, { state: { openTab: 'queue' } });
        }
    };

    if (!queueUserId) {
        return (
            <div className="queue-user-detail-page">
                <div className="content-card">
                    <div className="error-message">{t("notAvailable")}</div>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="queue-user-detail-page">
                <div className="content-card">
                    <div className="loading-state">{t("loading")}</div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="queue-user-detail-page">
                <div className="content-card">
                    <div className="error-message">{error || t("notAvailable")}</div>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUEUSERS)}>
                        {t("back")}
                    </button>
                </div>
            </div>
        );
    }

    const phoneDisplay = data.user?.country_code && data.user?.phone_number
        ? `${data.user.country_code} ${data.user.phone_number}`
        : data.user?.phone_number || t("notAvailable");
    const serviceNamesDisplay = data.service_names?.length ? data.service_names.join(', ') : t("notAvailable");

    return (
        <div className="queue-user-detail-page">
            <div className="content-card">
                <div className="card-header section-header-actions">
                    <h2 className="card-title">{t("queueUserDetail")}</h2>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUEUSERS)}>
                        {t("back")}
                    </button>
                </div>

                <div className="detail-sections">
                    {/* Section 1: User Information */}
                    <section className="detail-section">
                        <h3 className="section-title">{t("userInformation")}</h3>
                        <div className="section-content user-section">
                            <div className="user-avatar-block">
                                {data.user?.profile_picture ? (
                                    <img src={data.user.profile_picture} alt="" className="user-avatar-img" />
                                ) : (
                                    <div className="user-avatar-placeholder">
                                        <span>{(data.user?.full_name || data.user?.phone_number || '?').charAt(0).toUpperCase()}</span>
                                    </div>
                                )}
                            </div>
                            <div className="info-grid">
                                <div className="info-field">
                                    <label className="info-label">{t("fullName")}</label>
                                    <div className="info-value">{data.user?.full_name || t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("email")}</label>
                                    <div className="info-value">{data.user?.email || t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("phoneNumber")}</label>
                                    <div className="info-value">{phoneDisplay}</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Section 2: Queue User Information */}
                    <section className="detail-section">
                        <h3 className="section-title">{t("queueUserInformation")}</h3>
                        <div className="section-content">
                            <div className="info-grid">
                                <div className="info-field full-width">
                                    <label className="info-label">{t("queue")}</label>
                                    <div className="info-value">
                                        {data.employee_id ? (
                                            <button type="button" className="link-button" onClick={handleQueueNameClick}>
                                                {data.queue_name}
                                            </button>
                                        ) : (
                                            data.queue_name
                                        )}
                                    </div>
                                </div>
                                <div className="info-field full-width">
                                    <label className="info-label">{t("selectedServices")}</label>
                                    <div className="info-value">{serviceNamesDisplay}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("tokenNumber")}</label>
                                    <div className="info-value">{data.token_number || t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("queueDate")}</label>
                                    <div className="info-value">{data.queue_date || t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("enqueueTime")}</label>
                                    <div className="info-value">{formatDateTime(data.enqueue_time) ?? t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("dequeueTime")}</label>
                                    <div className="info-value">{formatDateTime(data.dequeue_time) ?? t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("status")}</label>
                                    <div className="info-value">{getStatusLabel(data.status, t)}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("priority")}</label>
                                    <div className="info-value">{data.priority ? t("vip") : t("normal")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("turnTime")}</label>
                                    <div className="info-value">{data.turn_time != null ? `${data.turn_time} ${t("minutes")}` : t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("estimatedEnqueueTime")}</label>
                                    <div className="info-value">{formatDateTime(data.estimated_enqueue_time) ?? t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("estimatedDequeueTime")}</label>
                                    <div className="info-value">{formatDateTime(data.estimated_dequeue_time) ?? t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("joinedQueue")}</label>
                                    <div className="info-value">{data.joined_queue ? t("yes") : t("no")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("isScheduled")}</label>
                                    <div className="info-value">{data.is_scheduled ? t("yes") : t("no")}</div>
                                </div>
                                <div className="info-field full-width">
                                    <label className="info-label">{t("notes")}</label>
                                    <div className="info-value">{data.notes || t("notAvailable")}</div>
                                </div>
                                <div className="info-field full-width">
                                    <label className="info-label">{t("cancellationReason")}</label>
                                    <div className="info-value">{data.cancellation_reason || t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("rescheduleCount")}</label>
                                    <div className="info-value">{data.reschedule_count ?? 0}</div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default QueueUserDetail;
