import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SuperAdminService } from "../../../services/super-admin/super-admin.service";
import { ProfileService } from "../../../services/profile/profile.service";
import { useUserStore } from "../../../utils/userStore";
import { ROUTERS_PATH } from "../../../routers/routers";
import { DEFAULT_COUNTRY_CODE, PHONE_LENGTH, OTP_LENGTH, VALID_PHONE_START } from "../../../utils/constants";
import "./login.scss";

type Step = "phone" | "otp";

const adminService = new SuperAdminService();
const profileService = new ProfileService();

const SuperAdminLogin = () => {
  const navigate = useNavigate();
  const { setProfile, setToken, setNextStep } = useUserStore();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, PHONE_LENGTH);
    setPhone(digits);
    if (error) setError("");
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setOtp(digits);
    if (error) setError("");
  };

  const isPhoneValid = phone.length === PHONE_LENGTH && VALID_PHONE_START.test(phone);
  const isOtpValid = otp.length === OTP_LENGTH;

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPhoneValid) {
      setError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await adminService.sendOtp(DEFAULT_COUNTRY_CODE, phone);
      setStep("otp");
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || err?.response?.data?.detail || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOtpValid) {
      setError("Enter the 5-digit OTP.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await adminService.verifyOtp(DEFAULT_COUNTRY_CODE, phone, otp);
      setToken(res.token.access_token);
      setNextStep(res.next_step);
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
          <form onSubmit={handleSendOtp} className="sa-login-form" noValidate>
            <label htmlFor="sa-phone">Phone Number</label>
            <div className="sa-phone-row">
              <div className="sa-country-badge" aria-label="India +91">
                <span>🇮🇳</span>
                <span>{DEFAULT_COUNTRY_CODE}</span>
              </div>
              <input
                id="sa-phone"
                type="tel"
                inputMode="numeric"
                className="sa-input"
                placeholder="10-digit mobile number"
                value={phone}
                onChange={handlePhoneChange}
                maxLength={PHONE_LENGTH}
                autoFocus
                autoComplete="tel-national"
                aria-describedby="sa-phone-hint"
              />
            </div>
            <div className="sa-input-hint" id="sa-phone-hint">India only · starts with 6–9</div>
            {error && <div className="sa-error" role="alert">{error}</div>}
            <button type="submit" className="sa-btn" disabled={loading || !isPhoneValid}>
              {loading ? "Sending…" : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="sa-login-form" noValidate>
            <label htmlFor="sa-otp">OTP sent to {DEFAULT_COUNTRY_CODE} {phone}</label>
            <input
              id="sa-otp"
              type="text"
              inputMode="numeric"
              className="sa-input sa-input--otp"
              placeholder="5-digit OTP"
              value={otp}
              onChange={handleOtpChange}
              maxLength={OTP_LENGTH}
              autoFocus
              autoComplete="one-time-code"
            />
            {error && <div className="sa-error" role="alert">{error}</div>}
            <button type="submit" className="sa-btn" disabled={loading || !isOtpValid}>
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
