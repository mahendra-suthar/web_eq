/**
 * Centralized role-based access control for the client.
 * Single source of truth for which roles can access which routes and nav items.
 */

import { ProfileType } from "./constants";
import { ROUTERS_PATH } from "../routers/routers";

/** User role for access control (aligned with profile_type from API) */
export type AppRole = ProfileType.BUSINESS | ProfileType.EMPLOYEE | ProfileType.CUSTOMER;

/** Permission keys for features/pages. Add new ones here as the app grows. */
export const Permission = {
  VIEW_DASHBOARD: "VIEW_DASHBOARD",
  VIEW_EMPLOYEES: "VIEW_EMPLOYEES",
  VIEW_ALL_USERS: "VIEW_ALL_USERS",
  VIEW_QUEUE_USERS: "VIEW_QUEUE_USERS",
  VIEW_BUSINESS_PROFILE: "VIEW_BUSINESS_PROFILE",
  VIEW_EMPLOYEE_PROFILE: "VIEW_EMPLOYEE_PROFILE",
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

/** Which roles can access each permission. Easy to extend for ADMIN etc. */
export const ROLE_PERMISSIONS: Record<PermissionKey, AppRole[]> = {
  [Permission.VIEW_DASHBOARD]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_EMPLOYEES]: [ProfileType.BUSINESS],
  [Permission.VIEW_ALL_USERS]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_QUEUE_USERS]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_BUSINESS_PROFILE]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_EMPLOYEE_PROFILE]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
};

/** Map route path to required permission. Used for route guards. */
export const ROUTE_PERMISSION: Record<string, PermissionKey> = {
  [ROUTERS_PATH.DASHBOARD]: Permission.VIEW_DASHBOARD,
  [ROUTERS_PATH.EMPLOYEES]: Permission.VIEW_EMPLOYEES,
  [ROUTERS_PATH.ALLUSERS]: Permission.VIEW_ALL_USERS,
  [ROUTERS_PATH.QUEUEUSERS]: Permission.VIEW_QUEUE_USERS,
  [ROUTERS_PATH.BUSINESSPROFILE]: Permission.VIEW_BUSINESS_PROFILE,
  [ROUTERS_PATH.EMPLOYEEPROFILE]: Permission.VIEW_EMPLOYEE_PROFILE,
};

export interface NavItemConfig {
  path: string;
  label: string;
  icon: string;
  permission: PermissionKey;
  sectionTitle?: string;
}

/** Sidebar nav items with required permission. Single place to add/remove or reorder. */
export const NAV_ITEMS: NavItemConfig[] = [
  { path: ROUTERS_PATH.DASHBOARD, label: "Dashboard", icon: "📊", permission: Permission.VIEW_DASHBOARD, sectionTitle: "Overview" },
  { path: ROUTERS_PATH.EMPLOYEES, label: "Employees", icon: "👷", permission: Permission.VIEW_EMPLOYEES, sectionTitle: "Employee Management" },
  { path: ROUTERS_PATH.ALLUSERS, label: "All Users", icon: "👥", permission: Permission.VIEW_ALL_USERS, sectionTitle: "User Management" },
  { path: ROUTERS_PATH.QUEUEUSERS, label: "Queue Users", icon: "📋", permission: Permission.VIEW_QUEUE_USERS, sectionTitle: "Queue Management" },
];

/** Check if a role has a given permission. */
export function hasPermission(role: AppRole | null | undefined, permission: PermissionKey): boolean {
  if (!role) return false;
  const allowed = ROLE_PERMISSIONS[permission];
  return allowed ? allowed.includes(role) : false;
}

/** Check if a role can access a route by path. */
export function canAccessRoute(role: AppRole | null | undefined, path: string): boolean {
  const permission = ROUTE_PERMISSION[path];
  if (!permission) return true;
  return hasPermission(role, permission);
}
