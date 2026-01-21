/**
 * Day of week constants
 * Following ISO 8601 standard: 0 = Monday, 6 = Sunday
 * This matches the backend implementation where day_of_week is stored as 0-6
 */
export enum DayOfWeek {
  MONDAY = 0,
  TUESDAY = 1,
  WEDNESDAY = 2,
  THURSDAY = 3,
  FRIDAY = 4,
  SATURDAY = 5,
  SUNDAY = 6,
}

/**
 * Total number of days in a week
 */
export const DAYS_IN_WEEK = 7;

/**
 * Array of all day of week values in order (Monday to Sunday)
 */
export const DAYS_OF_WEEK = [
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
  DayOfWeek.SUNDAY,
] as const;

