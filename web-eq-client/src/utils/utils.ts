/**
 * Utility functions and constants
 * Consolidated utilities for employees, phone numbers, and validation
 */

// ============================================================================
// Validation Constants
// ============================================================================

/**
 * Email validation regex
 */
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Phone validation regex (India: 10 digits, starts with 6-9)
 */
export const phoneRegex = /^[6-9]\d{9}$/;

// ============================================================================
// Phone Number Utilities
// ============================================================================

/**
 * Phone number interface
 */
export interface PhoneNumber {
  countryCode: string;  // "+91" (India only)
  localNumber: string;   // "9876543210" (10 digits, starts with 6-9)
}

/**
 * Formats phone for display (e.g., "+91 9876543210")
 * @param phone - PhoneNumber object
 * @returns Formatted phone string
 */
export const formatPhoneForDisplay = (phone: PhoneNumber): string => {
  return `${phone.countryCode} ${phone.localNumber}`;
};

/**
 * Formats phone for API (E.164 without +) (e.g., "919876543210")
 * @param phone - PhoneNumber object
 * @returns Formatted phone string for API
 */
export const formatPhoneForApi = (phone: PhoneNumber): string => {
  const countryCodeDigits = phone.countryCode.replace("+", "");
  return `${countryCodeDigits}${phone.localNumber}`;
};

/**
 * Validates phone number for India (+91)
 * India: 10 digits, must start with 6, 7, 8, or 9
 * @param phone - PhoneNumber object
 * @returns true if valid, false otherwise
 */
export const validatePhoneNumber = (phone: PhoneNumber): boolean => {
  // Only support India (+91)
  if (phone.countryCode !== "+91") {
    return false;
  }
  
  // India: 10 digits, starts with 6-9
  return phone.localNumber.length === 10 && phoneRegex.test(phone.localNumber);
};

/**
 * Gets country info for India
 * @param countryCode - Country code (e.g., "+91")
 * @returns Country information object
 */
export const getCountryInfo = (countryCode: string) => {
  // Only support India (+91)
  if (countryCode === "+91") {
    return { 
      name: "India", 
      flag: "🇮🇳", 
      maxLength: 10, 
      minLength: 10 
    };
  }
  
  // Default fallback (should not happen if only India is used)
  return { 
    name: "India", 
    flag: "🇮🇳", 
    maxLength: 10, 
    minLength: 10 
  };
};

// ============================================================================
// Time & Duration Formatting (reusable)
// ============================================================================

/**
 * Format minutes as readable duration: "45m" or "1h 15m" (hours only when >= 60).
 * @param minutes - Duration in minutes
 * @returns Human-readable string, e.g. "45m", "1h 15m", "2h 0m"
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 0 || !Number.isFinite(minutes)) return "0m";
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

// ============================================================================
// Schedule day-of-week mapping (UI <-> backend)
// ============================================================================
/**
 * Backend schedules use JS convention: 0=Sunday, 1=Monday, …, 6=Saturday.
 * Many admin UIs prefer ISO-like ordering: 0=Monday, …, 6=Sunday.
 *
 * These helpers keep UI ordering stable while sending/reading correct values.
 */
export function uiDowToBackendDow(uiIsoDow: number): number {
  // ui: 0=Mon..6=Sun  -> backend: 0=Sun..6=Sat
  // mapping: backend = (ui + 1) % 7
  return (uiIsoDow + 1) % 7;
}

export function backendDowToUiDow(backendJsDow: number): number {
  // backend: 0=Sun..6=Sat -> ui: 0=Mon..6=Sun
  // mapping: ui = (backend + 6) % 7
  return (backendJsDow + 6) % 7;
}

/**
 * Format a time for display as 12-hour with AM/PM (e.g. "4:30 PM").
 * Accepts ISO datetime string, "HH:MM" string, or Date.
 */
export function formatTimeToDisplay(
  value: string | Date | null | undefined
): string {
  if (value == null) return "";
  try {
    let date: Date;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === "string") {
      if (/^\d{1,2}:\d{2}$/.test(value.trim())) {
        const [h, min] = value.trim().split(":").map(Number);
        date = new Date();
        date.setHours(h, min, 0, 0);
      } else {
        date = new Date(value);
      }
    } else {
      return "";
    }
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
}

// ============================================================================
// Employee Utilities
// ============================================================================

// ============================================================================
// Queue Status (admin) Utilities
// ============================================================================

/** Translation keys for queue status (1=Registered, 2=Running, 3=Stopped) */
export const QUEUE_STATUS_KEYS: Record<number, string> = {
  1: "queueStatusRegistered",
  2: "queueStatusRunning",
  3: "queueStatusStopped",
};

/**
 * Get translated label for queue status.
 */
export function getQueueStatusLabel(
  status: number | null | undefined,
  t: (key: string) => string
): string {
  if (status == null) return t("notAvailable");
  const key = QUEUE_STATUS_KEYS[status];
  return key ? t(key) : String(status);
}

/**
 * Get CSS badge class for queue status (registered, running, stopped).
 */
export function getQueueStatusBadgeClass(status: number | null | undefined): string {
  if (status === 1) return "registered";
  if (status === 2) return "running";
  if (status === 3) return "stopped";
  return "unknown";
}

// ============================================================================
// Employee Utilities
// ============================================================================

/**
 * Generate initials from a full name
 * @param name - Full name string
 * @returns First letter of each word, up to 2 characters, uppercase
 */
export const getInitials = (name: string): string => {
    if (!name || !name.trim()) return "??";
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

/**
 * Generate a consistent avatar background color based on name
 * @param name - Full name string
 * @returns CSS gradient string
 */
export const getAvatarBackground = (name: string): string => {
    const colors = [
        "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        "linear-gradient(135deg, #10b981 0%, #059669 100%)",
        "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
        "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
        "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
        "linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)",
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
};
