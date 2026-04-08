import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAllowedNavItems } from '../../hooks/usePermission';
import { useUserStore } from '../../utils/userStore';
import { ProfileType } from '../../utils/constants';
import eqLogo from '../../assets/images/white_transparent_logo.png';

interface SidebarProps {
    isOpen?: boolean;
    onClose?: () => void;
}

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
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
        <div className={`sidebar${isOpen ? ' sidebar--open' : ''}`}>
            <div className="logo">
                <img src={eqLogo} alt="EQ" className="logo-img" />
                <div className="logo-text">
                    <div className="logo-title">EaseQueue</div>
                    <div className="logo-subtitle">Admin Panel</div>
                </div>
            </div>

            <div className="nav-items">
                {navWithSections.map((item) => (
                    <React.Fragment key={item.path}>
                        {item.showSection && item.sectionTitle && (
                            <div className="nav-section-title">{item.sectionTitle}</div>
                        )}
                        <NavLink to={item.path} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClose}>
                            <div className="nav-item-icon">{item.icon}</div>
                            <span>{item.label}</span>
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
