/**
 * Application-wide constants
 * Centralized location for all constants used across the application
 */

// ============================================================================
// Schedule Constants
// ============================================================================

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

// ============================================================================
// Profile Type Constants
// ============================================================================

export enum ProfileType {
  BUSINESS = "BUSINESS",
  EMPLOYEE = "EMPLOYEE",
  CUSTOMER = "CUSTOMER",
}

// ============================================================================
// Queue User Status Constants
// ============================================================================

export enum QueueUserStatus {
  REGISTERED = 1,
  IN_PROGRESS = 2,
  COMPLETED = 3,
  FAILED = 4,
  CANCELLED = 5,
  PRIORITY_REQUESTED = 6,
}

// ============================================================================
// Business Status Constants
// ============================================================================

export enum BusinessStatus {
  REGISTERED = 1,
}

// ============================================================================
// Business Registration Constants
// ============================================================================

export const BUSINESS_REGISTRATION_MIN_STEP = 1;
export const BUSINESS_REGISTRATION_MAX_STEP = 5;

// ============================================================================
// OTP Constants
// ============================================================================

/**
 * OTP countdown duration in seconds (5 minutes)
 */
export const OTP_COUNTDOWN_SECONDS = 300;

/**
 * OTP length
 */
export const OTP_LENGTH = 5;

// ============================================================================
// Pagination Constants
// ============================================================================

/**
 * Default items per page for pagination
 */
export const DEFAULT_PAGE_LIMIT = 10;

/**
 * Default initial page number
 */
export const DEFAULT_PAGE = 1;

// ============================================================================
// Debounce Constants
// ============================================================================

/**
 * Default debounce delay in milliseconds for search inputs
 */
export const DEFAULT_DEBOUNCE_DELAY_MS = 500;
