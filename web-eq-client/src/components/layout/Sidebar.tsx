import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAllowedNavItems } from '../../hooks/usePermission';
import { useUserStore } from '../../utils/userStore';
import { ProfileType } from '../../utils/constants';

const Sidebar = () => {
    const allowedItems = useAllowedNavItems();
    const profile = useUserStore((s) => s.profile);
    const profileType = useUserStore((s) => s.getProfileType());

    const displayName = profile?.user?.full_name?.trim() || profile?.user?.phone_number || 'User';
    const roleLabel = profileType === ProfileType.BUSINESS ? 'Business' : profileType === ProfileType.EMPLOYEE ? 'Employee' : 'User';

    const navWithSections = allowedItems.map((item, index) => ({
        ...item,
        showSection: index === 0 || item.sectionTitle !== allowedItems[index - 1].sectionTitle,
    }));

    return (
        <div className="sidebar">
            <div className="logo">
                <div className="logo-icon">🛡️</div>
                <div className="logo-text">
                    <div className="logo-title">GNOSTIC</div>
                    <div className="logo-subtitle">Admin Panel</div>
                </div>
            </div>

            <div className="nav-items">
                {navWithSections.map((item) => (
                    <React.Fragment key={item.path}>
                        {item.showSection && item.sectionTitle && (
                            <div className="nav-section-title">{item.sectionTitle}</div>
                        )}
                        <NavLink to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                            <div className="nav-item-icon">{item.icon}</div>
                            <span>{item.label}</span>
                            {item.label === 'All Users' && (
                                <span className="nav-item-badge">1,234</span>
                            )}
                        </NavLink>
                    </React.Fragment>
                ))}
            </div>

            <div className="admin-info">
                <div className="admin-avatar">
                    {displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="admin-details">
                    <div className="admin-name">{displayName}</div>
                    <div className="admin-role">{roleLabel}</div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
