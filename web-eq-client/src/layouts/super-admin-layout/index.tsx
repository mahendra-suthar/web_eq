import React, { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { SUPER_ADMIN_NAV_ITEMS } from "../../utils/permissions";
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
