import { useState, useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth.store";
import { AuthService } from "../../services/auth/auth.service";
import { useNotificationStore } from "../../store/notification.store";
import ProfileDropdown from "../../components/profile-dropdown";
import NotificationBell from "../../components/notification/NotificationBell";
import { useNotificationWS } from "../../hooks/useNotificationWS";
import "../../components/notification/notification.scss";
import "./layout.scss";

export default function CustomerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const { userInfo, isAuthenticated, resetUser, token, profileType } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated() && profileType && profileType !== "CUSTOMER") {
      resetUser();
      navigate("/send-otp", { replace: true });
    }
  }, [isAuthenticated, profileType, resetUser, navigate]);

  useNotificationWS(userInfo?.uuid ?? null, token);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleLogout = async () => {
    await new AuthService().logout();
    resetUser();
    useNotificationStore.getState().reset();
    navigate("/");
  };

  const handleNavLink = (
    e: React.MouseEvent<HTMLAnchorElement>,
    href: string
  ) => {
    if (!href.startsWith("#") && !href.startsWith("/#")) return;
    e.preventDefault();
    const hash = href.includes("#") ? href.split("#")[1] : "";
    if (!hash) return;
    if (location.pathname === "/") {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
    } else {
      navigate("/");
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" });
      }, 300);
    }
  };

  const NAV_LINKS = [
    { key: "nav.explore", label: t("nav.explore"), href: "/#categories" },
    { key: "nav.howItWorks", label: t("nav.howItWorks"), href: "/#how-it-works" },
    { key: "nav.forBusiness", label: t("nav.forBusiness"), href: "/for-business" },
  ];

  const FOOTER_COLS = [
    {
      heading: t("footer.product"),
      links: [
        { label: t("footer.linkExplore"), href: "/#categories" },
        { label: t("footer.linkCategories"), href: "/#categories" },
        { label: t("footer.linkHowItWorks"), href: "/#how-it-works" },
      ],
    },
    {
      heading: t("footer.business"),
      links: [
        { label: t("footer.linkListBusiness"), href: "/for-business" },
        { label: t("footer.linkDashboard"), href: "/for-business" },
      ],
    },
    {
      heading: t("footer.company"),
      links: [
        { label: t("footer.linkAbout"), href: "/about" },
        { label: t("footer.linkBlog"), href: "/blog" },
        { label: t("footer.linkContact"), href: "/contact" },
      ],
    },
  ];

  return (
    <div className="customer-layout">
      <nav className={`cl-nav${scrolled ? " cl-nav--scrolled" : ""}`}>
        <div className="cl-nav-inner">
          <button
            className="cl-nav-logo"
            onClick={() => navigate("/")}
            aria-label={t("nav.logoAriaLabel")}
          >
            EQ<span className="cl-nav-logo-dot">.</span>
          </button>

          <div className="cl-nav-right">
            <ul className="cl-nav-links" role="list">
              {NAV_LINKS.map((link) => (
                <li key={link.key}>
                  <a
                    href={link.href}
                    className="cl-nav-link"
                    onClick={(e) => handleNavLink(e, link.href)}
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>

            {isAuthenticated() ? (
              <>
                <NotificationBell />
                <ProfileDropdown
                  userName={userInfo?.full_name ?? undefined}
                  onLogout={handleLogout}
                />
              </>
            ) : (
              <>
                <button
                  className="cl-btn-ghost"
                  onClick={() => navigate("/send-otp")}
                >
                  {t("nav.signIn")}
                </button>
                <button
                  className="cl-btn-primary"
                  onClick={() => navigate("/send-otp")}
                >
                  {t("nav.getStarted")}
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

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
                EQ<span className="cl-footer-logo-dot">.</span>
              </button>
              <p className="cl-footer-brand-desc">{t("footer.tagline")}</p>
            </div>

            {FOOTER_COLS.map((col) => (
              <div key={col.heading} className="cl-footer-col">
                <h4 className="cl-footer-col-heading">{col.heading}</h4>
                <ul role="list">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="cl-footer-link"
                        onClick={(e) => handleNavLink(e, link.href)}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="cl-footer-bottom">
            <span>{t("footer.copyright", { year: new Date().getFullYear() })}</span>
            <div className="cl-footer-bottom-links">
              <a href="/privacy" className="cl-footer-link">{t("footer.linkPrivacy")}</a>
              <a href="/terms" className="cl-footer-link">{t("footer.linkTerms")}</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
