import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AddressData } from '../../utils/businessRegistrationStore';
import { ProfileService, UnifiedProfileResponse } from '../../services/profile/profile.service';
import './customer-profile.scss';

interface CustomerProfileData {
    fullName: string;
    email?: string;
    phoneNumber: string;
    profilePicture?: string | null;
    dateOfBirth?: string;
    gender?: number;
}

type TabType = 'overview' | 'location';

const CustomerProfile = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [fetching, setFetching] = useState(true);
    const [error, setError] = useState<string>("");
    
    const profileService = useMemo(() => new ProfileService(), []);

    const [customerData, setCustomerData] = useState<CustomerProfileData>({
        fullName: "",
        email: "",
        phoneNumber: "",
        profilePicture: null,
        dateOfBirth: "",
        gender: undefined,
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

    useEffect(() => {
        const fetchProfile = async () => {
            setFetching(true);
            setError("");
            try {
                const profile: UnifiedProfileResponse = await profileService.getProfile();
                
                if (profile.profile_type !== "CUSTOMER") {
                    setError(t("customerProfile") + " - " + t("notAvailable"));
                    setFetching(false);
                    return;
                }

                const mappedCustomerData: CustomerProfileData = {
                    fullName: profile.user.full_name,
                    email: profile.user.email || "",
                    phoneNumber: profile.user.phone_number,
                    profilePicture: profile.user.profile_picture || null,
                    dateOfBirth: profile.user.date_of_birth || "",
                    gender: profile.user.gender,
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

                setCustomerData(mappedCustomerData);
                setLocationData(mappedLocationData);
            } catch (err: any) {
                console.error("Failed to fetch profile:", err);
                setError(err?.response?.data?.detail?.message || err?.message || t("failedToLoadEmployees"));
            } finally {
                setFetching(false);
            }
        };

        fetchProfile();
    }, [profileService, t]);

    if (fetching) {
        return (
            <div className="customer-profile-page">
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
            <div className="customer-profile-page">
                <div className="content-card">
                    <div className="error-message" style={{ padding: "1rem", color: "red" }}>
                        {error}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="customer-profile-page">
            <div className="content-card">
                <div className="card-header">
                    <h2 className="card-title">{t("customerProfile")}</h2>
                </div>

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
                </div>

                <div className="profile-content">
                    {activeTab === 'overview' && (
                        <div className="profile-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("basicInformation")}</h2>
                            </div>
                            <div className="section-content">
                                <div className="basic-info-layout">
                                    <div className="profile-picture-container">
                                        <div className="profile-picture-wrapper">
                                            {customerData.profilePicture ? (
                                                <img 
                                                    src={customerData.profilePicture} 
                                                    alt="Customer Profile" 
                                                    className="profile-picture"
                                                />
                                            ) : (
                                                <div className="profile-picture-placeholder">
                                                    <span className="placeholder-icon">👤</span>
                                                    <span className="placeholder-text">
                                                        {t("noProfilePicture")}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="info-grid">
                                        <div className="info-field">
                                            <label className="info-label">{t("fullName")}</label>
                                            <div className="info-value">{customerData.fullName || t("notAvailable")}</div>
                                        </div>

                                        <div className="info-field">
                                            <label className="info-label">{t("email")}</label>
                                            <div className="info-value">{customerData.email || t("notAvailable")}</div>
                                        </div>

                                        <div className="info-field">
                                            <label className="info-label">{t("phoneNumber")}</label>
                                            <div className="info-value">{customerData.phoneNumber}</div>
                                        </div>

                                        {customerData.dateOfBirth && (
                                            <div className="info-field">
                                                <label className="info-label">{t("dateOfBirth")}</label>
                                                <div className="info-value">{customerData.dateOfBirth}</div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'location' && (
                        <div className="profile-section">
                            <div className="section-header">
                                <h2 className="section-title">{t("location")}</h2>
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
                </div>
            </div>
        </div>
    );
};

export default CustomerProfile;
