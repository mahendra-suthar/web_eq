import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import CustomerLayout from "./layouts/customer-layout";
import { AuthFailureHandler } from "./components/AuthFailureHandler";
import { GuestOnlyRoute } from "./components/GuestOnlyRoute";
import LandingPage from "./pages/landing";
import BusinessListPage from "./pages/business-list";
import BusinessDetailsPage from "./pages/business-details";
import BookingPage from "./pages/booking";
import SendOTPPage from "./pages/send-otp";
import VerifyOTPPage from "./pages/verify-otp";

function App() {
  return (
    <BrowserRouter>
      <AuthFailureHandler />
      <Routes>
        <Route element={<CustomerLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/categories/:categoryId" element={<BusinessListPage />} />
          <Route path="/business/:businessId" element={<BusinessDetailsPage />} />
          <Route path="/business/:businessId/book" element={<BookingPage />} />
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
