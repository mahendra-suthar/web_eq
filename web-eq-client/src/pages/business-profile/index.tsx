import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressData, DaySchedule } from '../../utils/businessRegistrationStore';
import { ProfileService, UnifiedProfileResponse } from '../../services/profile/profile.service';
import './business-profile.scss';

interface BusinessProfileData {
    businessName: string;
    businessEmail: string;
    aboutBusiness?: string;
    category?: string;
    phoneNumber?: string;
    profilePicture?: string | null;
}

type TabType = 'overview' | 'location' | 'schedule';

const BusinessProfile = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string>("");
    
    const profileService = useMemo(() => new ProfileService(), []);

    // Business Basic Information
    const [businessData, setBusinessData] = useState<BusinessProfileData>({
        businessName: "",
        businessEmail: "",
        aboutBusiness: "",
        category: "",
        phoneNumber: "",
        profilePicture: null,
    });

    // Location Data
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

    // Schedule Data
    const [scheduleData, setScheduleData] = useState({
        isAlwaysOpen: false,
        schedule: [] as DaySchedule[],
    });

    // Day names mapping
    const dayNames = useMemo(() => [
        { day_of_week: 0, day_name: t("sunday") },
        { day_of_week: 1, day_name: t("monday") },
        { day_of_week: 2, day_name: t("tuesday") },
        { day_of_week: 3, day_name: t("wednesday") },
        { day_of_week: 4, day_name: t("thursday") },
        { day_of_week: 5, day_name: t("friday") },
        { day_of_week: 6, day_name: t("saturday") },
    ], [t]);

    // Fetch profile data on mount
    useEffect(() => {
        const fetchProfile = async () => {
            setFetching(true);
            setError("");
            try {
                const profile: UnifiedProfileResponse = await profileService.getProfile();
                
                // Verify it's a business profile
                if (profile.profile_type !== "BUSINESS") {
                    setError(t("businessProfile") + " - " + t("notAvailable"));
                    setFetching(false);
                    return;
                }

                if (!profile.business) {
                    setError(t("businessProfile") + " - " + t("notAvailable"));
                    setFetching(false);
                    return;
                }

                // Map profile to local state
                const mappedBusinessData: BusinessProfileData = {
                    businessName: profile.business.name,
                    businessEmail: profile.business.email || "",
                    aboutBusiness: profile.business.about_business || "",
                    category: profile.business.category_name || "",
                    phoneNumber: profile.business.phone_number,
                    profilePicture: profile.business.profile_picture || null,
                };

                const mappedLocationData: AddressData = profile.address ? {
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
                };

                // Map schedule data
                const mappedSchedule: DaySchedule[] = dayNames.map(day => {
                    const scheduleItem = profile.schedule?.schedules.find(
                        s => s.day_of_week === day.day_of_week
                    );
                    return {
                        day_of_week: day.day_of_week,
                        day_name: day.day_name,
                        is_open: scheduleItem?.is_open || false,
                        opening_time: scheduleItem?.opening_time || "",
                        closing_time: scheduleItem?.closing_time || "",
                    };
                });

                const mappedScheduleData = {
                    isAlwaysOpen: profile.schedule?.is_always_open || false,
                    schedule: mappedSchedule,
                };

                // Set state
                setBusinessData(mappedBusinessData);
                setLocationData(mappedLocationData);
                setScheduleData(mappedScheduleData);
            } catch (err: any) {
                console.error("Failed to fetch profile:", err);
                setError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadEmployees"));
            } finally {
                setFetching(false);
            }
        };

        fetchProfile();
    }, [profileService, dayNames, t]);

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

                {/* Tabs Navigation */}
                <div className="profile-tabs">
                    <button
                        className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                    >
                        <span className="tab-icon">📋</span>
                        <span>{t("basicInformation")}</span>
                    </button>
                    <button
                        className={`tab-button ${activeTab === 'location' ? 'active' : ''}`}
                        onClick={() => setActiveTab('location')}
                    >
                        <span className="tab-icon">📍</span>
                        <span>{t("location")}</span>
                    </button>
                    <button
                        className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`}
                        onClick={() => setActiveTab('schedule')}
                    >
                        <span className="tab-icon">🕐</span>
                        <span>{t("schedule")}</span>
                    </button>
                </div>

                <div className="profile-content">
                    {/* Overview Tab */}
                    {activeTab === 'overview' && (
                        <div className="profile-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("basicInformation")}</h2>
                            </div>
                            <div className="section-content">
                                <div className="basic-info-layout">
                                    <div className="profile-picture-container">
                                        <div className="profile-picture-wrapper">
                                            {businessData.profilePicture ? (
                                                <img 
                                                    src={businessData.profilePicture} 
                                                    alt="Business Profile" 
                                                    className="profile-picture"
                                                />
                                            ) : (
                                                <div className="profile-picture-placeholder">
                                                    <span className="placeholder-icon">🏢</span>
                                                    <span className="placeholder-text">
                                                        {t("noProfilePicture")}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="info-grid">
                                        <div className="info-field">
                                            <label className="info-label">{t("businessName")}</label>
                                            <div className="info-value">{businessData.businessName || t("notAvailable")}</div>
                                        </div>

                                        <div className="info-field">
                                            <label className="info-label">{t("businessEmail")}</label>
                                            <div className="info-value">{businessData.businessEmail || t("notAvailable")}</div>
                                        </div>

                                        <div className="info-field">
                                            <label className="info-label">{t("phoneNumber")}</label>
                                            <div className="info-value">{businessData.phoneNumber || t("notAvailable")}</div>
                                        </div>

                                        <div className="info-field">
                                            <label className="info-label">{t("category")}</label>
                                            <div className="info-value">{businessData.category || t("notAvailable")}</div>
                                        </div>

                                        <div className="info-field full-width">
                                            <label className="info-label">{t("aboutBusiness")}</label>
                                            <div className="info-value">{businessData.aboutBusiness || t("notAvailable")}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Location Tab */}
                    {activeTab === 'location' && (
                        <div className="profile-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("businessLocation")}</h2>
                            </div>
                            <div className="section-content">
                                <div className="info-grid">
                                    <div className="info-field">
                                        <label className="info-label">{t("unitNumber")}</label>
                                        <div className="info-value">{locationData.unit_number || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field">
                                        <label className="info-label">{t("building")}</label>
                                        <div className="info-value">{locationData.building || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field">
                                        <label className="info-label">{t("floor")}</label>
                                        <div className="info-value">{locationData.floor || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field full-width">
                                        <label className="info-label">{t("street1")}</label>
                                        <div className="info-value">{locationData.street_1 || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field full-width">
                                        <label className="info-label">{t("street2")}</label>
                                        <div className="info-value">{locationData.street_2 || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field">
                                        <label className="info-label">{t("city")}</label>
                                        <div className="info-value">{locationData.city || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field">
                                        <label className="info-label">{t("district")}</label>
                                        <div className="info-value">{locationData.district || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field">
                                        <label className="info-label">{t("state")}</label>
                                        <div className="info-value">{locationData.state || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field">
                                        <label className="info-label">{t("postalCode")}</label>
                                        <div className="info-value">{locationData.postal_code || t("notAvailable")}</div>
                                    </div>

                                    <div className="info-field">
                                        <label className="info-label">{t("country")}</label>
                                        <div className="info-value">{locationData.country || t("notAvailable")}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Schedule Tab */}
                    {activeTab === 'schedule' && (
                        <div className="profile-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("businessSchedule")}</h2>
                            </div>
                            <div className="section-content">
                                <div className="schedule-header">
                                    <div className="info-field">
                                        <label className="info-label">{t("alwaysOpen")}</label>
                                        <div className="info-value">{scheduleData.isAlwaysOpen ? t("yes") : t("no")}</div>
                                    </div>
                                </div>

                                {!scheduleData.isAlwaysOpen && (
                                    <div className="schedule-list">
                                        {scheduleData.schedule.map((day) => (
                                            <div key={day.day_of_week} className="schedule-item">
                                                <div className="schedule-day">
                                                    <span>{day.day_name}</span>
                                                </div>
                                                {day.is_open ? (
                                                    <div className="schedule-times">
                                                        <span>{day.opening_time}</span>
                                                        <span className="time-separator">-</span>
                                                        <span>{day.closing_time}</span>
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
            </div>
        </div>
    );
};

export default BusinessProfile;
