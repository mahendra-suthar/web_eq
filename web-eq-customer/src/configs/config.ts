import config from './config.json';

export const getConfig = () => {
  return config;
};

export const getApiUrl = () => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof envUrl === "string" && envUrl.trim() !== "") return envUrl.trim();
  return config.API_URL;
};

/**
 * Build an absolute WebSocket base URL.
 *
 * - In dev (Vite proxy): API_URL is "/api" (relative).
 *   We derive from window.location so the WS goes through the same port/proxy.
 * - In production: VITE_API_URL is the full backend URL (e.g. https://api.onrender.com/api).
 *   We replace http(s) → ws(s) as before.
 */
export const getWsBaseUrl = (): string => {
  const apiUrl = getApiUrl();
  if (apiUrl.startsWith("http")) {
    return apiUrl.replace(/^http/, "ws");
  }
  // Relative URL — build from current window location
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${apiUrl}`;
};
