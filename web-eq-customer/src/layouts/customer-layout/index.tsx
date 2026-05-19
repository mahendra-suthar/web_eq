import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

const QRScannerModal = lazy(() => import("../../components/qr-scanner"));
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { AuthService } from "../../services/auth/auth.service";
import { useNotificationStore } from "../../store/notification.store";
import ProfileDropdown from "../../components/profile-dropdown";
import NotificationBell from "../../components/notification/NotificationBell";
import Navbar from "../../components/Navbar";
import NotificationPanel from "../../components/notification/NotificationPanel";
import { useNotificationWS } from "../../hooks/useNotificationWS";
import { getInitials } from "../../utils/util";
import eqLogoWhite from "../../assets/white_transparent_logo.png";
import { EXTERNAL_LINKS } from "../../config/links";
import { SUPPORT } from "../../utils/support";
import "../../components/notification/notification.scss";
import "../../components/qr-scanner/qr-scanner.scss";
import "./layout.scss";

export default function CustomerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { userInfo, isAuthenticated, resetUser, token, profileType } = useAuthStore();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (isAuthenticated() && profileType && profileType !== "CUSTOMER") {
      resetUser();
      navigate("/send-otp", { replace: true });
    }
  }, [isAuthenticated, profileType, resetUser, navigate]);

  useNotificationWS(userInfo?.uuid ?? null, token);

  const handleLogout = async () => {
    await new AuthService().logout();
    resetUser();
    useNotificationStore.getState().reset();
    navigate("/");
  };

  const handleFooterLink = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#") && !href.startsWith("/#")) return;
    e.preventDefault();
    const hash = href.includes("#") ? href.split("#")[1] : "";
    if (!hash) return;
    if (location.pathname === "/") {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/");
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" }), 300);
    }
  };

  const FOOTER_COLS = [
    {
      heading: t("footer.product"),
      links: [
        { label: t("footer.linkExplore"),    href: "/#categories",   external: false },
        { label: t("footer.linkHowItWorks"), href: "/#how-it-works", external: false },
      ],
    },
    {
      heading: t("footer.business"),
      links: [
        { label: t("footer.linkListBusiness"), href: EXTERNAL_LINKS.adminPanel, external: true },
        { label: t("footer.linkDashboard"),    href: EXTERNAL_LINKS.adminPanel, external: true },
      ],
    },
    {
      heading: t("footer.company"),
      links: [
        { label: t("footer.linkContact"), href: EXTERNAL_LINKS.contact, external: true },
      ],
    },
  ];

  return (
    <div className="customer-layout">
      {/* Notification panel renders at layout root so it works from both desktop bell and mobile drawer */}
      <NotificationPanel />
      {/* Full-screen QR scanner — lazy loaded, mobile FAB triggers it */}
      {scannerOpen && (
        <Suspense fallback={null}>
          <QRScannerModal
            onClose={() => setScannerOpen(false)}
            onNavigate={(path) => { setScannerOpen(false); navigate(path); }}
          />
        </Suspense>
      )}

      {/* Mobile-only floating action button */}
      <button
        className="qr-fab"
        onClick={() => setScannerOpen(true)}
        aria-label="Scan QR code"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
          <rect x="7" y="7" width="4" height="4"/><rect x="13" y="7" width="4" height="4"/>
          <rect x="7" y="13" width="4" height="4"/><rect x="13" y="13" width="4" height="4"/>
        </svg>
      </button>

      <Navbar
        right={
          isAuthenticated() ? (
            <>
              <NotificationBell />
              <ProfileDropdown
                userName={userInfo?.full_name ?? undefined}
                onLogout={handleLogout}
              />
            </>
          ) : (
            <>
              <button className="cl-btn-ghost" onClick={() => navigate("/send-otp")}>
                {t("nav.signIn")}
              </button>
              <button className="cl-btn-primary" onClick={() => navigate("/send-otp")}>
                {t("nav.getStarted")}
              </button>
            </>
          )
        }
        mobileRight={
          isAuthenticated() ? (
            <div className="cl-mobile-user-section">
              <div className="cl-mobile-section-label">Account</div>

              <div className="cl-mobile-user-header">
                <span className="cl-mobile-user-avatar">{getInitials(userInfo?.full_name)}</span>
                <div>
                  <div className="cl-mobile-user-name">{userInfo?.full_name || t("nav.account")}</div>
                  {userInfo?.phone_number && (
                    <div className="cl-mobile-user-phone">{userInfo.phone_number}</div>
                  )}
                </div>
              </div>

              <button
                className="cl-mobile-notif-btn"
                onClick={() => useNotificationStore.getState().togglePanel()}
              >
                <span className="cl-mobile-link-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 01-3.46 0"/>
                  </svg>
                </span>
                <span>{t("nav.notifications")}</span>
                {unreadCount > 0 && (
                  <span className="cl-mobile-notif-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
                )}
              </button>

              <a className="cl-mobile-link" href="/profile?tab=profile" onClick={(e) => { e.preventDefault(); navigate("/profile?tab=profile"); }}>
                <span className="cl-mobile-link-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </span>
                {t("profile.navProfile")}
              </a>

              <a className="cl-mobile-link" href="/profile?tab=appointments" onClick={(e) => { e.preventDefault(); navigate("/profile?tab=appointments"); }}>
                <span className="cl-mobile-link-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </span>
                {t("profile.navAppointments")}
              </a>

              <a className="cl-mobile-link" href="/profile?tab=settings" onClick={(e) => { e.preventDefault(); navigate("/profile?tab=settings"); }}>
                <span className="cl-mobile-link-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
                  </svg>
                </span>
                {t("profile.navSettings")}
              </a>

              <a className="cl-mobile-link cl-mobile-link--whatsapp" href={SUPPORT.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <span className="cl-mobile-link-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                    <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.847L.057 23.5l5.797-1.522A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.885 0-3.648-.52-5.152-1.422l-.369-.219-3.44.903.919-3.352-.24-.386A9.96 9.96 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
                  </svg>
                </span>
                {t("profile.contactWhatsApp")}
              </a>

              <button className="cl-mobile-signout-btn" onClick={handleLogout}>
                <span className="cl-mobile-link-icon">
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                </span>
                {t("profile.navSignOut")}
              </button>
            </div>
          ) : null
        }
      />

      <main className="cl-main">
        <Outlet />
      </main>

      <footer className="cl-footer">
        <div className="cl-footer-inner">
          <div className="cl-footer-grid">
            <div className="cl-footer-brand">
              <button
                className="cl-footer-logo"
                onClick={() => navigate("/")}
                aria-label={t("nav.footerLogoAriaLabel")}
              >
                <img src={eqLogoWhite} alt="" className="cl-footer-logo-img" aria-hidden="true" />
                <span className="cl-footer-logo-text">EaseQueue</span>
              </button>
              <p className="cl-footer-brand-desc">{t("footer.tagline")}</p>
            </div>

            {FOOTER_COLS.map((col) => (
              <div key={col.heading} className="cl-footer-col">
                <h4 className="cl-footer-col-heading">{col.heading}</h4>
                <ul role="list">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {link.external ? (
                        <a href={link.href} className="cl-footer-link" target="_blank" rel="noopener noreferrer">
                          {link.label}
                        </a>
                      ) : (
                        <a href={link.href} className="cl-footer-link" onClick={(e) => handleFooterLink(e, link.href)}>
                          {link.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="cl-footer-bottom">
            <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
            <div className="cl-footer-bottom-links">
              <a href={EXTERNAL_LINKS.privacy} className="cl-footer-link" target="_blank" rel="noopener noreferrer">{t("footer.linkPrivacy")}</a>
              <a href={EXTERNAL_LINKS.terms} className="cl-footer-link" target="_blank" rel="noopener noreferrer">{t("footer.linkTerms")}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
