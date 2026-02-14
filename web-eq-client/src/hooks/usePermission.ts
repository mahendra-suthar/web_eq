import { useMemo } from "react";
import { useUserStore } from "../utils/userStore";
import {
  hasPermission,
  canAccessRoute,
  NAV_ITEMS,
  type PermissionKey,
  type AppRole,
} from "../utils/permissions";

/** Current user's profile type (role) from store. */
export function useProfileType(): AppRole | null {
  return useUserStore((s) => s.getProfileType());
}

/** True if the current user has the given permission. Use for conditional UI. */
export function useCanAccessPermission(permission: PermissionKey): boolean {
  const profileType = useProfileType();
  return hasPermission(profileType, permission);
}

/** True if the current user can access the given route path. */
export function useCanAccessRoute(path: string): boolean {
  const profileType = useProfileType();
  return canAccessRoute(profileType, path);
}

/** Nav items filtered by current user's permissions. Use in Sidebar. */
export function useAllowedNavItems(): typeof NAV_ITEMS {
  const profileType = useProfileType();
  return useMemo(() => {
    return NAV_ITEMS.filter((item) => hasPermission(profileType, item.permission));
  }, [profileType]);
}
