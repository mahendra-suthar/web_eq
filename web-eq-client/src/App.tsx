import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { RouterConstant } from "./routers/index";
import { PrivateRoute } from "./routers/privateRoute";
import MainLayout from "./layouts/general-layout";
import AdminLayout from "./layouts/admin-layout";
import SendOTP from "./pages/send-otp";
import VerifyOTP from "./pages/verify-otp";
import InvitationCodePage from "./pages/invitation-code";
import UserProfile from "./pages/user-profile";
import BusinessRegistration from "./pages/business-registration";
import Dashboard from "./pages/dashboard";
import AllUsers from "./pages/all-users";
import Employees from "./pages/employees";
import BusinessProfile from "./pages/business-profile";
import EmployeeProfile from "./pages/employee-profile";
import QueueUsers from "./pages/queue-users";

const App = () => {
  const { ROUTERS_PATH } = RouterConstant;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route path={ROUTERS_PATH.ROOT_PATH} element={<SendOTP />} />
          <Route path={ROUTERS_PATH.SENDOTP} element={<SendOTP />} />
          <Route path={ROUTERS_PATH.VERIFYOTP} element={<VerifyOTP />} />
          <Route path={ROUTERS_PATH.INVITATION_CODE} element={<InvitationCodePage />} />
          <Route path={ROUTERS_PATH.USERPROFILE} element={<UserProfile />} />
          <Route path={ROUTERS_PATH.BUSINESSREGISTRATION} element={<BusinessRegistration />} />
        </Route>
        <Route element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
          <Route path={ROUTERS_PATH.DASHBOARD} element={<Dashboard />} />
          <Route path={ROUTERS_PATH.ALLUSERS} element={<AllUsers />} />
          <Route path={ROUTERS_PATH.EMPLOYEES} element={<Employees />} />
          <Route path={ROUTERS_PATH.BUSINESSPROFILE} element={<BusinessProfile />} />
          <Route path={ROUTERS_PATH.EMPLOYEEPROFILE} element={<EmployeeProfile />} />
          <Route path={ROUTERS_PATH.QUEUEUSERS} element={<QueueUsers />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
