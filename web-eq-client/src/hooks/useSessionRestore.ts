import { useEffect } from "react";
import axios from "axios";
import { getApiUrl } from "../configs/config";
import { useUserStore } from "../utils/userStore";

/**
 * Runs once on app mount. If profile is persisted in localStorage but the
 * in-memory token is gone (page reload in a new tab, or browser reopen where
 * sessionStorage was cleared), silently calls POST /auth/token/refresh-business
 * (which uses the httpOnly cookie) to restore the token.
 *
 * On success : token is stored in sessionStorage + memory; all subsequent
 *              requests include the Authorization header automatically.
 * On 401/403 : session truly expired — delegates logout to AuthFailureHandler.
 * On network : leaves profile intact; the 401 interceptor will retry on the
 *              next API call using the same cookie.
 */
export function useSessionRestore(): void {
  useEffect(() => {
    const { profile, token } = useUserStore.getState();

    // token already present (sessionStorage survived) — nothing to do
    if (!profile?.user?.uuid || token) return;

    axios
      .post(`${getApiUrl()}/auth/token/refresh-business`, {}, { withCredentials: true })
      .then((res) => {
        const newToken: string | undefined = res.data?.token?.access_token;
        if (newToken) useUserStore.getState().setToken(newToken);
      })
      .catch((err) => {
        const status = (err as any)?.response?.status;
        if (status === 401 || status === 403) {
          window.dispatchEvent(new Event("auth:unauthorized"));
        }
        // Network/server errors: leave profile intact; interceptor handles retries
      });
  }, []); // only on mount
}
