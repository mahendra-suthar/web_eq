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
    // Read state directly — avoids stale closure from reactive selectors,
    // and skips unnecessary re-renders since this runs only once on mount.
    const { userInfo, token } = useAuthStore.getState();

    if (!userInfo?.uuid || token) return;

    new AuthService()
      .refresh()
      .then(({ access_token }) => {
        if (access_token) useAuthStore.getState().setToken(access_token);
      })
      .catch(() => {
        useAuthStore.getState().resetUser();
      });
  }, []); // only on mount
}
