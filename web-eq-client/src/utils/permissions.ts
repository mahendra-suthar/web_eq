/**
 * Centralized role-based access control for the client.
 * Single source of truth for which roles can access which routes and nav items.
 */

import { ProfileType } from "./constants";
import { ROUTERS_PATH } from "../routers/routers";

/** Permission keys for features/pages. Add new ones here as the app grows. */
export const Permission = {
  // Business / Employee panel
  VIEW_DASHBOARD: "VIEW_DASHBOARD",
  VIEW_EMPLOYEES: "VIEW_EMPLOYEES",
  VIEW_ALL_USERS: "VIEW_ALL_USERS",
  VIEW_QUEUE_USERS: "VIEW_QUEUE_USERS",
  VIEW_QUEUES: "VIEW_QUEUES",
  VIEW_LIVE_QUEUE: "VIEW_LIVE_QUEUE",
  VIEW_BUSINESS_PROFILE: "VIEW_BUSINESS_PROFILE",
  VIEW_EMPLOYEE_PROFILE: "VIEW_EMPLOYEE_PROFILE",
  // Super Admin panel
  VIEW_SUPER_ADMIN: "VIEW_SUPER_ADMIN",
  MANAGE_CATEGORIES: "MANAGE_CATEGORIES",
  MANAGE_SERVICES: "MANAGE_SERVICES",
  MANAGE_BUSINESSES: "MANAGE_BUSINESSES",
  MANAGE_USERS: "MANAGE_USERS",
} as const;

export type PermissionKey = (typeof Permission)[keyof typeof Permission];

/** Which roles can access each permission. */
export const ROLE_PERMISSIONS: Record<PermissionKey, ProfileType[]> = {
  [Permission.VIEW_DASHBOARD]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_EMPLOYEES]: [ProfileType.BUSINESS],
  [Permission.VIEW_ALL_USERS]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_QUEUE_USERS]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_QUEUES]: [ProfileType.BUSINESS],
  [Permission.VIEW_LIVE_QUEUE]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_BUSINESS_PROFILE]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  [Permission.VIEW_EMPLOYEE_PROFILE]: [ProfileType.BUSINESS, ProfileType.EMPLOYEE],
  // Super Admin
  [Permission.VIEW_SUPER_ADMIN]: [ProfileType.ADMIN],
  [Permission.MANAGE_CATEGORIES]: [ProfileType.ADMIN],
  [Permission.MANAGE_SERVICES]: [ProfileType.ADMIN],
  [Permission.MANAGE_BUSINESSES]: [ProfileType.ADMIN],
  [Permission.MANAGE_USERS]: [ProfileType.ADMIN],
};

/** Map route path to required permission. Used for route guards. */
export const ROUTE_PERMISSION: Record<string, PermissionKey> = {
  [ROUTERS_PATH.DASHBOARD]: Permission.VIEW_DASHBOARD,
  [ROUTERS_PATH.EMPLOYEES]: Permission.VIEW_EMPLOYEES,
  [ROUTERS_PATH.ALLUSERS]: Permission.VIEW_ALL_USERS,
  [ROUTERS_PATH.QUEUEUSERS]: Permission.VIEW_QUEUE_USERS,
  [ROUTERS_PATH.QUEUES]: Permission.VIEW_QUEUES,
  [ROUTERS_PATH.LIVE_QUEUE]: Permission.VIEW_LIVE_QUEUE,
  [ROUTERS_PATH.BUSINESSPROFILE]: Permission.VIEW_BUSINESS_PROFILE,
  [ROUTERS_PATH.EMPLOYEEPROFILE]: Permission.VIEW_EMPLOYEE_PROFILE,
  [ROUTERS_PATH.SUPER_ADMIN]: Permission.VIEW_SUPER_ADMIN,
  [ROUTERS_PATH.SUPER_ADMIN_CATEGORIES]: Permission.MANAGE_CATEGORIES,
  [ROUTERS_PATH.SUPER_ADMIN_SERVICES]: Permission.MANAGE_SERVICES,
  [ROUTERS_PATH.SUPER_ADMIN_BUSINESSES]: Permission.MANAGE_BUSINESSES,
  [ROUTERS_PATH.SUPER_ADMIN_USERS]: Permission.MANAGE_USERS,
};

export interface NavItemConfig {
  path: string;
  label: string;
  icon: string;
  permission: PermissionKey;
  sectionTitle?: string;
}

/** Business/Employee sidebar nav items. */
export const NAV_ITEMS: NavItemConfig[] = [
  { path: ROUTERS_PATH.DASHBOARD, label: "Dashboard", icon: "📊", permission: Permission.VIEW_DASHBOARD, sectionTitle: "Overview" },
  { path: ROUTERS_PATH.EMPLOYEES, label: "Employees", icon: "👷", permission: Permission.VIEW_EMPLOYEES, sectionTitle: "Employee Management" },
  { path: ROUTERS_PATH.ALLUSERS, label: "All Users", icon: "👥", permission: Permission.VIEW_ALL_USERS, sectionTitle: "User Management" },
  { path: ROUTERS_PATH.QUEUES, label: "Queues", icon: "📑", permission: Permission.VIEW_QUEUES, sectionTitle: "Queue Management" },
  { path: ROUTERS_PATH.LIVE_QUEUE, label: "Live Queue", icon: "⚡", permission: Permission.VIEW_LIVE_QUEUE, sectionTitle: "Queue Management" },
  { path: ROUTERS_PATH.QUEUEUSERS, label: "Queue Users", icon: "📋", permission: Permission.VIEW_QUEUE_USERS, sectionTitle: "Queue Management" },
];

/** Super Admin sidebar nav items. */
export const SUPER_ADMIN_NAV_ITEMS: NavItemConfig[] = [
  { path: ROUTERS_PATH.SUPER_ADMIN, label: "Dashboard", icon: "📊", permission: Permission.VIEW_SUPER_ADMIN, sectionTitle: "Overview" },
  { path: ROUTERS_PATH.SUPER_ADMIN_CATEGORIES, label: "Categories", icon: "🗂️", permission: Permission.MANAGE_CATEGORIES, sectionTitle: "Catalogue" },
  { path: ROUTERS_PATH.SUPER_ADMIN_SERVICES, label: "Services", icon: "🔧", permission: Permission.MANAGE_SERVICES, sectionTitle: "Catalogue" },
  { path: ROUTERS_PATH.SUPER_ADMIN_BUSINESSES, label: "Businesses", icon: "🏢", permission: Permission.MANAGE_BUSINESSES, sectionTitle: "Platform" },
  { path: ROUTERS_PATH.SUPER_ADMIN_USERS, label: "Users", icon: "👥", permission: Permission.MANAGE_USERS, sectionTitle: "Platform" },
];

/** Check if a role has a given permission. */
export function hasPermission(role: ProfileType | null | undefined, permission: PermissionKey): boolean {
  if (!role) return false;
  const allowed = ROLE_PERMISSIONS[permission];
  return allowed ? allowed.includes(role) : false;
}

/** Check if a role can access a route by path. */
export function canAccessRoute(role: ProfileType | null | undefined, path: string): boolean {
  const permission = ROUTE_PERMISSION[path];
  if (!permission) return true;
  return hasPermission(role, permission);
}
