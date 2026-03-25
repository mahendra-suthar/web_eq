import { Outlet, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./auth-layout.scss";

export default function AuthLayout() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleNavLink = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (!href.startsWith("#") && !href.startsWith("/#")) return;
    e.preventDefault();
    const hash = href.split("#")[1] ?? "";
    navigate("/");
    setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: "smooth" }), 300);
  };

  const NAV_LINKS = [
    { label: t("nav.explore"), href: "/#categories" },
    { label: t("nav.howItWorks"), href: "/#how-it-works" },
    { label: t("nav.forBusiness"), href: "/for-business" },
  ];

  return (
    <div className="al-page">
      <div className="al-bg-mesh" aria-hidden="true" />
      <div className="al-orb al-orb-1" aria-hidden="true" />
      <div className="al-orb al-orb-2" aria-hidden="true" />

      <nav className="al-nav" aria-label="Main navigation">
        <button
          className="al-nav-logo"
          onClick={() => navigate("/")}
          aria-label={t("nav.logoAriaLabel")}
        >
          EQ<span className="al-nav-logo-dot">.</span>
        </button>

        <ul className="al-nav-links" role="list">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={(e) => handleNavLink(e, l.href)}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <button className="al-nav-home" onClick={() => navigate("/")}>
          {t("backToHome")}
        </button>
      </nav>

      <main className="al-main">
        <Outlet />
      </main>
    </div>
  );
}
