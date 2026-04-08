/**
 * Central config for all external URLs.
 * Update VITE_ADMIN_URL in .env to point to your admin panel domain.
 */
export const EXTERNAL_LINKS = {
  adminPanel:  import.meta.env.VITE_ADMIN_URL || 'https://web-eq-admin.onrender.com',
  mainSite:    'https://www.easequeue.com',
  contact:     'https://www.easequeue.com/#contact-form',
  privacy:     'https://www.easequeue.com/privacy_policy',
  terms:       'https://www.easequeue.com/terms_and_conditions',
} as const;
