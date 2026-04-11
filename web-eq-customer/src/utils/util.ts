/**
 * Shared utilities for date formatting, address formatting, and map URLs.
 */

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

/** Extract user-facing message from API error (axios or similar). */
export function getApiErrorMessage(
  err: unknown,
  fallback: string = "Something went wrong. Please try again."
): string {
  if (err == null) return fallback;
  const anyErr = err as { response?: { data?: { detail?: string | string[] } }; message?: string };
  const detail = anyErr?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (Array.isArray(detail) && detail.length > 0 && typeof detail[0] === "string") return detail[0];
  if (typeof anyErr?.message === "string" && anyErr.message.trim()) return anyErr.message.trim();
  return fallback;
}
