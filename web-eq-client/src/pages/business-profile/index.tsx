import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AddressData, DaySchedule } from '../../utils/businessRegistrationStore';
import { ProfileService, UnifiedProfileResponse } from '../../services/profile/profile.service';
import { BusinessService, Category } from '../../services/business/business.service';
import { OTPService } from '../../services/otp/otp.service';
import { emailRegex } from '../../utils/utils';
import { Tabs } from '../../components/tabs/Tabs';
import { RouterConstant } from '../../routers/index';
import './business-profile.scss';

interface BusinessProfileData {
    businessName: string;
    businessEmail: string;
    aboutBusiness?: string;
    category?: string;
    categoryId?: string;
    phoneNumber?: string;
    profilePicture?: string | null;
}

interface OwnerProfileData {
    fullName: string;
    phoneDisplay: string;
    email: string;
}

type TabType = 'overview' | 'location' | 'schedule';

const BusinessProfile = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string>("");
    const [editingTab, setEditingTab] = useState<TabType | null>(null);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string>("");

    const profileService = useMemo(() => new ProfileService(), []);
    const businessService = useMemo(() => new BusinessService(), []);
    const otpService = useMemo(() => new OTPService(), []);

    const [businessId, setBusinessId] = useState<string>("");
    const [ownerCountryCode, setOwnerCountryCode] = useState<string>("");
    const [ownerPhoneNumber, setOwnerPhoneNumber] = useState<string>("");

    const [ownerData, setOwnerData] = useState<OwnerProfileData>({
        fullName: "",
        phoneDisplay: "",
        email: "",
    });

    const [businessData, setBusinessData] = useState<BusinessProfileData>({
        businessName: "",
        businessEmail: "",
        aboutBusiness: "",
        category: "",
        categoryId: "",
        phoneNumber: "",
        profilePicture: null,
    });

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

    const [categories, setCategories] = useState<Category[]>([]);

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
            if (profile.profile_type !== "BUSINESS" || !profile.business) {
                setError(t("businessProfile") + " - " + t("notAvailable"));
                setFetching(false);
                return;
            }
            const owner = profile.user;
            const ownerPhoneDisplay = owner?.country_code && owner?.phone_number
                ? `${owner.country_code} ${owner.phone_number}`
                : "";
            setOwnerCountryCode(owner?.country_code || "");
            setOwnerPhoneNumber(owner?.phone_number || "");
            setBusinessId(profile.business.uuid);
            setOwnerData({
                fullName: owner?.full_name?.trim() || "",
                phoneDisplay: ownerPhoneDisplay,
                email: owner?.email?.trim() || "",
            });
            setBusinessData({
                businessName: profile.business.name,
                businessEmail: profile.business.email || "",
                aboutBusiness: profile.business.about_business || "",
                category: profile.business.category_name || "",
                categoryId: profile.business.category_id || "",
                phoneNumber: profile.business.phone_number,
                profilePicture: profile.business.profile_picture || null,
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
        if (editingTab === 'overview' && categories.length === 0) {
            businessService.getCategories().then(setCategories).catch(() => {});
        }
    }, [editingTab, categories.length, businessService]);

    const handleSaveOverview = async () => {
        setSaveError("");
        const fullName = ownerData.fullName.trim();
        const email = ownerData.email.trim() || undefined;
        if (!fullName) {
            setSaveError(t("fullNameRequired"));
            return;
        }
        if (email && !emailRegex.test(email)) {
            setSaveError(t("emailInvalid"));
            return;
        }
        if (!businessData.businessName.trim()) {
            setSaveError(t("businessNameRequired"));
            return;
        }
        if (businessData.businessEmail?.trim() && !emailRegex.test(businessData.businessEmail.trim())) {
            setSaveError(t("emailInvalid"));
            return;
        }
        setSaving(true);
        try {
            if (ownerCountryCode && ownerPhoneNumber) {
                await otpService.updateUserProfile(
                    ownerCountryCode, ownerPhoneNumber, fullName, email || null,
                    null, null, "business", "web"
                );
            }
            await businessService.updateBusinessBasicInfo({
                name: businessData.businessName.trim(),
                email: businessData.businessEmail?.trim() || undefined,
                about_business: businessData.aboutBusiness?.trim() || undefined,
                category_id: businessData.categoryId || undefined,
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
        if (!businessId) return;
        setSaving(true);
        setSaveError("");
        try {
            await profileService.updateAddress("BUSINESS", businessId, {
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
        if (!businessId) return;
        setSaving(true);
        setSaveError("");
        try {
            const schedules = scheduleData.schedule.map(d => ({
                day_of_week: d.day_of_week,
                is_open: d.is_open,
                opening_time: d.is_open && d.opening_time ? d.opening_time : undefined,
                closing_time: d.is_open && d.closing_time ? d.closing_time : undefined,
            }));
            await businessService.upsertSchedules(businessId, "BUSINESS", schedules, scheduleData.isAlwaysOpen);
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
    const canEdit = !!businessId;

    if (fetching) {
        return (
            <div className="business-profile-page">
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
            <div className="business-profile-page">
                <div className="content-card">
                    <div className="error-message" style={{ padding: "1rem", color: "red" }}>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="business-profile-page">
            <div className="content-card">
                <div className="card-header">
                    <h2 className="card-title">{t("businessProfile")}</h2>
                </div>

                <Tabs
                    tabs={[
                        { id: 'overview', label: t("basicInformation") },
                        { id: 'location', label: t("location") },
                        { id: 'schedule', label: t("schedule") },
                    ]}
                    activeTabId={activeTab}
                    onTabChange={(id) => setActiveTab(id as TabType)}
                >
                {saveError && (
                    <div className="profile-save-error" role="alert">
                        {saveError}
                    </div>
                )}

                <div className="profile-content">
                    {/* Overview Tab */}
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
                                            <button type="button" className="btn btn-secondary" onClick={handleCancelEdit} disabled={saving}>
                                                {t("cancel")}
                                            </button>
                                            <button type="button" className="btn btn-primary" onClick={handleSaveOverview} disabled={saving}>
                                                {saving ? t("saving") : t("saveChanges")}
                                            </button>
                                        </div>
                                    )
                                )}
                            </div>
                            <div className="section-content">
                                {/* Owner information */}
                                <div className="info-block owner-block">
                                    <h3 className="info-block-title">{t("ownerInfo")}</h3>
                                    <div className="info-grid">
                                        <div className="info-field">
                                            <label className="info-label">{t("fullName")}</label>
                                            {isEditing ? (
                                                <input
                                                    type="text"
                                                    className="info-input"
                                                    value={ownerData.fullName}
                                                    onChange={e => setOwnerData(prev => ({ ...prev, fullName: e.target.value }))}
                                                    placeholder={t("enterFullName")}
                                                />
                                            ) : (
                                                <div className="info-value">{ownerData.fullName || t("notAvailable")}</div>
                                            )}
                                        </div>
                                        <div className="info-field">
                                            <label className="info-label">{t("phoneNumber")}</label>
                                            <div className="info-value info-value-readonly">{ownerData.phoneDisplay || t("notAvailable")}</div>
                                        </div>
                                        <div className="info-field">
                                            <label className="info-label">{t("email")}</label>
                                            {isEditing ? (
                                                <input
                                                    type="email"
                                                    className="info-input"
                                                    value={ownerData.email}
                                                    onChange={e => setOwnerData(prev => ({ ...prev, email: e.target.value }))}
                                                    placeholder={t("enterEmail")}
                                                />
                                            ) : (
                                                <div className="info-value">{ownerData.email || t("notAvailable")}</div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Business details */}
                                <div className="info-block business-block">
                                    <h3 className="info-block-title">{t("businessBasicInfo")}</h3>
                                    <div className="basic-info-layout">
                                        <div className="profile-picture-container">
                                            <div className="profile-picture-wrapper">
                                                {businessData.profilePicture ? (
                                                    <img src={businessData.profilePicture} alt="Business Profile" className="profile-picture" />
                                                ) : (
                                                    <div className="profile-picture-placeholder">
                                                        <span className="placeholder-icon">🏢</span>
                                                        <span className="placeholder-text">{t("noProfilePicture")}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="info-grid">
                                            <div className="info-field">
                                                <label className="info-label">{t("businessName")}</label>
                                                {isEditing ? (
                                                    <input
                                                        type="text"
                                                        className="info-input"
                                                        value={businessData.businessName}
                                                        onChange={e => setBusinessData(prev => ({ ...prev, businessName: e.target.value }))}
                                                        placeholder={t("enterBusinessName")}
                                                    />
                                                ) : (
                                                    <div className="info-value">{businessData.businessName || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            <div className="info-field">
                                                <label className="info-label">{t("businessEmail")}</label>
                                                {isEditing ? (
                                                    <input
                                                        type="email"
                                                        className="info-input"
                                                        value={businessData.businessEmail}
                                                        onChange={e => setBusinessData(prev => ({ ...prev, businessEmail: e.target.value }))}
                                                        placeholder={t("enterBusinessEmail")}
                                                    />
                                                ) : (
                                                    <div className="info-value">{businessData.businessEmail || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            <div className="info-field">
                                                <label className="info-label">{t("phoneNumber")}</label>
                                                <div className="info-value info-value-readonly">{businessData.phoneNumber || t("notAvailable")}</div>
                                            </div>
                                            <div className="info-field">
                                                <label className="info-label">{t("category")}</label>
                                                {isEditing ? (
                                                    <select
                                                        className="info-input"
                                                        value={businessData.categoryId || ""}
                                                        onChange={e => {
                                                            const cat = categories.find(c => c.uuid === e.target.value);
                                                            setBusinessData(prev => ({
                                                                ...prev,
                                                                categoryId: e.target.value,
                                                                category: cat?.name ?? prev.category,
                                                            }));
                                                        }}
                                                    >
                                                        <option value="">{t("selectCategory")}</option>
                                                        {categories.map(c => (
                                                            <option key={c.uuid} value={c.uuid}>{c.name}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <div className="info-value">{businessData.category || t("notAvailable")}</div>
                                                )}
                                            </div>
                                            <div className="info-field full-width">
                                                <label className="info-label">{t("aboutBusiness")}</label>
                                                {isEditing ? (
                                                    <textarea
                                                        className="info-input"
                                                        rows={3}
                                                        value={businessData.aboutBusiness || ""}
                                                        onChange={e => setBusinessData(prev => ({ ...prev, aboutBusiness: e.target.value }))}
                                                        placeholder={t("enterAboutBusiness")}
                                                    />
                                                ) : (
                                                    <div className="info-value">{businessData.aboutBusiness || t("notAvailable")}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                {businessId && (
                                    <div className="info-block business-profile-employees-cta">
                                        <h3 className="info-block-title">{t("businessEmployees")}</h3>
                                        <p className="info-value business-profile-employees-hint">{t("manageEmployeesHint")}</p>
                                        <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.EMPLOYEES, { state: { businessId } })}>
                                            {t("manageEmployees")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Location Tab */}
                    {activeTab === 'location' && (
                        <div className="profile-section">
                            <div className="section-header section-header-actions">
                                <h2 className="section-title">{t("businessLocation")}</h2>
                                {canEdit && (
                                    !isEditing ? (
                                        <button type="button" className="btn btn-primary" onClick={() => setEditingTab('location')}>
                                            {t("editProfile")}
                                        </button>
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

                    {/* Schedule Tab */}
                    {activeTab === 'schedule' && (
                        <div className="profile-section">
                            <div className="section-header section-header-actions">
                                <h2 className="section-title">{t("businessSchedule")}</h2>
                                {canEdit && (
                                    !isEditing ? (
                                        <button type="button" className="btn btn-primary" onClick={() => setEditingTab('schedule')}>
                                            {t("editProfile")}
                                        </button>
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
                                                    {isEditing ? (
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
                                                    <div className="schedule-times">
                                                        <span>{t("closed")}</span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
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

export default BusinessProfile;
