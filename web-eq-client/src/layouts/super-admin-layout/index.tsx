import React, { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SUPER_ADMIN_NAV_ITEMS } from "../../utils/permissions";
import { SUPPORT } from "../../utils/support";
import { useUserStore } from "../../utils/userStore";
import { ROUTERS_PATH } from "../../routers/routers";
import "./super-admin-layout.scss";
import eqLogo from "../../assets/images/white_transparent_logo.png";

const SuperAdminLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, resetUser } = useUserStore();

  React.useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const displayName = profile?.user?.full_name?.trim() || profile?.user?.phone_number || "Admin";

  const handleLogout = () => {
    resetUser();
    navigate(ROUTERS_PATH.SUPER_ADMIN_LOGIN);
  };

  const navWithSections = SUPER_ADMIN_NAV_ITEMS.map((item, index) => ({
    ...item,
    showSection: index === 0 || item.sectionTitle !== SUPER_ADMIN_NAV_ITEMS[index - 1].sectionTitle,
  }));

  return (
    <div className="sa-layout">
      {sidebarOpen && (
        <div className="sa-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`sa-sidebar${sidebarOpen ? " sa-sidebar--open" : ""}`}>
        <div className="sa-logo">
          <img src={eqLogo} alt="EQ" className="sa-logo-img" />
          <div>
            <div className="sa-logo-title">EaseQueue</div>
            <div className="sa-logo-subtitle">Super Admin</div>
          </div>
        </div>

        <nav className="sa-nav">
          {navWithSections.map((item) => (
            <React.Fragment key={item.path}>
              {item.showSection && item.sectionTitle && (
                <div className="sa-nav-section">{item.sectionTitle}</div>
              )}
              <NavLink
                to={item.path}
                end={item.path === ROUTERS_PATH.SUPER_ADMIN}
                className={({ isActive }) => `sa-nav-item${isActive ? " sa-nav-item--active" : ""}`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className="sa-nav-icon">{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            </React.Fragment>
          ))}
        </nav>

        <div className="sa-support">
          <a href={SUPPORT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="sa-support-link">
            <div className="sa-nav-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.847L.057 23.5l5.797-1.522A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.648-.52-5.152-1.422l-.369-.219-3.44.903.919-3.352-.24-.386A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
              </svg>
            </div>
            WhatsApp Support
          </a>
        </div>

        <div className="sa-user">
          <div className="sa-user-avatar">{displayName.slice(0, 2).toUpperCase()}</div>
          <div className="sa-user-info">
            <div className="sa-user-name">{displayName}</div>
            <div className="sa-user-role">Super Admin</div>
          </div>
          <button className="sa-logout-btn" onClick={handleLogout} title="Logout">
            ⏻
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="sa-main">
        <header className="sa-topbar">
          <button className="sa-menu-btn" onClick={() => setSidebarOpen((p) => !p)}>
            ☰
          </button>
          <div className="sa-topbar-title">
            {navWithSections.find((n) => location.pathname === n.path)?.label ?? "Super Admin"}
          </div>
          <button className="sa-logout-btn-top" onClick={handleLogout}>
            Logout
          </button>
        </header>
        <div className="sa-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default SuperAdminLayout;
