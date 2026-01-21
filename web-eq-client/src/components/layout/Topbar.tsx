import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RouterConstant } from '../../routers/index';
import { useUserStore } from '../../utils/userStore';
import { ProfileService } from '../../services/profile/profile.service';

const Topbar = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { ROUTERS_PATH } = RouterConstant;
    const { userInfo, resetUser } = useUserStore();
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const pageTitle = useMemo(() => {
        const path = location.pathname;
        
        if (path === ROUTERS_PATH.DASHBOARD) {
            return t("dashboard");
        } else         if (path === ROUTERS_PATH.EMPLOYEES) {
            return t("employeeManagement");
        } else if (path === ROUTERS_PATH.ALLUSERS) {
            return t("userManagement");
        } else if (path === ROUTERS_PATH.BUSINESSPROFILE) {
            return t("businessProfile");
        } else if (path === ROUTERS_PATH.QUEUEUSERS) {
            return t("queueUsers");
        }
        
        return t("dashboard");
    }, [location.pathname, t, ROUTERS_PATH]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Close dropdown when route changes
    useEffect(() => {
        setShowDropdown(false);
    }, [location.pathname]);

    const handleProfileClick = async () => {
        try {
            const profileService = new ProfileService();
            const profile = await profileService.getProfile();
            
            if (profile.profile_type === "BUSINESS") {
                navigate(ROUTERS_PATH.BUSINESSPROFILE);
            } else if (profile.profile_type === "EMPLOYEE") {
                navigate(ROUTERS_PATH.EMPLOYEEPROFILE);
            } else if (profile.profile_type === "CUSTOMER") {
                navigate(ROUTERS_PATH.CUSTOMERPROFILE);
            }
        } catch (error) {
            console.error("Failed to fetch profile:", error);
        }
        setShowDropdown(false);
    };

    const handleLogout = () => {
        resetUser();
        localStorage.removeItem('web-eq-user');
        localStorage.removeItem('web-eq-business-registration');
        navigate(ROUTERS_PATH.ROOT_PATH);
        setShowDropdown(false);
    };

    const handleSettings = () => {
        // Navigate to settings page (you can add a settings route later)
        console.log("Settings clicked");
        setShowDropdown(false);
    };

    return (
        <div className="top-bar">
            <h1 className="page-title">{pageTitle}</h1>

            <div className="global-search">
                <span className="search-icon">🔍</span>
                <input type="text" className="global-search-input" placeholder="Search users, organizations..." />
            </div>

            <div className="top-bar-actions">
                <button className="notification-btn">
                    🔔
                    <span className="notification-badge">5</span>
                </button>
                <div className="settings-dropdown-container" ref={dropdownRef}>
                    <button 
                        className="notification-btn" 
                        onClick={() => setShowDropdown(!showDropdown)}
                    >
                        ⚙️
                    </button>
                    {showDropdown && (
                        <div className="settings-dropdown">
                            <button className="dropdown-item" onClick={handleProfileClick}>
                                <span className="dropdown-icon">👤</span>
                                <span>{t("profile")}</span>
                            </button>
                            <button className="dropdown-item" onClick={handleSettings}>
                                <span className="dropdown-icon">⚙️</span>
                                <span>{t("settings")}</span>
                            </button>
                            <div className="dropdown-divider"></div>
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
