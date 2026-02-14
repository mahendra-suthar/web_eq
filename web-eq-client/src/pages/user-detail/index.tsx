import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { UserService, UserDetailResponse } from '../../services/user/user.service';
import { RouterConstant } from '../../routers/index';
import './user-detail.scss';

const formatDate = (value?: string | null) => {
    if (value == null || value === '') return null;
    try {
        const d = new Date(value);
        return isNaN(d.getTime()) ? value : d.toLocaleDateString();
    } catch {
        return value;
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

const UserDetail = () => {
    const { t } = useTranslation();
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const userService = useMemo(() => new UserService(), []);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>('');
    const [data, setData] = useState<UserDetailResponse | null>(null);

    useEffect(() => {
        if (!userId) return;
        setLoading(true);
        setError('');
        userService
            .getUserDetail(userId)
            .then(setData)
            .catch((err: any) => {
                const msg =
                    err?.response?.data?.detail?.message ||
                    err?.message ||
                    t('failedToLoadQueueUsers') ||
                    'Failed to load user';
                setError(msg);
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [userId, userService, t]);

    const handleBack = () => navigate(RouterConstant.ROUTERS_PATH.ALLUSERS);

    if (!userId) {
        return (
            <div className="user-detail-page">
                <div className="content-card">
                    <div className="error-message">{t('notAvailable')}</div>
                    <button type="button" className="btn btn-secondary" onClick={handleBack}>
                        {t('back')}
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="user-detail-page">
                <div className="content-card">
                    <div className="loading-state">{t('loading')}</div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="user-detail-page">
                <div className="content-card">
                    <div className="error-message">{error || t('notAvailable')}</div>
                    <button type="button" className="btn btn-secondary" onClick={handleBack}>
                        {t('back')}
                    </button>
                </div>
            </div>
        );
    }

    const user = data.user_info;
    const initials = (user.full_name || user.phone_number || '?').charAt(0).toUpperCase();
    const genderDisplay =
        user.gender != null
            ? user.gender === 1
                ? t('male')
                : user.gender === 2
                  ? t('female')
                  : t('notAvailable')
            : t('notAvailable');

    return (
        <div className="user-detail-page">
            <div className="content-card">
                <div className="card-header section-header-actions">
                    <h2 className="card-title">{t('userDetail') || 'User Detail'}</h2>
                    <button type="button" className="btn btn-secondary" onClick={handleBack}>
                        {t('back')}
                    </button>
                </div>

                <div className="detail-sections">
                    <section className="detail-section user-info-card">
                        <h3 className="section-title">{t('userInformation')}</h3>
                        <div className="section-content user-section">
                            <div className="user-avatar-block">
                                {user.profile_picture ? (
                                    <img src={user.profile_picture} alt="" className="user-avatar-img" />
                                ) : (
                                    <div className="user-avatar-placeholder">{initials}</div>
                                )}
                            </div>
                            <div className="info-grid">
                                <div className="info-field">
                                    <span className="info-label">{t('fullName')}</span>
                                    <span className="info-value">{user.full_name || t('notAvailable')}</span>
                                </div>
                                <div className="info-field">
                                    <span className="info-label">{t('email')}</span>
                                    <span className="info-value">{user.email || t('notAvailable')}</span>
                                </div>
                                <div className="info-field">
                                    <span className="info-label">{t('phoneNumber')}</span>
                                    <span className="info-value">{user.phone_number || t('notAvailable')}</span>
                                </div>
                                <div className="info-field">
                                    <span className="info-label">{t('dateOfBirth')}</span>
                                    <span className="info-value">{formatDate(user.date_of_birth) ?? t('notAvailable')}</span>
                                </div>
                                <div className="info-field">
                                    <span className="info-label">{t('gender')}</span>
                                    <span className="info-value">{genderDisplay}</span>
                                </div>
                                <div className="info-field">
                                    <span className="info-label">{t('memberSince') || 'Member since'}</span>
                                    <span className="info-value">{formatDate(user.member_since) ?? t('notAvailable')}</span>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="detail-section queue-summary-section">
                        <h3 className="section-title">{t('queueSummary') || 'Queue-wise Appointment Summary'}</h3>
                        <div className="section-content">
                            {data.queue_summary.length === 0 ? (
                                <div className="empty-state">{t('noQueueUsersFound') || 'No appointments yet.'}</div>
                            ) : (
                                <div className="table-container">
                                    <table className="data-table summary-table">
                                        <thead>
                                            <tr>
                                                <th>{t('queue')}</th>
                                                <th>{t('totalAppointments')}</th>
                                                <th>{t('lastVisit')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.queue_summary.map((row) => (
                                                <tr key={row.queue_id}>
                                                    <td>{row.queue_name}</td>
                                                    <td>{row.total_appointments}</td>
                                                    <td>{formatDateTime(row.last_visit) ?? t('notAvailable')}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default UserDetail;
