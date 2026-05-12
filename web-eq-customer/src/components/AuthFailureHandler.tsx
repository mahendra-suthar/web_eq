import { useEffect, useRef } from "react";
import { useAuthStore } from "../store/auth.store";

const SEND_OTP_PATH = "/send-otp";
const VERIFY_OTP_PATH = "/verify-otp";

const AUTH_PATHS = [SEND_OTP_PATH, VERIFY_OTP_PATH];

function isOnAuthPage(path: string): boolean {
  return AUTH_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Listens for auth:unauthorized (dispatched by HttpClient on 401/403/ERR_NETWORK)
 * and redirects to send-otp ONLY when the user has an active session.
 *
 * Public pages (landing, business list, etc.) make unauthenticated API calls.
 * A 401/403 on those should NOT redirect a guest user — only redirect when
 * a previously authenticated session has become invalid.
 */
export function AuthFailureHandler() {
  const resetUser = useAuthStore((s) => s.resetUser);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const redirectingRef = useRef(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (redirectingRef.current) return;

      // Only redirect if the user currently believes they are logged in.
      // Guest users hitting public endpoints that return 401/403 should
      // not be bounced to the login page.
      if (!isAuthenticated()) return;

      const path = window.location.pathname || "";
      if (isOnAuthPage(path)) return;

      redirectingRef.current = true;
      resetUser();
      window.location.replace(SEND_OTP_PATH);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
      redirectingRef.current = false;
    };
  }, [resetUser, isAuthenticated]);

  return null;
}
