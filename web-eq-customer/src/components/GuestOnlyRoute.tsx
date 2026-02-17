import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/auth.store";

/**
 * Renders child routes only when the user is not authenticated.
 * If already logged in, redirects to home (or returnTo from state) with replace
 * so send-otp/verify-otp are not accessible and back button doesn't land on them.
 */
export function GuestOnlyRoute() {
  const userInfo = useAuthStore((s) => s.userInfo);
  const isAuthenticated = Boolean(userInfo?.uuid);
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;

  if (isAuthenticated) {
    return <Navigate to={returnTo || "/"} replace />;
  }

  return <Outlet />;
}
