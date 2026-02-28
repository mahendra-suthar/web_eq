import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressData, DaySchedule } from '../../utils/businessRegistrationStore';
import { ProfileService, UnifiedProfileResponse } from '../../services/profile/profile.service';
import { BusinessService } from '../../services/business/business.service';
import { EmployeeService } from '../../services/employee/employee.service';
import { OTPService } from '../../services/otp/otp.service';
import { QueueService, QueueDetailData } from '../../services/queue/queue.service';
import { emailRegex, formatDurationMinutes, getQueueStatusLabel } from '../../utils/utils';
import { Tabs } from '../../components/tabs/Tabs';
import './employee-profile.scss';

interface UserProfileData {
    fullName: string;
    phoneDisplay: string;
    email: string;
}

interface EmployeeProfileData {
    fullName: string;
    email: string;
    phoneDisplay: string;
    profilePicture?: string | null;
    businessName: string;
    isVerified: boolean;
}

type TabType = 'overview' | 'location' | 'schedule' | 'queue';

const EmployeeProfile = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string>("");
    const [editingTab, setEditingTab] = useState<TabType | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string>("");

    const profileService = useMemo(() => new ProfileService(), []);
    const businessService = useMemo(() => new BusinessService(), []);
    const employeeService = useMemo(() => new EmployeeService(), []);
    const otpService = useMemo(() => new OTPService(), []);
    const queueService = useMemo(() => new QueueService(), []);

    const [employeeId, setEmployeeId] = useState<string>("");
    const [ownerCountryCode, setOwnerCountryCode] = useState<string>("");
    const [ownerPhoneNumber, setOwnerPhoneNumber] = useState<string>("");
    const [employeeCountryCode, setEmployeeCountryCode] = useState<string>("");
    const [employeePhoneNumber, setEmployeePhoneNumber] = useState<string>("");

    const [userData, setUserData] = useState<UserProfileData>({
        fullName: "",
        phoneDisplay: "",
        email: "",
    });

    const [employeeData, setEmployeeData] = useState<EmployeeProfileData>({
        fullName: "",
        email: "",
        phoneDisplay: "",
        profilePicture: null,
        businessName: "",
        isVerified: false,
    });

    const [queueId, setQueueId] = useState<string | null>(null);
    const [queueDetail, setQueueDetail] = useState<QueueDetailData | null>(null);
    const [queueDetailLoading, setQueueDetailLoading] = useState(false);
    const [queueDetailError, setQueueDetailError] = useState<string>("");

    const [locationData, setLocationData] = useState<AddressData>({
        unit_number: "",
        building: "",
        floor: "",
        street_1: "",
        street_2: "",
        city: "",
        district: "",
        state: "",
        postal_code: "",
        country: "INDIA",
    });

    const [scheduleData, setScheduleData] = useState({
        isAlwaysOpen: false,
        schedule: [] as DaySchedule[],
    });

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
        setFetching(true);
        setError("");
        try {
            const profile: UnifiedProfileResponse = await profileService.getProfile();
            if (profile.profile_type !== "EMPLOYEE" || !profile.employee) {
                setError(t("employeeProfile") + " - " + t("notAvailable"));
                setFetching(false);
                return;
            }
            const u = profile.user;
            const userPhoneDisplay = u?.country_code && u?.phone_number ? `${u.country_code} ${u.phone_number}` : "";
            setOwnerCountryCode(u?.country_code || "");
            setOwnerPhoneNumber(u?.phone_number || "");
            setEmployeeId(profile.employee.uuid);
            setUserData({
                fullName: u?.full_name?.trim() || "",
                phoneDisplay: userPhoneDisplay,
                email: u?.email?.trim() || "",
            });
            const emp = profile.employee;
            const empPhoneDisplay = emp?.country_code && emp?.phone_number
                ? `${emp.country_code} ${emp.phone_number}` : (emp?.phone_number || "");
            setEmployeeCountryCode(emp?.country_code || "");
            setEmployeePhoneNumber(emp?.phone_number || "");
            setQueueId(emp?.queue_id ?? (emp?.queue as { uuid?: string })?.uuid ?? null);
            setEmployeeData({
                fullName: emp?.full_name?.trim() || "",
                email: emp?.email?.trim() || "",
                phoneDisplay: empPhoneDisplay,
                profilePicture: emp?.profile_picture || profile.user?.profile_picture || null,
                businessName: profile.business?.name || "",
                isVerified: emp?.is_verified ?? false,
            });
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
                latitude: profile.address.latitude,
                longitude: profile.address.longitude,
            } : {
                unit_number: "", building: "", floor: "", street_1: "", street_2: "",
                city: "", district: "", state: "", postal_code: "", country: "INDIA",
            });
            const mappedSchedule: DaySchedule[] = dayNames.map(day => {
                const scheduleItem = profile.schedule?.schedules.find((s: { day_of_week: number }) => s.day_of_week === day.day_of_week);
                return {
                    day_of_week: day.day_of_week,
                    day_name: day.day_name,
                    is_open: scheduleItem?.is_open || false,
                    opening_time: scheduleItem?.opening_time || "",
                    closing_time: scheduleItem?.closing_time || "",
                };
            });
            setScheduleData({ isAlwaysOpen: profile.schedule?.is_always_open ?? false, schedule: mappedSchedule });
        } catch (err: any) {
            setError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadEmployees"));
        } finally {
            setFetching(false);
        }
    }, [profileService, dayNames, t]);

    useEffect(() => {
        fetchProfile();
    }, [fetchProfile]);

    useEffect(() => {
        if (!queueId) {
            setQueueDetail(null);
            setQueueDetailError("");
            return;
        }
        setQueueDetailLoading(true);
        setQueueDetailError("");
        queueService
            .getQueueDetail(queueId)
            .then(setQueueDetail)
            .catch((err: unknown) => {
                const e = err as { response?: { data?: { detail?: string } }; message?: string };
                setQueueDetailError(e?.response?.data?.detail || (e?.message as string) || t("failedToLoadQueue") || "Failed to load queue");
                setQueueDetail(null);
            })
            .finally(() => setQueueDetailLoading(false));
    }, [queueId, queueService, t]);

    const handleSaveOverview = async () => {
        const userFullName = userData.fullName.trim();
        const userEmail = userData.email.trim() || undefined;
        if (!userFullName) {
            setSaveError(t("fullNameRequired"));
            return;
        }
        if (userEmail && !emailRegex.test(userEmail)) {
            setSaveError(t("emailInvalid"));
            return;
        }
        const empFullName = employeeData.fullName.trim();
        const empEmail = employeeData.email.trim() || undefined;
        if (!empFullName) {
            setSaveError(t("fullNameRequired"));
            return;
        }
        if (empEmail && !emailRegex.test(empEmail)) {
            setSaveError(t("emailInvalid"));
            return;
        }
        setSaving(true);
        setSaveError("");
        try {
            if (ownerCountryCode && ownerPhoneNumber) {
                await otpService.updateUserProfile(
                    ownerCountryCode, ownerPhoneNumber, userFullName, userEmail || null,
                    null, null, "business", "web"
                );
            }
            await employeeService.updateMyProfile({
                full_name: empFullName,
                email: empEmail || null,
                country_code: employeeCountryCode || null,
                phone_number: employeePhoneNumber.trim() || null,
            });
            await fetchProfile();
            setEditingTab(null);
        } catch (err: any) {
            setSaveError(err?.customMessage || err?.message || err?.response?.data?.detail?.message || t("failedToLoadEmployees"));
        } finally {
            setSaving(false);
        }
    };

    const handleSaveLocation = async () => {
        if (!locationData.street_1?.trim() || !locationData.city?.trim() || !locationData.state?.trim() || !locationData.postal_code?.trim()) {
            setSaveError(t("enterBusinessAddress"));
            return;
        }
        if (!employeeId) return;
        setSaving(true);
        setSaveError("");
        try {
            await profileService.updateAddress("EMPLOYEE", employeeId, {
                ...locationData,
                street_1: locationData.street_1,
                city: locationData.city,
                state: locationData.state,
                postal_code: locationData.postal_code,
            });
            await fetchProfile();
            setEditingTab(null);
        } catch (err: any) {
            setSaveError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadEmployees"));
        } finally {
            setSaving(false);
        }
    };

    const handleSaveSchedule = async () => {
        if (!scheduleData.isAlwaysOpen && scheduleData.schedule.every(d => !d.is_open)) {
            setSaveError(t("selectAtLeastOneDay"));
            return;
        }
        if (!employeeId) return;
        setSaving(true);
        setSaveError("");
        try {
            const schedules = scheduleData.schedule.map(d => ({
                day_of_week: d.day_of_week,
                is_open: d.is_open,
                opening_time: d.is_open && d.opening_time ? d.opening_time : undefined,
                closing_time: d.is_open && d.closing_time ? d.closing_time : undefined,
            }));
            await businessService.upsertSchedules(employeeId, "EMPLOYEE", schedules, scheduleData.isAlwaysOpen);
            await fetchProfile();
            setEditingTab(null);
        } catch (err: any) {
            setSaveError(err?.message || err?.response?.data?.detail?.message || t("failedToLoadEmployees"));
        } finally {
            setSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingTab(null);
        setSaveError("");
        fetchProfile();
    };

    const isEditing = editingTab === activeTab;
    const canEdit = !!employeeId;

    if (fetching) {
        return (
            <div className="employee-profile-page">
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
            <div className="employee-profile-page">
                <div className="content-card">
                    <div className="error-message" style={{ padding: "1rem", color: "red" }}>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="employee-profile-page">
            <div className="content-card">
                <div className="card-header">
                    <h2 className="card-title">{t("employeeProfile")}</h2>
                </div>

                <Tabs
                    tabs={[
                        { id: 'overview', label: t("basicInformation") },
                        { id: 'location', label: t("location") },
                        { id: 'schedule', label: t("schedule") },
                        { id: 'queue', label: t("queue") },
                    ]}
                    activeTabId={activeTab}
                    onTabChange={(id) => setActiveTab(id as TabType)}
                >
                {saveError && (
                    <div className="profile-save-error" role="alert">{saveError}</div>
                )}

                <div className="profile-content">
                    {activeTab === 'overview' && (
                        <div className="profile-section">
                            <div className="section-header section-header-actions">
                                <h2 className="section-title">{t("basicInformation")}</h2>
                                {canEdit && (
                                    !isEditing ? (
                                        <button type="button" className="btn btn-primary" onClick={() => setEditingTab('overview')}>
                                            {t("editProfile")}
                                        </button>
                                    ) : (
                                        <div className="section-actions">
                                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>{t("cancel")}</button>
                                            <button type="button" className="btn btn-primary" onClick={handleSaveOverview} disabled={saving}>
                                                {saving ? t("saving") : t("saveChanges")}
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>
                            <div className="section-content">
                                <div className="info-block user-block">
                                    <h3 className="info-block-title">{t("userInformation")}</h3>
                                    <div className="info-grid">
                                        <div className="info-field">
                                            <label className="info-label">{t("fullName")}</label>
                                            {isEditing ? (
                                                <input type="text" className="info-input" value={userData.fullName}
                                                    onChange={e => setUserData(prev => ({ ...prev, fullName: e.target.value }))}
                                                    placeholder={t("enterFullName")} />
                                            ) : (
                                                <div className="info-value">{userData.fullName || t("notAvailable")}</div>
                                            )}
                                        </div>
                                        <div className="info-field">
                                            <label className="info-label">{t("phoneNumber")}</label>
                                            <div className="info-value info-value-readonly">{userData.phoneDisplay || t("notAvailable")}</div>
                                        </div>
                                        <div className="info-field">
                                            <label className="info-label">{t("email")}</label>
                                            {isEditing ? (
                                                <input type="email" className="info-input" value={userData.email}
                                                    onChange={e => setUserData(prev => ({ ...prev, email: e.target.value }))}
                                                    placeholder={t("enterEmail")} />
                                            ) : (
                                                <div className="info-value">{userData.email || t("notAvailable")}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="info-block employee-info-block">
                                    <h3 className="info-block-title">{t("employeeInformation")}</h3>
                                    <div className="basic-info-layout">
                                        <div className="profile-picture-container">
                                            <div className="profile-picture-wrapper">
                                                {employeeData.profilePicture ? (
                                                    <img src={employeeData.profilePicture} alt="Employee Profile" className="profile-picture" />
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
                                                {isEditing ? (
                                                    <input type="text" className="info-input" value={employeeData.fullName}
                                                        onChange={e => setEmployeeData(prev => ({ ...prev, fullName: e.target.value }))}
                                                        placeholder={t("enterFullName")} />
                                                ) : (
                                                    <div className="info-value">{employeeData.fullName || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            <div className="info-field">
                                                <label className="info-label">{t("email")}</label>
                                                {isEditing ? (
                                                    <input type="email" className="info-input" value={employeeData.email}
                                                        onChange={e => setEmployeeData(prev => ({ ...prev, email: e.target.value }))}
                                                        placeholder={t("enterEmail")} />
                                                ) : (
                                                    <div className="info-value">{employeeData.email || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            <div className="info-field">
                                                <label className="info-label">{t("phoneNumber")}</label>
                                                {isEditing ? (
                                                    <input type="tel" className="info-input" value={employeePhoneNumber}
                                                        onChange={e => setEmployeePhoneNumber(e.target.value)}
                                                        placeholder={t("enterPhoneNumber")} />
                                                ) : (
                                                    <div className="info-value">{employeeData.phoneDisplay || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            {employeeData.businessName && (
                                                <div className="info-field">
                                                    <label className="info-label">{t("business")}</label>
                                                    <div className="info-value info-value-readonly">{employeeData.businessName}</div>
                                                </div>
                                            )}
                                            <div className="info-field">
                                                <label className="info-label">{t("verified")}</label>
                                                <div className="info-value info-value-readonly">{employeeData.isVerified ? t("yes") : t("no")}</div>
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
                                {canEdit && (
                                    !isEditing ? (
                                        <button type="button" className="btn btn-primary" onClick={() => setEditingTab('location')}>{t("editProfile")}</button>
                                    ) : (
                                        <div className="section-actions">
                                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>{t("cancel")}</button>
                                            <button type="button" className="btn btn-primary" onClick={handleSaveLocation} disabled={saving}>
                                                {saving ? t("saving") : t("saveChanges")}
                                            </button>
                                        </div>
                                    )
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
                                            {isEditing ? (
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
                                            {isEditing ? (
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
                                            {isEditing ? (
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
                                {canEdit && (
                                    !isEditing ? (
                                        <button type="button" className="btn btn-primary" onClick={() => setEditingTab('schedule')}>{t("editProfile")}</button>
                                    ) : (
                                        <div className="section-actions">
                                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>{t("cancel")}</button>
                                            <button type="button" className="btn btn-primary" onClick={handleSaveSchedule} disabled={saving}>
                                                {saving ? t("saving") : t("saveChanges")}
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>
                            <div className="section-content">
                                <div className="schedule-header">
                                    <div className="info-field">
                                        <label className="info-label">{t("alwaysOpen")}</label>
                                        {isEditing ? (
                                            <label className="schedule-toggle-label">
                                                <input
                                                    type="checkbox"
                                                    checked={scheduleData.isAlwaysOpen}
                                                    onChange={e => {
                                                        const checked = e.target.checked;
                                                        setScheduleData(prev => ({
                                                            ...prev,
                                                            isAlwaysOpen: checked,
                                                            schedule: checked
                                                                ? prev.schedule.map(d => ({ ...d, is_open: true, opening_time: "00:00", closing_time: "23:59" }))
                                                                : prev.schedule.map(d => ({ ...d, is_open: false, opening_time: "", closing_time: "" })),
                                                        }));
                                                    }}
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
                                                    {isEditing ? (
                                                        <label className="schedule-toggle-label">
                                                            <input type="checkbox" checked={day.is_open}
                                                                onChange={() => {
                                                                    const next = [...scheduleData.schedule];
                                                                    next[idx] = { ...day, is_open: !day.is_open, opening_time: !day.is_open ? "09:00" : "", closing_time: !day.is_open ? "18:00" : "" };
                                                                    setScheduleData(prev => ({ ...prev, schedule: next }));
                                                                }} />
                                                            <span>{day.day_name}</span>
                                                        </label>
                                                    ) : (
                                                        <span>{day.day_name}</span>
                                                    )}
                                                </div>
                                                {day.is_open ? (
                                                    <div className="schedule-times">
                                                        {isEditing ? (
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
                        <div className="profile-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("queue")}</h2>
                            </div>
                            <div className="section-content">
                                {!queueId ? (
                                    <p className="info-value">{t("noQueueAssigned") || "No queue assigned."}</p>
                                ) : queueDetailLoading ? (
                                    <div className="loading-state" style={{ padding: "1.5rem", textAlign: "center" }}>
                                        {t("loading")}
                                    </div>
                                ) : queueDetailError ? (
                                    <p className="error-message" style={{ color: "var(--danger, #dc3545)" }}>{queueDetailError}</p>
                                ) : queueDetail ? (
                                    <>
                                        <div className="info-block">
                                            <div className="info-grid">
                                                <div className="info-field">
                                                    <label className="info-label">{t("queueName")}</label>
                                                    <div className="info-value">{queueDetail.name || t("notAvailable")}</div>
                                                </div>
                                                <div className="info-field">
                                                    <label className="info-label">{t("status")}</label>
                                                    <div className="info-value">{getQueueStatusLabel(queueDetail.status, t)}</div>
                                                </div>
                                                <div className="info-field">
                                                    <label className="info-label">{t("queueLimit")}</label>
                                                    <div className="info-value">{queueDetail.limit != null ? String(queueDetail.limit) : "—"}</div>
                                                </div>
                                                {queueDetail.current_length != null && (
                                                    <div className="info-field">
                                                        <label className="info-label">{t("currentLength")}</label>
                                                        <div className="info-value">{queueDetail.current_length}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="info-block queue-services-block">
                                            <h3 className="info-block-title">{t("queueServices") || "Queue services"}</h3>
                                            {!queueDetail.services || queueDetail.services.length === 0 ? (
                                                <p className="info-value">{t("noServicesAssigned") || "No services assigned to this queue."}</p>
                                            ) : (
                                                <div className="queue-services-table-wrap">
                                                    <table className="data-table queue-services-table">
                                                        <thead>
                                                            <tr>
                                                                <th>{t("serviceName")}</th>
                                                                <th>{t("serviceDescription") || "Description"}</th>
                                                                <th>{t("fee")}</th>
                                                                <th>{t("averageServiceTime") || "Avg. time"}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {queueDetail.services.map((svc) => (
                                                                <tr key={svc.uuid}>
                                                                    <td>{svc.service_name ?? t("notAvailable")}</td>
                                                                    <td>{svc.description ?? t("notAvailable")}</td>
                                                                    <td>{svc.service_fee != null ? String(svc.service_fee) : t("notAvailable")}</td>
                                                                    <td>{svc.avg_service_time != null ? formatDurationMinutes(svc.avg_service_time) : t("notAvailable")}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
                </Tabs>
            </div>
        </div>
    );
};

export default EmployeeProfile;
