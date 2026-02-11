/**
 * Booking page helper utilities for date formatting and manipulation
 */

/**
 * Format a Date object to YYYY-MM-DD string using local timezone
 */
export const formatDateToYYYYMMDD = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/**
 * Get today's date as YYYY-MM-DD string
 */
export const getToday = (): string => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return formatDateToYYYYMMDD(today);
};

/**
 * Get the next 7 days starting from today (today + 6 future days)
 * Excludes any past dates
 */
export const getNext7Days = (): string[] => {
  const days: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Start from today (i = 0) and get next 7 days (today + 6 future days)
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = formatDateToYYYYMMDD(d);
    // Ensure we never include past dates (safety check)
    if (d.getTime() >= today.getTime()) {
      days.push(dateStr);
    }
  }
  return days;
};

/**
 * Get a human-readable label for a date (Today, Tomorrow, or weekday name)
 */
export const getDayLabel = (dateStr: string): string => {
  const date = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === today.getTime() + 86400000) return "Tomorrow";
  return date.toLocaleDateString("en-US", { weekday: "short" });
};

/**
 * Get the day number (1-31) from a date string
 */
export const getDayNumber = (dateStr: string): number =>
  new Date(dateStr + "T00:00:00").getDate();

/**
 * Get the month label (e.g., "Jan", "Feb") from a date string
 */
export const getMonthLabel = (dateStr: string): string =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
  });

/**
 * Format a date string to a full readable format (e.g., "Monday, February 8, 2026")
 */
export const formatDateFull = (dateStr: string): string =>
  new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
