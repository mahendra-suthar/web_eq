import { useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { AuthService } from "../../services/auth/auth.service";
import { useNotificationStore } from "../../store/notification.store";
import ProfileDropdown from "../../components/profile-dropdown";
import NotificationBell from "../../components/notification/NotificationBell";
import Navbar from "../../components/Navbar";
import { useNotificationWS } from "../../hooks/useNotificationWS";
import eqLogo from "../../assets/eq_logo.jpg";
import { EXTERNAL_LINKS } from "../../config/links";
import "../../components/notification/notification.scss";
import "./layout.scss";

export default function CustomerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { userInfo, isAuthenticated, resetUser, token, profileType } = useAuthStore();

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
                <span className="cl-footer-logo-bubble">
                  <img src={eqLogo} alt="" className="cl-footer-logo-img" aria-hidden="true" />
                </span>
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
