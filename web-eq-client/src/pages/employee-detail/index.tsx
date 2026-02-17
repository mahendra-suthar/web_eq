import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AddressData, DaySchedule } from '../../utils/businessRegistrationStore';
import { ProfileService, EmployeeDetailsResponse, QueueDetailInfo } from '../../services/profile/profile.service';
import { EmployeeService } from '../../services/employee/employee.service';
import { BusinessService } from '../../services/business/business.service';
import { Tabs } from '../../components/tabs/Tabs';
import { RouterConstant } from '../../routers/index';
import { emailRegex } from '../../utils/utils';
import './employee-detail.scss';

const iconOverview = (
    <svg className="tab-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);
const iconLocation = (
    <svg className="tab-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);
const iconSchedule = (
    <svg className="tab-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
);
const iconQueue = (
    <svg className="tab-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
        <path d="M9 14h6M9 18h6" />
    </svg>
);

type TabType = 'overview' | 'location' | 'schedule' | 'queue';

const EmployeeDetail = () => {
    const { t } = useTranslation();
    const { employeeId } = useParams<{ employeeId: string }>();
    const navigate = useNavigate();
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string>("");

    const profileService = useMemo(() => new ProfileService(), []);
    const employeeService = useMemo(() => new EmployeeService(), []);
    const businessService = useMemo(() => new BusinessService(), []);

    const [userDisplay, setUserDisplay] = useState({ fullName: "", phoneDisplay: "", email: "" });
    const [employeeDisplay, setEmployeeDisplay] = useState({
        fullName: "", email: "", phoneDisplay: "", queueName: "", isVerified: false, profilePicture: null as string | null,
    });
    const [employeeCountryCode, setEmployeeCountryCode] = useState("");
    const [employeePhoneNumber, setEmployeePhoneNumber] = useState("");

    const [editingOverview, setEditingOverview] = useState(false);
    const [editingLocation, setEditingLocation] = useState(false);
    const [editingSchedule, setEditingSchedule] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string>("");
    const [queueDisplay, setQueueDisplay] = useState<{ name: string; uuid?: string; status?: number | null } | null>(null);
    const [locationData, setLocationData] = useState<AddressData>({
        unit_number: "", building: "", floor: "", street_1: "", street_2: "",
        city: "", district: "", state: "", postal_code: "", country: "INDIA",
    });
    const [scheduleData, setScheduleData] = useState({ isAlwaysOpen: false, schedule: [] as DaySchedule[] });
    const [queueDetail, setQueueDetail] = useState<QueueDetailInfo | null>(null);

    const dayNames = useMemo(() => [
        { day_of_week: 0, day_name: t("sunday") },
        { day_of_week: 1, day_name: t("monday") },
        { day_of_week: 2, day_name: t("tuesday") },
        { day_of_week: 3, day_name: t("wednesday") },
        { day_of_week: 4, day_name: t("thursday") },
        { day_of_week: 5, day_name: t("friday") },
        { day_of_week: 6, day_name: t("saturday") },
    ], [t]);

    const fetchProfile = useCallback(async () => {
        if (!employeeId) return;
        setFetching(true);
        setError("");
        try {
            const profile: EmployeeDetailsResponse = await profileService.getEmployeeProfile(employeeId);
            const user = profile.user;
            const userPhoneDisplay = user?.country_code && user?.phone_number
                ? `${user.country_code} ${user.phone_number}` : "";
            setUserDisplay({
                fullName: user?.full_name?.trim() || "",
                phoneDisplay: userPhoneDisplay,
                email: user?.email?.trim() || "",
            });
            const emp = profile.employee;
            if (emp) {
                const empPhoneDisplay = emp?.country_code && emp?.phone_number
                    ? `${emp.country_code} ${emp.phone_number}` : (emp?.phone_number || "");
                setEmployeeDisplay({
                    fullName: emp?.full_name?.trim() || "",
                    email: emp?.email?.trim() || "",
                    phoneDisplay: empPhoneDisplay,
                    queueName: emp?.queue?.name || "",
                    isVerified: emp?.is_verified ?? false,
                    profilePicture: emp?.profile_picture || null,
                });
                setEmployeeCountryCode(emp?.country_code || "");
                setEmployeePhoneNumber(emp?.phone_number || "");
                if (emp?.queue) {
                    setQueueDisplay({
                        name: emp.queue.name,
                        uuid: emp.queue.uuid,
                        status: emp.queue.status ?? undefined,
                    });
                } else {
                    setQueueDisplay(null);
                }
            } else {
                setQueueDisplay(null);
            }
            setLocationData(profile.address ? {
                unit_number: profile.address.unit_number || "",
                building: profile.address.building || "",
                floor: profile.address.floor || "",
                street_1: profile.address.street_1,
                street_2: profile.address.street_2 || "",
                city: profile.address.city,
                district: profile.address.district || "",
                state: profile.address.state,
                postal_code: profile.address.postal_code,
                country: profile.address.country || "INDIA",
            } : {
                unit_number: "", building: "", floor: "", street_1: "", street_2: "",
                city: "", district: "", state: "", postal_code: "", country: "INDIA",
            });
            const mappedSchedule: DaySchedule[] = dayNames.map(day => {
                const scheduleItem = profile.schedule?.schedules.find(
                    (s: { day_of_week: number }) => s.day_of_week === day.day_of_week
                );
                return {
                    day_of_week: day.day_of_week,
                    day_name: day.day_name,
                    is_open: scheduleItem?.is_open || false,
                    opening_time: scheduleItem?.opening_time || "",
                    closing_time: scheduleItem?.closing_time || "",
                };
            });
            setScheduleData({
                isAlwaysOpen: profile.schedule?.is_always_open || false,
                schedule: mappedSchedule,
            });
            setQueueDetail(profile.queue_detail ?? null);
        } catch (err: any) {
            setError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadEmployees"));
        } finally {
            setFetching(false);
        }
    }, [employeeId, profileService, dayNames, t]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    useEffect(() => {
        const openTab = (location.state as { openTab?: TabType })?.openTab;
        if (openTab === 'queue' && queueDisplay?.uuid) {
            setActiveTab('queue');
        }
    }, [queueDisplay?.uuid, location.state]);

    const handleSaveEmployee = useCallback(async () => {
        if (!employeeId) return;
        const fullName = employeeDisplay.fullName.trim();
        if (!fullName) {
            setSaveError(t("fullNameRequired"));
            return;
        }
        const email = employeeDisplay.email?.trim() || undefined;
        if (email && !emailRegex.test(email)) {
            setSaveError(t("emailInvalid"));
            return;
        }
        setSaveError("");
        setSaving(true);
        try {
            await employeeService.updateEmployee(employeeId, {
                full_name: fullName,
                email: email || undefined,
                country_code: employeeCountryCode.trim() || undefined,
                phone_number: employeePhoneNumber.trim() || undefined,
            });
            await fetchProfile();
            setEditingOverview(false);
        } catch (err: any) {
            setSaveError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadEmployees"));
        } finally {
            setSaving(false);
        }
    }, [employeeId, employeeDisplay.fullName, employeeDisplay.email, employeeCountryCode, employeePhoneNumber, employeeService, fetchProfile, t]);

    const handleCancelEdit = useCallback(() => {
        setEditingOverview(false);
        setSaveError("");
        fetchProfile();
    }, [fetchProfile]);

    const handleSaveLocation = useCallback(async () => {
        if (!employeeId) return;
        if (!locationData.street_1?.trim() || !locationData.city?.trim() || !locationData.state?.trim() || !locationData.postal_code?.trim()) {
            setSaveError(t("enterBusinessAddress"));
            return;
        }
        setSaveError("");
        setSaving(true);
        try {
            await profileService.updateAddress("EMPLOYEE", employeeId, {
                ...locationData,
                street_1: locationData.street_1,
                city: locationData.city,
                state: locationData.state,
                postal_code: locationData.postal_code,
            });
            await fetchProfile();
            setEditingLocation(false);
        } catch (err: any) {
            setSaveError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadEmployees"));
        } finally {
            setSaving(false);
        }
    }, [employeeId, locationData, profileService, fetchProfile, t]);

    const handleCancelLocation = useCallback(() => {
        setEditingLocation(false);
        setSaveError("");
        fetchProfile();
    }, [fetchProfile]);

    const handleSaveSchedule = useCallback(async () => {
        if (!employeeId) return;
        if (!scheduleData.isAlwaysOpen && scheduleData.schedule.every(d => !d.is_open)) {
            setSaveError(t("selectAtLeastOneDay"));
            return;
        }
        setSaveError("");
        setSaving(true);
        try {
            const schedules = scheduleData.schedule.map(d => ({
                day_of_week: d.day_of_week,
                is_open: d.is_open,
                opening_time: d.is_open && d.opening_time ? d.opening_time : undefined,
                closing_time: d.is_open && d.closing_time ? d.closing_time : undefined,
            }));
            await businessService.upsertSchedules(employeeId, "EMPLOYEE", schedules, scheduleData.isAlwaysOpen);
            await fetchProfile();
            setEditingSchedule(false);
        } catch (err: any) {
            setSaveError(err?.message || err?.response?.data?.detail?.message || t("failedToLoadEmployees"));
        } finally {
            setSaving(false);
        }
    }, [employeeId, scheduleData, businessService, fetchProfile, t]);

    const handleCancelSchedule = useCallback(() => {
        setEditingSchedule(false);
        setSaveError("");
        fetchProfile();
    }, [fetchProfile]);

    const tabItems = useMemo(() => {
        const items: { id: TabType; label: string; icon: React.ReactNode }[] = [
            { id: 'overview', label: t("basicInformation"), icon: iconOverview },
            { id: 'location', label: t("location"), icon: iconLocation },
            { id: 'schedule', label: t("schedule"), icon: iconSchedule },
        ];
        if (queueDisplay?.uuid) {
            items.push({ id: 'queue', label: t("queue"), icon: iconQueue });
        }
        return items;
    }, [t, queueDisplay?.uuid]);

    if (!employeeId) {
        return (
            <div className="employee-detail-page">
                <div className="content-card">
                    <div className="error-message">{t("notAvailable")}</div>
                </div>
            </div>
        );
    }

    if (fetching) {
        return (
            <div className="employee-detail-page">
                <div className="content-card">
                    <div className="loading-state" style={{ padding: "2rem", textAlign: "center" }}>
                        {t("loading")}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="employee-detail-page">
                <div className="content-card">
                    <div className="error-message" style={{ padding: "1rem", color: "red" }}>{error}</div>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.EMPLOYEES)}>
                        {t("backToEmployees")}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="employee-detail-page">
            <div className="content-card">
                <div className="card-header section-header-actions">
                    <h2 className="card-title">{t("employeeDetail")}</h2>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.EMPLOYEES)}>
                        {t("backToEmployees")}
                    </button>
                </div>

                <Tabs
                    tabs={tabItems}
                    activeTabId={activeTab}
                    onTabChange={(id) => setActiveTab(id as TabType)}
                >
                <div className="profile-content">
                    {saveError && (
                        <div className="employee-detail-save-error" role="alert">
                            {saveError}
                        </div>
                    )}
                    {activeTab === 'overview' && (
                        <div className="profile-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("basicInformation")}</h2>
                            </div>
                            <div className="section-content">
                                <div className="info-block owner-block">
                                    <h3 className="info-block-title">{t("ownerInfo")}</h3>
                                    <div className="info-grid">
                                        <div className="info-field">
                                            <label className="info-label">{t("fullName")}</label>
                                            <div className="info-value">{userDisplay.fullName || t("notAvailable")}</div>
                                        </div>
                                        <div className="info-field">
                                            <label className="info-label">{t("phoneNumber")}</label>
                                            <div className="info-value info-value-readonly">{userDisplay.phoneDisplay || t("notAvailable")}</div>
                                        </div>
                                        <div className="info-field">
                                            <label className="info-label">{t("email")}</label>
                                            <div className="info-value">{userDisplay.email || t("notAvailable")}</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="info-block employee-block">
                                    <div className="info-block-header-actions">
                                        <h3 className="info-block-title">{t("employee")}</h3>
                                        {!editingOverview ? (
                                            <button type="button" className="btn btn-primary" onClick={() => setEditingOverview(true)}>
                                                {t("editProfile")}
                                            </button>
                                        ) : (
                                            <div className="section-actions">
                                                <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                                                    {t("cancel")}
                                                </button>
                                                <button type="button" className="btn btn-primary" onClick={handleSaveEmployee} disabled={saving}>
                                                    {saving ? t("saving") : t("saveChanges")}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="basic-info-layout">
                                        <div className="profile-picture-container">
                                            <div className="profile-picture-wrapper">
                                                {employeeDisplay.profilePicture ? (
                                                    <img src={employeeDisplay.profilePicture} alt="" className="profile-picture" />
                                                ) : (
                                                    <div className="profile-picture-placeholder">
                                                        <span className="placeholder-icon">👤</span>
                                                        <span className="placeholder-text">{t("noProfilePicture")}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="info-grid">
                                            <div className="info-field">
                                                <label className="info-label">{t("fullName")}</label>
                                                {editingOverview ? (
                                                    <input
                                                        type="text"
                                                        className="info-input"
                                                        value={employeeDisplay.fullName}
                                                        onChange={e => setEmployeeDisplay(prev => ({ ...prev, fullName: e.target.value }))}
                                                        placeholder={t("enterFullName")}
                                                    />
                                                ) : (
                                                    <div className="info-value">{employeeDisplay.fullName || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            <div className="info-field">
                                                <label className="info-label">{t("email")}</label>
                                                {editingOverview ? (
                                                    <input
                                                        type="email"
                                                        className="info-input"
                                                        value={employeeDisplay.email}
                                                        onChange={e => setEmployeeDisplay(prev => ({ ...prev, email: e.target.value }))}
                                                        placeholder={t("enterEmail")}
                                                    />
                                                ) : (
                                                    <div className="info-value">{employeeDisplay.email || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            {editingOverview && (
                                                <div className="info-field">
                                                    <label className="info-label">{t("countryCode")}</label>
                                                    <input
                                                        type="text"
                                                        className="info-input"
                                                        value={employeeCountryCode}
                                                        onChange={e => setEmployeeCountryCode(e.target.value)}
                                                        placeholder="+91"
                                                    />
                                                </div>
                                            )}
                                            <div className="info-field">
                                                <label className="info-label">{t("phoneNumber")}</label>
                                                {editingOverview ? (
                                                    <input
                                                        type="tel"
                                                        className="info-input"
                                                        value={employeePhoneNumber}
                                                        onChange={e => setEmployeePhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 15))}
                                                        placeholder={t("enterPhoneNumber")}
                                                    />
                                                ) : (
                                                    <div className="info-value">{employeeDisplay.phoneDisplay || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            <div className="info-field">
                                                <label className="info-label">{t("isVerified")}</label>
                                                <span className={`status-badge ${employeeDisplay.isVerified ? 'active' : 'pending'}`}>
                                                    {employeeDisplay.isVerified ? t("verified") : t("unverified")}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'location' && (
                        <div className="profile-section">
                            <div className="section-header section-header-actions">
                                <h2 className="section-title">{t("location")}</h2>
                                {!editingLocation ? (
                                    <button type="button" className="btn btn-primary" onClick={() => setEditingLocation(true)}>
                                        {t("editProfile")}
                                    </button>
                                ) : (
                                    <div className="section-actions">
                                        <button type="button" className="btn btn-secondary" onClick={handleCancelLocation} disabled={saving}>{t("cancel")}</button>
                                        <button type="button" className="btn btn-primary" onClick={handleSaveLocation} disabled={saving}>
                                            {saving ? t("saving") : t("saveChanges")}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="section-content">
                                <div className="info-grid">
                                    {[
                                        { key: 'unit_number', label: t("unitNumber"), placeholder: t("enterUnitNumber") },
                                        { key: 'building', label: t("building"), placeholder: t("enterBuilding") },
                                        { key: 'floor', label: t("floor"), placeholder: t("enterFloor") },
                                    ].map(({ key, label, placeholder }) => (
                                        <div key={key} className="info-field">
                                            <label className="info-label">{label}</label>
                                            {editingLocation ? (
                                                <input type="text" className="info-input" value={(locationData as any)[key] || ""}
                                                    onChange={e => setLocationData(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} />
                                            ) : (
                                                <div className="info-value">{(locationData as any)[key] || t("notAvailable")}</div>
                                            )}
                                        </div>
                                    ))}
                                    {[
                                        { key: 'street_1', label: t("street1"), placeholder: t("enterStreet1"), fullWidth: true },
                                        { key: 'street_2', label: t("street2"), placeholder: t("enterStreet2"), fullWidth: true },
                                    ].map(({ key, label, placeholder, fullWidth }) => (
                                        <div key={key} className={`info-field ${fullWidth ? 'full-width' : ''}`}>
                                            <label className="info-label">{label}</label>
                                            {editingLocation ? (
                                                <input type="text" className="info-input" value={(locationData as any)[key] || ""}
                                                    onChange={e => setLocationData(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} />
                                            ) : (
                                                <div className="info-value">{(locationData as any)[key] || t("notAvailable")}</div>
                                            )}
                                        </div>
                                    ))}
                                    {[
                                        { key: 'city', label: t("city"), placeholder: t("enterCity") },
                                        { key: 'district', label: t("district"), placeholder: t("enterDistrict") },
                                        { key: 'state', label: t("state"), placeholder: t("state") },
                                        { key: 'postal_code', label: t("postalCode"), placeholder: t("postalCode") },
                                        { key: 'country', label: t("country"), placeholder: t("country") },
                                    ].map(({ key, label, placeholder }) => (
                                        <div key={key} className="info-field">
                                            <label className="info-label">{label}</label>
                                            {editingLocation ? (
                                                <input type="text" className="info-input" value={(locationData as any)[key] || ""}
                                                    onChange={e => setLocationData(prev => ({ ...prev, [key]: e.target.value }))} placeholder={placeholder} />
                                            ) : (
                                                <div className="info-value">{(locationData as any)[key] || t("notAvailable")}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'schedule' && (
                        <div className="profile-section">
                            <div className="section-header section-header-actions">
                                <h2 className="section-title">{t("schedule")}</h2>
                                {!editingSchedule ? (
                                    <button type="button" className="btn btn-primary" onClick={() => setEditingSchedule(true)}>
                                        {t("editProfile")}
                                    </button>
                                ) : (
                                    <div className="section-actions">
                                        <button type="button" className="btn btn-secondary" onClick={handleCancelSchedule} disabled={saving}>{t("cancel")}</button>
                                        <button type="button" className="btn btn-primary" onClick={handleSaveSchedule} disabled={saving}>
                                            {saving ? t("saving") : t("saveChanges")}
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="section-content">
                                <div className="schedule-header">
                                    <div className="info-field">
                                        <label className="info-label">{t("alwaysOpen")}</label>
                                        {editingSchedule ? (
                                            <label className="schedule-toggle-label">
                                                <input
                                                    type="checkbox"
                                                    checked={scheduleData.isAlwaysOpen}
                                                    onChange={e => setScheduleData(prev => ({ ...prev, isAlwaysOpen: e.target.checked }))}
                                                />
                                                <span>{scheduleData.isAlwaysOpen ? t("yes") : t("no")}</span>
                                            </label>
                                        ) : (
                                            <div className="info-value">{scheduleData.isAlwaysOpen ? t("yes") : t("no")}</div>
                                        )}
                                    </div>
                                </div>
                                {!scheduleData.isAlwaysOpen && (
                                    <div className="schedule-list">
                                        {scheduleData.schedule.map((day, idx) => (
                                            <div key={day.day_of_week} className="schedule-item">
                                                <div className="schedule-day">
                                                    {editingSchedule ? (
                                                        <label className="schedule-toggle-label">
                                                            <input
                                                                type="checkbox"
                                                                checked={day.is_open}
                                                                onChange={() => {
                                                                    const next = [...scheduleData.schedule];
                                                                    next[idx] = {
                                                                        ...day,
                                                                        is_open: !day.is_open,
                                                                        opening_time: !day.is_open ? "09:00" : "",
                                                                        closing_time: !day.is_open ? "18:00" : "",
                                                                    };
                                                                    setScheduleData(prev => ({ ...prev, schedule: next }));
                                                                }}
                                                            />
                                                            <span>{day.day_name}</span>
                                                        </label>
                                                    ) : (
                                                        <span>{day.day_name}</span>
                                                    )}
                                                </div>
                                                {day.is_open ? (
                                                    <div className="schedule-times">
                                                        {editingSchedule ? (
                                                            <>
                                                                <input type="time" className="time-input" value={day.opening_time || ""}
                                                                    onChange={e => {
                                                                        const next = [...scheduleData.schedule];
                                                                        next[idx] = { ...day, opening_time: e.target.value };
                                                                        setScheduleData(prev => ({ ...prev, schedule: next }));
                                                                    }} />
                                                                <span className="time-separator">-</span>
                                                                <input type="time" className="time-input" value={day.closing_time || ""}
                                                                    onChange={e => {
                                                                        const next = [...scheduleData.schedule];
                                                                        next[idx] = { ...day, closing_time: e.target.value };
                                                                        setScheduleData(prev => ({ ...prev, schedule: next }));
                                                                    }} />
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span>{day.opening_time}</span>
                                                                <span className="time-separator">-</span>
                                                                <span>{day.closing_time}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="schedule-times"><span>{t("closed")}</span></div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'queue' && (
                        <div className="profile-section queue-tab-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("queue")}</h2>
                            </div>
                            <div className="section-content">
                                {queueDetail ? (
                                    <>
                                        <div className="info-block queue-details-block">
                                            <h3 className="info-block-title">{t("queueDetails")}</h3>
                                            <div className="info-grid">
                                                <div className="info-field">
                                                    <label className="info-label">{t("queueName")}</label>
                                                    <div className="info-value">{queueDetail.name || t("notAvailable")}</div>
                                                </div>
                                                <div className="info-field">
                                                    <label className="info-label">{t("queueId")}</label>
                                                    <div className="info-value info-value-readonly">{queueDetail.uuid}</div>
                                                </div>
                                                {queueDetail.limit != null && (
                                                    <div className="info-field">
                                                        <label className="info-label">{t("queueLimit")}</label>
                                                        <div className="info-value">{queueDetail.limit}</div>
                                                    </div>
                                                )}
                                                {queueDetail.start_time != null && queueDetail.start_time !== "" && (
                                                    <div className="info-field">
                                                        <label className="info-label">{t("startTime")}</label>
                                                        <div className="info-value">{queueDetail.start_time}</div>
                                                    </div>
                                                )}
                                                {queueDetail.end_time != null && queueDetail.end_time !== "" && (
                                                    <div className="info-field">
                                                        <label className="info-label">{t("endTime")}</label>
                                                        <div className="info-value">{queueDetail.end_time}</div>
                                                    </div>
                                                )}
                                                {queueDetail.current_length != null && (
                                                    <div className="info-field">
                                                        <label className="info-label">{t("currentLength")}</label>
                                                        <div className="info-value">{queueDetail.current_length}</div>
                                                    </div>
                                                )}
                                                {queueDetail.status != null && (
                                                    <div className="info-field">
                                                        <label className="info-label">{t("status")}</label>
                                                        <div className="info-value">{queueDetail.status}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        {queueDetail.services && queueDetail.services.length > 0 ? (
                                            <div className="info-block queue-services-block">
                                                <h3 className="info-block-title">{t("services")}</h3>
                                                <div className="queue-services-table-wrap">
                                                    <table className="data-table queue-services-table">
                                                        <thead>
                                                            <tr>
                                                                <th>{t("serviceName")}</th>
                                                                <th>{t("serviceDescription")}</th>
                                                                <th>{t("fee")}</th>
                                                                <th>{t("averageServiceTime")}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {queueDetail.services.map((svc) => (
                                                                <tr key={svc.uuid}>
                                                                    <td>{svc.name || t("notAvailable")}</td>
                                                                    <td>{svc.description || t("notAvailable")}</td>
                                                                    <td>{svc.service_fee != null ? `${svc.service_fee}` : t("notAvailable")}</td>
                                                                    <td>{svc.avg_service_time != null ? `${svc.avg_service_time} ${t("minutes")}` : t("notAvailable")}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="info-block">
                                                <p className="info-value">{t("noServicesAssigned")}</p>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="info-value">{t("notAvailable")}</div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                </Tabs>
            </div>
        </div>
    );
};

export default EmployeeDetail;
