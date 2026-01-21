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
