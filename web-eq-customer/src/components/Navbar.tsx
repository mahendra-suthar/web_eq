import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import eqLogo from "../assets/transparent_logo.png";
import { EXTERNAL_LINKS } from "../config/links";

interface NavbarProps {
  right?: React.ReactNode;
  /** Content shown inside the mobile drawer instead of `right` */
  mobileRight?: React.ReactNode;
}

export default function Navbar({ right, mobileRight }: NavbarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);


  // Prevent body scroll when menu open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const handleNavLink = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    setMenuOpen(false);
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
    { key: "nav.explore",     label: t("nav.explore"),     href: "/#categories",            external: false },
    { key: "nav.howItWorks",  label: t("nav.howItWorks"),  href: "/#how-it-works",          external: false },
    { key: "nav.forBusiness", label: t("nav.forBusiness"), href: EXTERNAL_LINKS.adminPanel, external: true },
  ];

  return (
    <>
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

          {/* Desktop nav links */}
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
            {/* Hidden on mobile — shown inside drawer instead */}
            <div className="cl-nav-right-desktop">{right}</div>
            {/* Hamburger button — mobile only */}
            <button
              className={`cl-nav-hamburger${menuOpen ? " cl-nav-hamburger--open" : ""}`}
              onClick={() => setMenuOpen((o) => !o)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile menu overlay */}
      {menuOpen && (
        <div className="cl-mobile-overlay" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}

      {/* Mobile menu drawer */}
      <div
        className={`cl-mobile-menu${menuOpen ? " cl-mobile-menu--open" : ""}`}
        ref={menuRef}
        aria-hidden={!menuOpen}
      >
        <div className="cl-mobile-menu-inner">
          {NAV_LINKS.map((link) => (
            link.external ? (
              <a
                key={link.key}
                href={link.href}
                className="cl-mobile-link"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMenuOpen(false)}
              >
                {link.label}
              </a>
            ) : (
              <a
                key={link.key}
                href={link.href}
                className="cl-mobile-link"
                onClick={(e) => handleNavLink(e, link.href)}
              >
                {link.label}
              </a>
            )
          ))}
          {(mobileRight ?? right) && (
            <div className="cl-mobile-actions" onClick={() => setMenuOpen(false)}>
              {mobileRight ?? right}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
