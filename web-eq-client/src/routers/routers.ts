export const ROUTERS_PATH = {
  ROOT_PATH: "/",
  ERROR: "/error",
  SENDOTP: "/send-otp",
  VERIFYOTP: "/verify-otp",
  INVITATION_CODE: "/invitation-code",
  USERPROFILE: "/user-profile",
  BUSINESSREGISTRATION: "/business-registration",
  DASHBOARD: "/dashboard",
  ALLUSERS: "/admin/users",
  USER_DETAIL: "/admin/users/:userId",
  EMPLOYEES: "/admin/employees",
  BUSINESSPROFILE: "/admin/business-profile",
  EMPLOYEEPROFILE: "/admin/employee-profile",
  QUEUEUSERS: "/admin/queue-users",
  QUEUE_USER_DETAIL: "/admin/queue-users/:queueUserId",
} as const;

/** Redirect path when user is authenticated but next_step is not dashboard */
export const NEXT_STEP_REDIRECT: Record<string, string> = {
  invitation_code: ROUTERS_PATH.INVITATION_CODE,
  owner_info: ROUTERS_PATH.USERPROFILE,
  business_registration: ROUTERS_PATH.BUSINESSREGISTRATION,
};
