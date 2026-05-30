import { useEffect, useRef } from "react";
import axios from "axios";
import { getApiUrl } from "../configs/config";
import { useUserStore } from "../utils/userStore";

// Only treat a return as a "resume" if the tab was hidden at least this long.
// Short flicks (alt-tab, a notification) shouldn't trigger a refresh.
const RESUME_AFTER_MS = 30_000;

/**
 * When the user returns to a tab that was hidden for a while, the in-memory /
 * sessionStorage access token may have expired (background timers are throttled,
 * so the silent 60s refresh stops running). This proactively refreshes the token
 * on return and broadcasts "app:resumed" so data-polling pages can refetch.
 *
 * Best-effort: a transient/network failure never logs out — the 401 interceptor
 * and AuthFailureHandler remain the single source of truth for real auth failures.
 */
export function useVisibilityRefresh(): void {
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now();
        return;
      }

      const hiddenFor = hiddenAtRef.current ? Date.now() - hiddenAtRef.current : 0;
      hiddenAtRef.current = null;
      if (hiddenFor < RESUME_AFTER_MS) return;

      const { profile } = useUserStore.getState();
      if (profile?.user?.uuid) {
        try {
          const res = await axios.post(
            `${getApiUrl()}/auth/token/refresh-business`,
            {},
            { withCredentials: true }
          );
          const token: string | undefined = res.data?.token?.access_token;
          if (token) useUserStore.getState().setToken(token);
        } catch (err: any) {
          const status = err?.response?.status;
          if (status === 401 || status === 403) {
            window.dispatchEvent(new Event("auth:unauthorized"));
            return;
          }
          // Transient/network: leave the session intact; the 401 interceptor
          // will refresh on the next real request.
        }
      }

      window.dispatchEvent(new Event("app:resumed"));
    };

    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}
