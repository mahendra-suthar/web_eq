import { useEffect } from "react";
import { useAuthStore } from "../store/auth.store";
import { AuthService } from "../services/auth/auth.service";

/**
 * Runs once on app mount. If userInfo is persisted in localStorage but the
 * in-memory token is gone (page reload), silently calls POST /auth/token/refresh
 * (which uses the httpOnly cookie) to restore the token.
 *
 * On success: token is stored in memory, all subsequent requests use the
 *   Authorization header and WebSocket connections work.
 * On failure: userInfo is cleared — the user sees a clean logged-out state
 *   instead of stale data that would fail on the first protected API call.
 */
export function useSessionRestore(): void {
  useEffect(() => {
    const { userInfo, token, setSessionRestoring } = useAuthStore.getState();

    if (!userInfo?.uuid || token) return;

    setSessionRestoring(true);

    new AuthService()
      .refresh()
      .then(({ access_token }) => {
        if (access_token) useAuthStore.getState().setToken(access_token);
      })
      .catch((err) => {
        const status = (err as any)?.response?.status;
        if (status === 401 || status === 403) {
          window.dispatchEvent(new Event("auth:unauthorized"));
        }
        // Network/server errors: leave userInfo intact; cookie fallback keeps API calls alive
      })
      .finally(() => {
        useAuthStore.getState().setSessionRestoring(false);
      });
  }, []); // only on mount
}
