import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RouterConstant } from '../../routers/index';
import { useUserStore } from '../../utils/userStore';
import { ProfileService } from '../../services/profile/profile.service';
import { OTPService } from '../../services/otp/otp.service';
import { ProfileType } from '../../utils/constants';
import { useNotificationWS } from '../../hooks/useNotificationWS';
import { useNotificationStore } from '../../utils/notificationStore';
import NotificationBell from './NotificationBell';
import './notification.scss';

interface TopbarProps {
    onMenuOpen?: () => void;
}

const Topbar = ({ onMenuOpen }: TopbarProps) => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { ROUTERS_PATH } = RouterConstant;
    const { resetUser, profile, setProfile, token } = useUserStore();
    const profileService = useMemo(() => new ProfileService(), []);
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const userId = profile?.user?.uuid ?? null;
    useNotificationWS(userId, token);

    const displayName = profile?.user?.full_name?.trim() || profile?.user?.phone_number || 'User';
    const initials = displayName.slice(0, 2).toUpperCase();

    const pageTitle = useMemo(() => {
        const path = location.pathname;
        const isEmployeeAdd = path === ROUTERS_PATH.EMPLOYEES + "/new";
        const isEmployeeDetail = path.startsWith(ROUTERS_PATH.EMPLOYEES + "/") && path !== ROUTERS_PATH.EMPLOYEES && !isEmployeeAdd;

        if (path === ROUTERS_PATH.DASHBOARD) return t("dashboard");
        if (isEmployeeAdd) return t("addEmployee");
        if (isEmployeeDetail) return t("employeeDetail");
        if (path === ROUTERS_PATH.EMPLOYEES) return t("employeeManagement");
        if (path === ROUTERS_PATH.ALLUSERS) return t("userManagement");
        if (path === ROUTERS_PATH.BUSINESSPROFILE) return t("businessProfile");
        if (path === ROUTERS_PATH.QUEUES) return t("queues") || "Queues";
        if (path === ROUTERS_PATH.QUEUES + "/new") return t("addQueue") || "Add Queue";
        if (path.startsWith(ROUTERS_PATH.QUEUES + "/") && path !== ROUTERS_PATH.QUEUES)
            return t("queueDetail") || "Queue Detail";
        if (path === ROUTERS_PATH.LIVE_QUEUE) return t("liveQueue") || "Live Queue";
        if (path === ROUTERS_PATH.QUEUEUSERS) return t("queueUsers");
        if (path.startsWith(ROUTERS_PATH.QUEUEUSERS + "/") && path !== ROUTERS_PATH.QUEUEUSERS)
            return t("queueUserDetail") || "Queue User Detail";
        return t("dashboard");
    }, [location.pathname, t, ROUTERS_PATH]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => { setShowDropdown(false); }, [location.pathname]);

    const handleProfileClick = async () => {
        try {
            let currentProfile = profile;
            if (!currentProfile) {
                currentProfile = await profileService.getProfile();
                setProfile(currentProfile);
            }
            if (currentProfile.profile_type === ProfileType.BUSINESS) {
                navigate(ROUTERS_PATH.BUSINESSPROFILE);
            } else if (currentProfile.profile_type === ProfileType.EMPLOYEE) {
                navigate(ROUTERS_PATH.EMPLOYEEPROFILE);
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        }
        setShowDropdown(false);
    };

    const handleLogout = async () => {
        await new OTPService().logout();
        resetUser();
        useNotificationStore.getState().reset();
        localStorage.removeItem('web-eq-user');
        localStorage.removeItem('web-eq-business-registration');
        navigate(ROUTERS_PATH.ROOT_PATH);
        setShowDropdown(false);
    };

    return (
        <div className="top-bar">
            <button className="hamburger-btn" onClick={onMenuOpen} aria-label="Open menu">
                <span /><span /><span />
            </button>
            <h1 className="page-title">{pageTitle}</h1>
            <div className="top-bar-actions">
                <NotificationBell />
                <div className="settings-dropdown-container" ref={dropdownRef}>
                    <button
                        className="topbar-avatar-btn"
                        onClick={() => setShowDropdown(!showDropdown)}
                        aria-label="Account menu"
                    >
                        {initials}
                    </button>
                    {showDropdown && (
                        <div className="settings-dropdown">
                            <button className="dropdown-item" onClick={handleProfileClick}>
                                <span className="dropdown-icon">👤</span>
                                <span>{t("profile")}</span>
                            </button>
                            <div className="dropdown-divider" />
                            <button className="dropdown-item logout-item" onClick={handleLogout}>
                                <span className="dropdown-icon">🚪</span>
                                <span>{t("logout")}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Topbar;
