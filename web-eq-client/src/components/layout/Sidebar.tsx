import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAllowedNavItems } from '../../hooks/usePermission';
import { useUserStore } from '../../utils/userStore';
import { ProfileType } from '../../utils/constants';
import { SUPPORT } from '../../utils/support';
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

            <div className="sidebar-support">
                <a href={SUPPORT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="sidebar-support-link">
                    <div className="nav-item-icon">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                            <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.847L.057 23.5l5.797-1.522A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.648-.52-5.152-1.422l-.369-.219-3.44.903.919-3.352-.24-.386A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                        </svg>
                    </div>
                    WhatsApp Support
                </a>
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
