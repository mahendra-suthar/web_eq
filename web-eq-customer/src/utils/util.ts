/**
 * Shared utilities for date formatting, address formatting, and map URLs.
 */

import axios, { type AxiosError } from "axios";
import type { AddressData } from "../services/business/business.service";

/** Format a Date to YYYY-MM-DD string (local timezone). */
export function formatDateToYYYYMMDD(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Today's date as YYYY-MM-DD. */
export function getTodayYYYYMMDD(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return formatDateToYYYYMMDD(today);
}

/** True if dateStr is before today (past). */
export function isDateInPast(dateStr: string): boolean {
  const today = getTodayYYYYMMDD();
  return dateStr < today;
}

/** Human-readable date: "Today", "Tomorrow", or "Wed, Jan 15". */
export function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateOnly = new Date(date);
  dateOnly.setHours(0, 0, 0, 0);
  if (dateOnly.getTime() === today.getTime()) return "Today";
  if (dateOnly.getTime() === today.getTime() + 86400000) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Format address to array of lines (for display). */
export function formatFullAddress(address: AddressData | null): string[] {
  if (!address) return [];
  const lines: string[] = [];
  const unit = [address.unit_number, address.building, address.floor].filter(Boolean).join(", ");
  if (unit) lines.push(unit);
  if (address.street_1) lines.push(address.street_1);
  if (address.street_2) lines.push(address.street_2);
  const cityLine = [address.city, address.district, address.state, address.postal_code]
    .filter(Boolean)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  if (address.country) lines.push(address.country);
  return lines;
}

/** OpenStreetMap embed URL for given coordinates. */
export function getMapEmbedUrl(lat: number, lon: number): string {
  const delta = 0.01;
  const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${lat}%2C${lon}`;
}

/** Google Maps search URL for given coordinates. */
export function getGoogleMapsLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}

// ============================================================================
// Duration & Time Display (reusable)
// ============================================================================

/**
 * Format minutes as readable duration: "45m" or "1h 15m" (hours when >= 60).
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 0 || !Number.isFinite(minutes)) return "0m";
  const m = Math.round(minutes);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/**
 * Format a server wait-range string ("80–104 min", "119–153 min") into a
 * human-readable form using hours when either bound reaches 60 minutes.
 * "80–104 min" → "1h 20m–1h 44m"   "15–25 min" → "15m–25m"
 * Returns the original string unchanged if it doesn't match the expected format.
 */
export function formatWaitRange(range: string | null | undefined): string {
  if (!range) return "";
  const match = range.match(/^(\d+)[–\-](\d+)\s*min$/i);
  if (!match) return range;
  return `${formatDurationMinutes(parseInt(match[1], 10))}–${formatDurationMinutes(parseInt(match[2], 10))}`;
}

/**
 * Format time for display as 12-hour with AM/PM (e.g. "4:30 PM").
 * Accepts ISO datetime, "HH:MM", or Date.
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
      const trimmed = value.trim();
      // Already a formatted 12h string like "4:30 PM" or "11:45 AM" — return as-is
      if (/^\d{1,2}:\d{2}\s*(AM|PM)$/i.test(trimmed)) {
        return trimmed;
      }
      if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
        // HH:MM 24h format
        const [h, min] = trimmed.split(":").map(Number);
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
// Appointment display (shared across landing, profile, booking)
// ============================================================================

export type AppointmentType = "QUEUE" | "FIXED" | "APPROXIMATE" | string | null | undefined;

/** Human-readable label for appointment type. */
export function formatAppointmentTypeLabel(type: AppointmentType): string {
  if (!type) return "Queue";
  const upper = String(type).toUpperCase();
  if (upper === "FIXED") return "Fixed";
  if (upper === "APPROXIMATE") return "Approximate";
  return "Queue";
}

/** Single-line time/slot summary: Fixed 10:30 / Approx 10:30–11:00 / Expected at 4:30 PM. */
export function formatAppointmentTimeSummary(
  appointmentType: AppointmentType,
  scheduledStart: string | null | undefined,
  scheduledEnd: string | null | undefined,
  estimatedAppointmentTime: string | null | undefined
): string {
  const type = appointmentType ? String(appointmentType).toUpperCase() : "QUEUE";
  if (type === "FIXED" && scheduledStart) {
    return `Fixed ${formatTimeToDisplay(scheduledStart)}`;
  }
  if (type === "APPROXIMATE" && scheduledStart && scheduledEnd) {
    return `Approx ${formatTimeToDisplay(scheduledStart)}–${formatTimeToDisplay(scheduledEnd)}`;
  }
  if (estimatedAppointmentTime) {
    return `Expected at ${formatTimeToDisplay(estimatedAppointmentTime)}`;
  }
  return "";
}

/** UI label for appointment type (profile cards, history). */
export function formatApptType(type: string | null | undefined): string {
  if (!type) return "Walk-in";
  const upper = String(type).toUpperCase();
  if (upper === "FIXED") return "Fixed time";
  if (upper === "APPROXIMATE") return "Approx. time";
  return "Walk-in";
}

/**
 * User initials from full name, with optional phone fallback.
 * e.g. "Mahendra Suthar" → "MS", "Mahendra" → "M", null + "9876543210" → "0"
 */
export function getInitials(name?: string | null, phone?: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (phone) return phone.slice(-1);
  return "?";
}

/**
 * Deterministic avatar background gradient from a name string.
 * Uses the full name's char-code sum so different names starting with the
 * same letter still receive distinct colours.
 */
export function getAvatarBackground(name: string | null | undefined): string {
  const GRADIENTS = [
    "linear-gradient(135deg, #00695C 0%, #004D40 100%)", // teal (brand)
    "linear-gradient(135deg, #5b4fcf 0%, #7c3aed 100%)", // indigo-violet
    "linear-gradient(135deg, #c97c1a 0%, #b45309 100%)", // amber
    "linear-gradient(135deg, #1d6fa4 0%, #1e40af 100%)", // ocean-blue
    "linear-gradient(135deg, #b84a6e 0%, #9d174d 100%)", // rose
    "linear-gradient(135deg, #1a7a56 0%, #0e4a35 100%)", // jade (brand variant)
  ];
  const str = name?.trim() || "?";
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash += str.charCodeAt(i);
  return GRADIENTS[hash % GRADIENTS.length];
}

/** Delay message for APPROXIMATE when delay_minutes > 0. */
export function formatDelayMessage(delayMinutes: number | null | undefined): string {
  if (delayMinutes == null || delayMinutes <= 0 || !Number.isFinite(delayMinutes)) return "";
  return `Running ~${delayMinutes} min late`;
}

/** Format a date string for review display (e.g. "Mar 28, 2026"). */
export function formatReviewDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

/**
 * Human-readable relative time (e.g. "3m ago", "2h ago").
 * Accepts an ISO 8601 datetime string.
 */
export function timeAgo(isoString: string): string {
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ============================================================================
// API error handling
// ============================================================================

/**
 * Resolve a user-facing message from an axios error, preferring the backend's
 * {"detail": {"message": ...}} shape, then a string/array detail (FastAPI
 * validation), then a top-level message, then network/timeout/status fallbacks.
 * Never returns the raw "Request failed with status code N" axios string.
 */
export function resolveErrorMessage(
  error: unknown,
  fallback: string = "Something went wrong. Please try again."
): string {
  if (!axios.isAxiosError(error)) return fallback;
  const e = error as AxiosError<unknown>;

  // No response → network drop or timeout.
  if (!e.response) {
    if (e.code === "ECONNABORTED") return "The request timed out. Please try again.";
    return "Can't reach the server. Check your connection and try again.";
  }

  const data = e.response.data as
    | { detail?: unknown; message?: unknown }
    | undefined;
  const detail = data?.detail;

  if (typeof detail === "string" && detail.trim()) return detail.trim();

  if (Array.isArray(detail)) {
    // FastAPI 422 validation: list of strings or {msg|message} objects.
    for (const d of detail) {
      if (typeof d === "string" && d.trim()) return d.trim();
      const m = (d as { msg?: unknown; message?: unknown })?.msg ??
        (d as { message?: unknown })?.message;
      if (typeof m === "string" && m.trim()) return m.trim();
    }
  } else if (detail && typeof detail === "object") {
    const msg = (detail as { message?: unknown }).message;
    if (typeof msg === "string" && msg.trim()) return msg.trim();
  }

  const topMsg = data?.message;
  if (typeof topMsg === "string" && topMsg.trim()) return topMsg.trim();

  const status = e.response.status;
  if (status === 404) return "The requested item was not found.";
  if (status === 403) return "You don't have permission to do that.";
  return fallback;
}

/**
 * Extract user-facing message from API error.
 * Thin wrapper over {@link resolveErrorMessage} kept for existing call sites.
 */
export function getApiErrorMessage(
  err: unknown,
  fallback: string = "Something went wrong. Please try again."
): string {
  return resolveErrorMessage(err, fallback);
}
