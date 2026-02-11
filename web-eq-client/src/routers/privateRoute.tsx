import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { ROUTERS_PATH, NEXT_STEP_REDIRECT } from "./routers";
import { useUserStore } from "../utils/userStore";

interface PrivateRouteProps {
  children: React.ReactNode;
}

/**
 * Protects admin routes: requires auth and next_step === "dashboard".
 * Redirects to login or the appropriate step (invitation_code, owner_info, business_registration).
 */
export function PrivateRoute({ children }: PrivateRouteProps) {
  const location = useLocation();
  const { isAuthenticated, canAccessDashboard, nextStep } = useUserStore();

  if (!isAuthenticated()) {
    return <Navigate to={ROUTERS_PATH.SENDOTP} state={{ from: location }} replace />;
  }

  if (!canAccessDashboard()) {
    const redirectTo = (nextStep && NEXT_STEP_REDIRECT[nextStep]) || ROUTERS_PATH.SENDOTP;
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}