import { Suspense, lazy } from "react";
import type { ReactElement } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RouterConstant } from "./routers/index";
import { PrivateRoute } from "./routers/privateRoute";
import { RoleGuard } from "./routers/RoleGuard";
import { SuperAdminGuard } from "./routers/SuperAdminGuard";
import { AuthFailureHandler } from "./routers/AuthFailureHandler";
import { Permission } from "./utils/permissions";
import MainLayout from "./layouts/general-layout";
import AdminLayout from "./layouts/admin-layout";
import SuperAdminLayout from "./layouts/super-admin-layout";
import SendOTP from "./pages/send-otp";
import VerifyOTP from "./pages/verify-otp";
import InvitationCodePage from "./pages/invitation-code";
import UserProfile from "./pages/user-profile";
import BusinessRegistration from "./pages/business-registration";
import Dashboard from "./pages/dashboard";
import AllUsers from "./pages/all-users";
import Employees from "./pages/employees";
import EmployeeAdd from "./pages/employee-add";
import EmployeeDetail from "./pages/employee-detail";
import BusinessProfile from "./pages/business-profile";
import EmployeeProfile from "./pages/employee-profile";
import QueueUsers from "./pages/queue-users";
import QueueUserDetail from "./pages/queue-user-detail";
import Queues from "./pages/queues";
import QueueAdd from "./pages/queue-add";
import QueueDetail from "./pages/queue-detail";
import UserDetail from "./pages/user-detail";
import LiveQueue from "./pages/live-queue";

// Super Admin — lazy-loaded for code splitting
const SuperAdminLogin = lazy(() => import("./pages/super-admin/login"));
const SuperAdminDashboard = lazy(() => import("./pages/super-admin/dashboard"));
const SuperAdminCategories = lazy(() => import("./pages/super-admin/categories"));
const SuperAdminServices = lazy(() => import("./pages/super-admin/services"));
const SuperAdminBusinesses = lazy(() => import("./pages/super-admin/businesses"));
const SuperAdminUsers = lazy(() => import("./pages/super-admin/users"));

const { ROUTERS_PATH } = RouterConstant;

const PageSpinner = () => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 24 }}>
    ⏳
  </div>
);

const withSuspense = (el: ReactElement) => (
  <Suspense fallback={<PageSpinner />}>{el}</Suspense>
);

const App = () => (
  <BrowserRouter>
    <AuthFailureHandler />
    <Routes>
      {/* Public / Auth routes */}
      <Route element={<MainLayout />}>
        <Route path={ROUTERS_PATH.ROOT_PATH} element={<SendOTP />} />
        <Route path={ROUTERS_PATH.SENDOTP} element={<SendOTP />} />
        <Route path={ROUTERS_PATH.VERIFYOTP} element={<VerifyOTP />} />
        <Route path={ROUTERS_PATH.INVITATION_CODE} element={<InvitationCodePage />} />
        <Route path={ROUTERS_PATH.USERPROFILE} element={<UserProfile />} />
        <Route path={ROUTERS_PATH.BUSINESSREGISTRATION} element={<BusinessRegistration />} />
      </Route>

      {/* Super Admin login (standalone, no layout) */}
      <Route path={ROUTERS_PATH.SUPER_ADMIN_LOGIN} element={withSuspense(<SuperAdminLogin />)} />

      {/* Super Admin panel */}
      <Route element={<SuperAdminGuard><SuperAdminLayout /></SuperAdminGuard>}>
        <Route path={ROUTERS_PATH.SUPER_ADMIN} element={withSuspense(<SuperAdminDashboard />)} />
        <Route path={ROUTERS_PATH.SUPER_ADMIN_CATEGORIES} element={withSuspense(<SuperAdminCategories />)} />
        <Route path={ROUTERS_PATH.SUPER_ADMIN_SERVICES} element={withSuspense(<SuperAdminServices />)} />
        <Route path={ROUTERS_PATH.SUPER_ADMIN_BUSINESSES} element={withSuspense(<SuperAdminBusinesses />)} />
        <Route path={ROUTERS_PATH.SUPER_ADMIN_USERS} element={withSuspense(<SuperAdminUsers />)} />
      </Route>

      {/* Business / Employee admin panel */}
      <Route element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
        <Route path={ROUTERS_PATH.DASHBOARD} element={<Dashboard />} />
        <Route path={ROUTERS_PATH.ALLUSERS} element={<RoleGuard permission={Permission.VIEW_ALL_USERS}><AllUsers /></RoleGuard>} />
        <Route path={`${ROUTERS_PATH.ALLUSERS}/:userId`} element={<RoleGuard permission={Permission.VIEW_ALL_USERS}><UserDetail /></RoleGuard>} />
        <Route path={ROUTERS_PATH.EMPLOYEES} element={<RoleGuard permission={Permission.VIEW_EMPLOYEES}><Employees /></RoleGuard>} />
        <Route path={`${ROUTERS_PATH.EMPLOYEES}/new`} element={<RoleGuard permission={Permission.VIEW_EMPLOYEES}><EmployeeAdd /></RoleGuard>} />
        <Route path={`${ROUTERS_PATH.EMPLOYEES}/:employeeId`} element={<RoleGuard permission={Permission.VIEW_EMPLOYEES}><EmployeeDetail /></RoleGuard>} />
        <Route path={ROUTERS_PATH.BUSINESSPROFILE} element={<BusinessProfile />} />
        <Route path={ROUTERS_PATH.EMPLOYEEPROFILE} element={<EmployeeProfile />} />
        <Route path={ROUTERS_PATH.QUEUES} element={<RoleGuard permission={Permission.VIEW_QUEUES}><Queues /></RoleGuard>} />
        <Route path={`${ROUTERS_PATH.QUEUES}/new`} element={<RoleGuard permission={Permission.VIEW_QUEUES}><QueueAdd /></RoleGuard>} />
        <Route path={`${ROUTERS_PATH.QUEUES}/:queueId`} element={<RoleGuard permission={Permission.VIEW_QUEUES}><QueueDetail /></RoleGuard>} />
        <Route path={ROUTERS_PATH.LIVE_QUEUE} element={<RoleGuard permission={Permission.VIEW_LIVE_QUEUE}><LiveQueue /></RoleGuard>} />
        <Route path={ROUTERS_PATH.QUEUEUSERS} element={<QueueUsers />} />
        <Route path={`${ROUTERS_PATH.QUEUEUSERS}/:queueUserId`} element={<RoleGuard permission={Permission.VIEW_QUEUE_USERS}><QueueUserDetail /></RoleGuard>} />
      </Route>

      {/* Catch-all — redirect unknown paths to root */}
      <Route path="*" element={<Navigate to={ROUTERS_PATH.ROOT_PATH} replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
