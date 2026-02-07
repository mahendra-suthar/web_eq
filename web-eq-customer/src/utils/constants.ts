/**
 * Application-wide constants
 * Centralized location for all constants used across the application
 */

// ============================================================================
// Profile Type Constants
// ============================================================================

export enum ProfileType {
  BUSINESS = "BUSINESS",
  EMPLOYEE = "EMPLOYEE",
  CUSTOMER = "CUSTOMER",
}

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
// Phone Number Constants
// ============================================================================

/**
 * Phone number length for India
 */
export const PHONE_NUMBER_LENGTH = 10;

/**
 * Default country code
 */
export const DEFAULT_COUNTRY_CODE = "+91";

/**
 * Valid starting digits for Indian phone numbers
 */
export const VALID_PHONE_START_DIGITS = /^[6789]/;

// ============================================================================
// OTP Error Codes
// ============================================================================

export enum OTPErrorCode {
  INVALID_PHONE_FORMAT = 1,
  RATE_LIMIT_EXCEEDED = 2,
  PHONE_ALREADY_EXIST = 3,
  PHONE_DOES_NOT_EXIST = 4,
  OTP_NOT_FOUND = 1,
  OTP_EXPIRED = 2,
  OTP_INVALID = 3,
  OTP_ALREADY_USED = 4,
}

// ============================================================================
// WebSocket Constants
// ============================================================================

/**
 * Maximum number of reconnection attempts
 */
export const MAX_RECONNECT_ATTEMPTS = 5;

/**
 * Initial reconnection delay in milliseconds
 */
export const INITIAL_RECONNECT_DELAY_MS = 1000;

/**
 * Maximum reconnection delay in milliseconds
 */
export const MAX_RECONNECT_DELAY_MS = 30000;

// ============================================================================
// HTTP Status Codes
// ============================================================================

export enum HttpStatus {
  UNAUTHORIZED = 401,
}
