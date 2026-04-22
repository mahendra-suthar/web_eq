import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import eqLogo from "../../assets/transparent_logo.png";
import { AuthService } from "../../services/auth/auth.service";
import { useAuthStore } from "../../store/auth.store";
import {
  OTP_COUNTDOWN_SECONDS,
  OTP_LENGTH,
  OTPErrorCode,
  DEFAULT_COUNTRY_CODE,
} from "../../utils/constants";
import { getBookingReturnState } from "../../utils/bookingReturnState";
import "./verify-otp.scss";

export default function VerifyOTPPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { setUserInfo, setToken, setProfileType } = useAuthStore();
  const phone = (location.state?.phone as string) || "";
  const phoneNumber = (location.state?.phoneNumber as string) || "";
  const countryCode = (location.state?.countryCode as string) || DEFAULT_COUNTRY_CODE;

  const {
    returnTo,
    selectedServices,
    selectedServicesData,
    businessName,
    rescheduleQueueUserId,
    rescheduleInitialDate,
  } = useMemo(() => {
    const fromLocation = {
      returnTo: (location.state?.returnTo as string) || null,
      selectedServices: (location.state?.selectedServices as string[]) || null,
      selectedServicesData: location.state?.selectedServicesData ?? null,
      businessName: (location.state?.businessName as string) || null,
      rescheduleQueueUserId: (location.state?.rescheduleQueueUserId as string) || null,
      rescheduleInitialDate: (location.state?.rescheduleInitialDate as string) || null,
    };
    if (fromLocation.returnTo && (fromLocation.selectedServices?.length || fromLocation.selectedServicesData?.length || fromLocation.rescheduleQueueUserId)) {
      return fromLocation;
    }
    const stored = getBookingReturnState();
    if (stored?.returnTo) {
      return {
        returnTo: stored.returnTo,
        selectedServices: stored.selectedServices || null,
        selectedServicesData: stored.selectedServicesData?.length ? stored.selectedServicesData : null,
        businessName: stored.businessName || null,
        rescheduleQueueUserId: stored.rescheduleQueueUserId || null,
        rescheduleInitialDate: stored.rescheduleInitialDate || null,
      };
    }
    return fromLocation;
  }, [location.state]);

  // ── OTP state ────────────────────────────────────────────────────────────
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [shakeError, setShakeError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(OTP_COUNTDOWN_SECONDS);
  const [resendLoading, setResendLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!phone || !phoneNumber) navigate("/send-otp", { replace: true });
  }, [phone, phoneNumber, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((p) => p - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  if (!phone || !phoneNumber) return null;

  const otp = digits.join("");

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}:${String(sec).padStart(2, "0")}` : `${sec}s`;
  };

  const triggerShake = () => {
    setShakeError(true);
    setTimeout(() => setShakeError(false), 400);
  };

  const backState = {
    returnTo, selectedServices, selectedServicesData,
    businessName, rescheduleQueueUserId, rescheduleInitialDate,
    phoneNumber,
  };

  const handleDigitChange = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const digit = e.target.value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => { const next = [...prev]; next[idx] = digit; return next; });
    setError("");
    if (digit && idx < OTP_LENGTH - 1) inputRefs.current[idx + 1]?.focus();
  };

  const handleDigitKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const paste = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    setDigits(paste.split("").concat(Array(OTP_LENGTH - paste.length).fill("")));
    setError("");
    inputRefs.current[Math.min(paste.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (otp.length < OTP_LENGTH) { triggerShake(); return; }

    setLoading(true);
    setError("");
    try {
      const authService = new AuthService();
      const response = await authService.verifyOTPCustomer(countryCode, phoneNumber, otp, "web");

      if (response.token && response.user) {
        const toUserData = (u: typeof response.user) => ({
          ...u,
          date_of_birth: u.date_of_birth
            ? (typeof u.date_of_birth === "string" ? u.date_of_birth : new Date(u.date_of_birth).toISOString())
            : null,
        });
        setUserInfo(toUserData(response.user));
        setProfileType(response.profile_type ?? "CUSTOMER");
        if (response.token?.access_token) {
          setToken(response.token.access_token);
        }
        setSuccess(true);

        setTimeout(() => {
          if (returnTo) {
            navigate(returnTo, {
              replace: true,
              state: {
                selectedServices, selectedServicesData, businessName,
                rescheduleQueueUserId: rescheduleQueueUserId ?? undefined,
                rescheduleInitialDate: rescheduleInitialDate ?? undefined,
              },
            });
          } else {
            navigate("/", { replace: true });
          }
        }, 1500);
      } else {
        setError(t("invalidResponse"));
        triggerShake();
      }
    } catch (err: any) {
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();

      let msg = t("otpVerificationFailed");
      const code = err?.response?.data?.detail?.error_code;
      if (code) {
        switch (code) {
          case OTPErrorCode.OTP_NOT_FOUND: msg = t("otpNotFound"); break;
          case OTPErrorCode.OTP_EXPIRED: msg = t("otpExpired"); break;
          case OTPErrorCode.OTP_INVALID: msg = t("otpInvalid"); break;
          case OTPErrorCode.OTP_ALREADY_USED: msg = t("otpAlreadyUsed"); break;
          default: msg = err?.response?.data?.detail?.message || err?.customMessage || t("otpVerificationFailed");
        }
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        msg = t("networkError");
      } else {
        msg = err?.customMessage || err?.response?.data?.detail?.message || t("otpVerificationFailed");
      }
      setError(msg);
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!phoneNumber) return;
    setResendLoading(true);
    setError("");
    try {
      const authService = new AuthService();
      await authService.sendOTP(countryCode, phoneNumber, "customer");
      setCountdown(OTP_COUNTDOWN_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(""));
      setTimeout(() => inputRefs.current[0]?.focus(), 50);
    } catch (err: any) {
      setError(err?.response?.data?.detail?.message || err?.customMessage || t("failedToSendOtp"));
    } finally {
      setResendLoading(false);
    }
  };

  const BandDeco = () => (
    <>
      <div className="auth-band-deco auth-band-deco-1" aria-hidden="true" />
      <div className="auth-band-deco auth-band-deco-2" aria-hidden="true" />
          <img src={eqLogo} alt="EaseQueue" className="auth-band-logo-img" aria-hidden="true" />
    </>
  );

  if (success) {
    return (
      <div className="auth-wrap">
        <div className="auth-card">
          <div className="auth-band">
            <BandDeco />
            <div className="auth-band-title">
              {t("auth.successText")} <em>{t("auth.successAccent")}</em>
            </div>
            <div className="auth-band-sub">{t("auth.signedInSuccess")}</div>
          </div>
          <div className="auth-body auth-panel auth-panel--center">
            <div className="auth-success-icon" aria-hidden="true">✓</div>
            <div className="auth-success-title">{t("auth.youreIn")}</div>
            <div className="auth-success-sub">{t("auth.redirecting")}</div>
            <button
              className="auth-btn-primary"
              onClick={() => navigate(returnTo || "/")}
            >
              {t("auth.goToAccount")}
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // STEP 2: OTP entry
  return (
    <div className="auth-wrap">
      <div className="auth-card">

        {/* Band */}
        <div className="auth-band">
          <BandDeco />
          <div className="auth-band-title">
            {t("auth.otpText")} <em>{t("auth.otpAccent")}</em>
          </div>
          <div className="auth-band-sub">{t("auth.checkSms", { n: OTP_LENGTH })}</div>
        </div>

        {/* Body */}
        <div className="auth-body auth-panel">

          {/* Phone display */}
          <div className="auth-phone-display">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81a19.79 19.79 0 01-3.07-8.68A2 2 0 012.18 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.91a16 16 0 006.17 6.17l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/>
            </svg>
            <span>{phone}</span>
            <button
              className="auth-change-btn"
              type="button"
              onClick={() => navigate("/send-otp", { state: backState })}
            >
              {t("auth.changeNumber")}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="auth-error" role="alert">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleVerify} noValidate>
            {/* OTP boxes */}
            <div className="auth-form-group auth-form-group--center">
              <label className="auth-label">{t("auth.enterOtpLabel", { n: OTP_LENGTH })}</label>
              <div
                className="auth-otp-row"
                role="group"
                aria-label={t("auth.enterOtpLabel", { n: OTP_LENGTH })}
              >
                {Array.from({ length: OTP_LENGTH }, (_, i) => (
                  <input
                    key={i}
                    ref={(el) => { inputRefs.current[i] = el; }}
                    className={[
                      "auth-otp-box",
                      digits[i] ? "auth-otp-box--filled" : "",
                      shakeError ? "auth-otp-box--error" : "",
                    ].filter(Boolean).join(" ")}
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]"
                    maxLength={1}
                    value={digits[i]}
                    onChange={(e) => handleDigitChange(i, e)}
                    onKeyDown={(e) => handleDigitKeyDown(i, e)}
                    onPaste={i === 0 ? handlePaste : undefined}
                    autoFocus={i === 0}
                    autoComplete={i === 0 ? "one-time-code" : "off"}
                    aria-label={`Digit ${i + 1} of ${OTP_LENGTH}`}
                  />
                ))}
              </div>
            </div>

            {/* Resend */}
            <div className="auth-resend-row">
              <span>{t("auth.didNotReceive")}</span>
              <button
                type="button"
                className="auth-resend-btn"
                disabled={countdown > 0 || resendLoading}
                onClick={handleResend}
              >
                {resendLoading
                  ? t("sending")
                  : countdown > 0
                    ? t("auth.resendIn", { time: formatCountdown(countdown) })
                    : t("auth.resendOtp")}
              </button>
            </div>

            {/* Verify CTA */}
            <div className="auth-verify-cta">
              <button
                className="auth-btn-primary"
                type="submit"
                disabled={otp.length < OTP_LENGTH || loading}
              >
                {loading ? (
                  <><div className="auth-spinner" aria-hidden="true" />{t("verifying")}</>
                ) : t("auth.verifyCta")}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
