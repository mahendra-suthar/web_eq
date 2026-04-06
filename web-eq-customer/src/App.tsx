import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import CustomerLayout from "./layouts/customer-layout";
import AuthLayout from "./layouts/auth-layout";
import { AuthFailureHandler } from "./components/AuthFailureHandler";
import ScrollToTop from "./components/ScrollToTop";
import { GuestOnlyRoute } from "./components/GuestOnlyRoute";
import LandingPage from "./pages/landing";
import BusinessListPage from "./pages/business-list";
import BusinessDetailsPage from "./pages/business-details";
import BookingPage from "./pages/booking";
import SendOTPPage from "./pages/send-otp";
import VerifyOTPPage from "./pages/verify-otp";
import ProfilePage from "./pages/profile";
import SearchPage from "./pages/search";

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthFailureHandler />
      <Routes>
        <Route element={<CustomerLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/categories/:categoryId" element={<BusinessListPage />} />
          <Route path="/business/:businessId" element={<BusinessDetailsPage />} />
          <Route path="/business/:businessId/book" element={<BookingPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/orders" element={<Navigate to="/profile?tab=appointments" replace />} />
          <Route path="/settings" element={<Navigate to="/profile?tab=settings" replace />} />
        </Route>

        <Route element={<AuthLayout />}>
          <Route element={<GuestOnlyRoute />}>
            <Route path="/send-otp" element={<SendOTPPage />} />
            <Route path="/verify-otp" element={<VerifyOTPPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App
