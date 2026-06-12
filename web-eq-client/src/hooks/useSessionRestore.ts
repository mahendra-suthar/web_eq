import { useEffect } from "react";
import axios from "axios";
import { getApiUrl } from "../configs/config";
import { useUserStore } from "../utils/userStore";

/**
 * Runs once on app mount. If profile is persisted in localStorage but the
 * in-memory token is gone (new tab / browser reopen), sets sessionRestoring=true
 * so PrivateRoute holds off rendering pages — preventing API calls from firing
 * before the token is back (eliminates the race that caused logout on tab open).
 *
 * On success : token restored; sessionRestoring cleared; pages render normally.
 * On 401/403 : session expired — clears sessionRestoring, delegates to AuthFailureHandler.
 * On network : leaves profile intact; clears sessionRestoring so app is usable.
 */
export function useSessionRestore(): void {
  useEffect(() => {
    const { profile, token, setSessionRestoring } = useUserStore.getState();

    if (!profile?.user?.uuid || token) return;

    setSessionRestoring(true);

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
      })
      .finally(() => {
        useUserStore.getState().setSessionRestoring(false);
      });
  }, []); // only on mount
}
