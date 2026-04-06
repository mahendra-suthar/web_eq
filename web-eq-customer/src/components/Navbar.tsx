import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import eqLogo from "../assets/eq_logo.jpg";
import { EXTERNAL_LINKS } from "../config/links";

interface NavbarProps {
  right?: React.ReactNode;
}

export default function Navbar({ right }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const handleNavLink = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
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

  const NAV_LINKS = [
    { key: "nav.explore",     label: t("nav.explore"),     href: "/#categories",           external: false },
    { key: "nav.howItWorks",  label: t("nav.howItWorks"),  href: "/#how-it-works",         external: false },
    { key: "nav.forBusiness", label: t("nav.forBusiness"), href: EXTERNAL_LINKS.adminPanel, external: true },
  ];

  return (
    <nav className={`cl-nav${scrolled ? " cl-nav--scrolled" : ""}`} aria-label="Main navigation">
      <div className="cl-nav-inner">
        <button
          className="cl-nav-logo"
          onClick={() => navigate("/")}
          aria-label={t("nav.logoAriaLabel")}
        >
          <img src={eqLogo} alt="" className="cl-nav-logo-img" aria-hidden="true" />
          <span className="cl-nav-logo-text">EaseQueue</span>
        </button>

        <ul className="cl-nav-links" role="list">
          {NAV_LINKS.map((link) => (
            <li key={link.key}>
              {link.external ? (
                <a href={link.href} className="cl-nav-link" target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              ) : (
                <a href={link.href} className="cl-nav-link" onClick={(e) => handleNavLink(e, link.href)}>
                  {link.label}
                </a>
              )}
            </li>
          ))}
        </ul>

        <div className="cl-nav-right">
          {right}
        </div>
      </div>
    </nav>
  );
}
