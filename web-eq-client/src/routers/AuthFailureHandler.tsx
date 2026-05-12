import { useEffect, useRef } from "react";
import { useUserStore } from "../utils/userStore";
import { ROUTERS_PATH } from "./routers";

const LOGIN_PATH = ROUTERS_PATH.SENDOTP;
const AUTH_PATHS = [ROUTERS_PATH.SENDOTP, ROUTERS_PATH.VERIFYOTP];

function isOnAuthPage(path: string): boolean {
  return AUTH_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

export function AuthFailureHandler() {
  const resetUser = useUserStore((s) => s.resetUser);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const redirectingRef = useRef(false);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (redirectingRef.current) return;

      // Only redirect if the user currently believes they are logged in.
      if (!isAuthenticated()) return;

      const path = window.location.pathname || "";
      if (isOnAuthPage(path)) return;

      redirectingRef.current = true;
      resetUser();
      window.location.replace(LOGIN_PATH);
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
      redirectingRef.current = false;
    };
  }, [resetUser, isAuthenticated]);

  return null;
}
