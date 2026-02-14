import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUserStore } from "../utils/userStore";
import { hasPermission, type PermissionKey } from "../utils/permissions";
import { ROUTERS_PATH } from "./routers";

interface RoleGuardProps {
  children: React.ReactNode;
  /** Permission required to access this route. If user lacks it, redirect to dashboard. */
  permission: PermissionKey;
}

/**
 * Route-level guard: renders children only if the current user has the required permission.
 * Otherwise redirects to dashboard. Use around specific routes in App.
 */
export function RoleGuard({ children, permission }: RoleGuardProps) {
  const location = useLocation();
  const profileType = useUserStore((s) => s.getProfileType());

  if (!hasPermission(profileType, permission)) {
    return <Navigate to={ROUTERS_PATH.DASHBOARD} state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
