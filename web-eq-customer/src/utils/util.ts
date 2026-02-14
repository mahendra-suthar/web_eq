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
