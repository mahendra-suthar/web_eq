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

  // Close menu on any navigation (pathname or search params)
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);


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

  const NAV_ICONS: Record<string, React.ReactNode> = {
    "nav.explore": (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
    ),
    "nav.howItWorks": (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
    "nav.forBusiness": (
      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
      </svg>
    ),
  };

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
        {/* Drawer header */}
        <div className="cl-mobile-header">
          <button
            className="cl-nav-logo"
            onClick={() => { navigate("/"); setMenuOpen(false); }}
            aria-label={t("nav.logoAriaLabel")}
          >
            <img src={eqLogo} alt="" className="cl-nav-logo-img" aria-hidden="true" />
            <span className="cl-nav-logo-text">EaseQueue</span>
          </button>
          <button className="cl-mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="cl-mobile-menu-inner">
          <div className="cl-mobile-section-label">Discover</div>
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
                <span className="cl-mobile-link-icon">{NAV_ICONS[link.key]}</span>
                {link.label}
              </a>
            ) : (
              <a
                key={link.key}
                href={link.href}
                className="cl-mobile-link"
                onClick={(e) => handleNavLink(e, link.href)}
              >
                <span className="cl-mobile-link-icon">{NAV_ICONS[link.key]}</span>
                {link.label}
              </a>
            )
          ))}
          {/* User section renders directly — no centering wrapper */}
          {mobileRight}
          {/* Unauthenticated buttons (Sign In / Get Started) get the centered actions wrapper */}
          {!mobileRight && right && (
            <div className="cl-mobile-actions" onClick={() => setMenuOpen(false)}>
              {right}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
