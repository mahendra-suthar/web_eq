import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUserStore } from "../utils/userStore";
import { ProfileType } from "../utils/constants";
import { ROUTERS_PATH } from "./routers";

/**
 * Protects all /super-admin/* routes.
 * - Unauthenticated → redirect to super admin login
 * - Authenticated but not ADMIN → redirect to business dashboard
 * - ADMIN → render children
 */
export function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, getProfileType } = useUserStore();

  if (!isAuthenticated()) {
    return <Navigate to={ROUTERS_PATH.SUPER_ADMIN_LOGIN} state={{ from: location }} replace />;
  }

  const profileType = getProfileType();
  if (profileType !== ProfileType.ADMIN) {
    // Non-admin logged in users → send to their own dashboard
    return <Navigate to={ROUTERS_PATH.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
