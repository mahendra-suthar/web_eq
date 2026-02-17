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
 * and redirects to send-otp unless already on an auth page.
 */
export function AuthFailureHandler() {
  const resetUser = useAuthStore((s) => s.resetUser);
  const redirectingRef = useRef(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (redirectingRef.current) return;
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
  }, [resetUser]);

  return null;
}
