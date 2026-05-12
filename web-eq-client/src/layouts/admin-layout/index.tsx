import React, { useState, useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import ImpersonationBanner from "../../components/impersonation-banner";
import { useUserStore } from "../../utils/userStore";
import { ROUTERS_PATH } from "../../routers/routers";
import "./admin-layout.scss";

const AdminLayout = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const {
        impersonating,
        impersonatedBusinessName,
        token,
        exitImpersonation,
    } = useUserStore();

    React.useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (impersonating && !token) {
            exitImpersonation();
            navigate(ROUTERS_PATH.SUPER_ADMIN_BUSINESSES, { replace: true });
        }
    }, []);

    const handleExitImpersonation = () => {
        exitImpersonation();
        navigate(ROUTERS_PATH.SUPER_ADMIN_BUSINESSES, { replace: true });
    };

    return (
        <div className="admin-layout-container">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />
            )}

            <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="main-content">
                <Topbar onMenuOpen={() => setSidebarOpen(prev => !prev)} />
                {impersonating && impersonatedBusinessName && (
                    <ImpersonationBanner
                        businessName={impersonatedBusinessName}
                        onExit={handleExitImpersonation}
                    />
                )}
                <div className="content-area">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default AdminLayout;
