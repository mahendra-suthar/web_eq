import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  PROFILE_DROPDOWN_MENU_ITEMS,
  PROFILE_DROPDOWN_FIRST_ITEM_ID,
} from "../../utils/constants";
import "./profile-dropdown.scss";

export interface ProfileDropdownProps {
  /** User display name (for avatar initials and label) */
  userName: string | null | undefined;
  /** Callback when user chooses Logout */
  onLogout: () => void;
}

function getInitials(name: string | null | undefined): string {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase().slice(0, 2);
  }
  return (parts[0]?.[0] ?? "?").toUpperCase();
}

export default function ProfileDropdown({ userName, onLogout }: ProfileDropdownProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const MENU_LABELS = useMemo<Record<string, string>>(() => ({
    profile: t("profile.navProfile"),
    appointments: t("profile.navAppointments"),
    settings: t("profile.navSettings"),
  }), [t]);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setIsOpen(false), []);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const t = requestAnimationFrame(() => {
      document.getElementById(PROFILE_DROPDOWN_FIRST_ITEM_ID)?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen, close]);

  const handleMenuAction = (path: string) => {
    close();
    if (path) navigate(path);
  };

  const handleLogout = () => {
    close();
    onLogout();
  };

  const handleKeyDown = (e: React.KeyboardEvent, action: () => void) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  };

  return (
    <div className="profile-dropdown" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="profile-dropdown__trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-controls="profile-dropdown-menu"
        id="profile-dropdown-trigger"
      >
        <span className="profile-dropdown__avatar" aria-hidden>
          {getInitials(userName)}
        </span>
        <span className="profile-dropdown__name">{userName || "Account"}</span>
        <span className="profile-dropdown__chevron" aria-hidden>
          {isOpen ? "▲" : "▼"}
        </span>
      </button>

      <div
        id="profile-dropdown-menu"
        role="menu"
        aria-labelledby="profile-dropdown-trigger"
        aria-hidden={!isOpen}
        className={`profile-dropdown__menu ${isOpen ? "profile-dropdown__menu--open" : ""}`}
      >
        <div className="profile-dropdown__menu-inner">
          {PROFILE_DROPDOWN_MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              id={item.id === "profile" ? PROFILE_DROPDOWN_FIRST_ITEM_ID : undefined}
              data-tab={item.id}
              type="button"
              role="menuitem"
              className="profile-dropdown__item"
              onClick={() => handleMenuAction(item.path)}
              onKeyDown={(e) => handleKeyDown(e, () => handleMenuAction(item.path))}
            >
              {MENU_LABELS[item.id]}
            </button>
          ))}
          <div className="profile-dropdown__divider" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="profile-dropdown__item profile-dropdown__item--logout"
            onClick={handleLogout}
            onKeyDown={(e) => handleKeyDown(e, handleLogout)}
          >
            {t("profile.navSignOut")}
          </button>
        </div>
      </div>
    </div>
  );
}
