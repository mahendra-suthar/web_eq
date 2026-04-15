import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SuperAdminService } from "../../../services/super-admin/super-admin.service";
import { ProfileService } from "../../../services/profile/profile.service";
import { useUserStore } from "../../../utils/userStore";
import { ROUTERS_PATH } from "../../../routers/routers";
import "./login.scss";

type Step = "phone" | "otp";

const adminService = new SuperAdminService();
const profileService = new ProfileService();

const SuperAdminLogin = () => {
  const navigate = useNavigate();
  const { setProfile, setToken, setNextStep } = useUserStore();

  const [step, setStep] = useState<Step>("phone");
  const [countryCode, setCountryCode] = useState("+91");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      await adminService.sendOtp(countryCode, phone.trim());
      setStep("otp");
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await adminService.verifyOtp(countryCode, phone.trim(), otp.trim());
      setToken(res.token.access_token);
      setNextStep(res.next_step);
      // Fetch real profile from server instead of constructing it manually
      const profileRes = await profileService.getProfile();
      setProfile(profileRes);
      navigate(ROUTERS_PATH.SUPER_ADMIN, { replace: true });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail?.message || detail || "Invalid OTP or no admin access.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sa-login">
      <div className="sa-login-card">
        <div className="sa-login-header">
          <div className="sa-login-icon">🛡️</div>
          <h1>Super Admin</h1>
          <p>EaseQueue Platform</p>
        </div>

        {step === "phone" ? (
          <form onSubmit={handleSendOtp} className="sa-login-form">
            <label>Phone Number</label>
            <div className="sa-phone-row">
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                className="sa-country-select"
              >
                <option value="+91">+91</option>
                <option value="+1">+1</option>
                <option value="+44">+44</option>
                <option value="+971">+971</option>
              </select>
              <input
                type="tel"
                className="sa-input"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
                required
              />
            </div>
            {error && <div className="sa-error">{error}</div>}
            <button type="submit" className="sa-btn" disabled={loading || !phone.trim()}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="sa-login-form">
            <label>Enter OTP sent to {countryCode} {phone}</label>
            <input
              type="text"
              className="sa-input sa-input--otp"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength={6}
              autoFocus
              required
            />
            {error && <div className="sa-error">{error}</div>}
            <button type="submit" className="sa-btn" disabled={loading || !otp.trim()}>
              {loading ? "Verifying…" : "Login"}
            </button>
            <button
              type="button"
              className="sa-btn-link"
              onClick={() => { setStep("phone"); setError(""); setOtp(""); }}
            >
              Change phone number
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default SuperAdminLogin;
