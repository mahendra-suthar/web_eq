import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthService } from "../../services/auth/auth.service";
import {
  PHONE_NUMBER_LENGTH,
  DEFAULT_COUNTRY_CODE,
  VALID_PHONE_START_DIGITS,
  OTPErrorCode,
  ProfileType,
} from "../../utils/constants";
import { saveBookingReturnState, getBookingReturnState } from "../../utils/bookingReturnState";
import "./send-otp.scss";

export default function SendOTPPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const {
    returnTo,
    selectedServices,
    selectedServicesData,
    businessName,
    rescheduleQueueUserId,
    rescheduleInitialDate,
  } = useMemo(() => {
    const fromState = {
      returnTo: (location.state?.returnTo as string) || null,
      selectedServices: (location.state?.selectedServices as string[]) || null,
      selectedServicesData: location.state?.selectedServicesData ?? null,
      businessName: (location.state?.businessName as string) || null,
      rescheduleQueueUserId: (location.state?.rescheduleQueueUserId as string) || null,
      rescheduleInitialDate: (location.state?.rescheduleInitialDate as string) || null,
    };
    if (fromState.returnTo) return fromState;
    const stored = getBookingReturnState();
    if (stored?.returnTo) {
      return {
        returnTo: stored.returnTo,
        selectedServices: stored.selectedServices || null,
        selectedServicesData: stored.selectedServicesData ?? null,
        businessName: stored.businessName || null,
        rescheduleQueueUserId: stored.rescheduleQueueUserId ?? null,
        rescheduleInitialDate: stored.rescheduleInitialDate ?? null,
      };
    }
    return fromState;
  }, [location.state]);

  useEffect(() => {
    if (returnTo && (selectedServices?.length || selectedServicesData?.length || rescheduleQueueUserId)) {
      saveBookingReturnState({
        returnTo,
        selectedServices: selectedServices || [],
        selectedServicesData: selectedServicesData || [],
        businessName: businessName || "",
        rescheduleQueueUserId: rescheduleQueueUserId ?? undefined,
        rescheduleInitialDate: rescheduleInitialDate ?? undefined,
      });
    }
  }, [returnTo, selectedServices, selectedServicesData, businessName, rescheduleQueueUserId, rescheduleInitialDate]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(e.target.value.replace(/\D/g, "").slice(0, PHONE_NUMBER_LENGTH));
    if (error) setError("");
  };

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== PHONE_NUMBER_LENGTH || !VALID_PHONE_START_DIGITS.test(digits)) {
      setError(t("enterValidPhone"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const authService = new AuthService();
      await authService.sendOTP(DEFAULT_COUNTRY_CODE, digits, ProfileType.CUSTOMER.toLowerCase());
      navigate("/verify-otp", {
        replace: true,
        state: {
          phone: `${DEFAULT_COUNTRY_CODE} ${digits.replace(/(\d{5})(\d{5})/, "$1 $2")}`,
          phoneNumber: digits,
          countryCode: DEFAULT_COUNTRY_CODE,
          returnTo,
          selectedServices,
          selectedServicesData,
          businessName,
          rescheduleQueueUserId: rescheduleQueueUserId ?? undefined,
          rescheduleInitialDate: rescheduleInitialDate ?? undefined,
        },
      });
    } catch (err: any) {
      let msg = t("failedToSendOtp");
      const code = err?.response?.data?.detail?.error_code;
      if (code) {
        switch (code) {
          case OTPErrorCode.INVALID_PHONE_FORMAT: msg = t("invalidPhoneFormat"); break;
          case OTPErrorCode.RATE_LIMIT_EXCEEDED:  msg = t("rateLimitExceeded");  break;
          case OTPErrorCode.PHONE_ALREADY_EXIST:  msg = t("phoneAlreadyExist");  break;
          case OTPErrorCode.PHONE_DOES_NOT_EXIST: msg = t("phoneDoesNotExist");  break;
          default: msg = err?.response?.data?.detail?.message || err?.customMessage || t("failedToSendOtp");
        }
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        msg = t("networkError");
      } else {
        msg = err?.customMessage || err?.response?.data?.detail?.message || t("failedToSendOtp");
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isValid = phone.length === PHONE_NUMBER_LENGTH;

  return (
    <div className="auth-wrap">

      {/* ── Trust strip ── */}
      <div className="auth-trust" aria-label="Trust indicators">
        <div className="auth-trust-item">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          {t("auth.trustSecure")}
        </div>
        <div className="auth-trust-item">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          {t("auth.trustNoPassword")}
        </div>
        <div className="auth-trust-item">
          <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {t("auth.trustFast")}
        </div>
      </div>

      {/* ── Card ── */}
      <div className="auth-card">

        {/* Band */}
        <div className="auth-band">
          <div className="auth-band-deco auth-band-deco-1" aria-hidden="true" />
          <div className="auth-band-deco auth-band-deco-2" aria-hidden="true" />
          <span className="auth-band-logo">EQ<span>.</span></span>
          <div className="auth-band-title">
            {t("auth.welcomeText")} <em>{t("auth.welcomeAccent")}</em>
          </div>
          <div className="auth-band-sub">{t("auth.signInManage")}</div>
          <div className="auth-step-dots" aria-label="Step 1 of 3">
            <div className="auth-step-dot auth-step-dot--active" />
            <div className="auth-step-dot" />
            <div className="auth-step-dot" />
          </div>
        </div>

        {/* Body */}
        <div className="auth-body auth-panel">

          {error && (
            <div className="auth-error" role="alert">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSendOTP} noValidate>
            <div className="auth-form-group">
              <label className="auth-label" htmlFor="auth-phone">{t("phoneNumber")}</label>
              <div className="auth-phone-row">
                <div className="auth-country-select" aria-label={`Country: India (${DEFAULT_COUNTRY_CODE})`}>
                  <span className="auth-country-flag" aria-hidden="true">🇮🇳</span>
                  <span>{DEFAULT_COUNTRY_CODE}</span>
                  <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
                </div>
                <input
                  id="auth-phone"
                  className={`auth-phone-input${error ? " auth-phone-input--error" : ""}`}
                  type="tel"
                  inputMode="numeric"
                  placeholder={t("enterPhoneNumber")}
                  value={phone}
                  onChange={handlePhoneChange}
                  onKeyDown={(e) => e.key === "Enter" && handleSendOTP()}
                  maxLength={PHONE_NUMBER_LENGTH}
                  autoFocus
                  autoComplete="tel-national"
                  aria-describedby="auth-phone-hint"
                  aria-invalid={!!error}
                />
              </div>
              <div className="auth-input-hint" id="auth-phone-hint">
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                {t("weWillSendCode")}
              </div>
            </div>

            <button
              className="auth-btn-primary"
              type="submit"
              disabled={!isValid || loading}
            >
              {loading ? (
                <><div className="auth-spinner" aria-hidden="true" />{t("sending")}</>
              ) : (
                <>
                  {t("auth.sendCode")}
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </>
              )}
            </button>
          </form>

          <p className="auth-terms">
            {t("auth.termsPrefix")}{" "}
            <a href="/terms">{t("auth.termsService")}</a>
            {" "}{t("auth.termsAnd")}{" "}
            <a href="/privacy">{t("auth.termsPrivacy")}</a>
          </p>

        </div>
      </div>

      {/* ── Social proof ── */}
      <div className="auth-social-proof">
        <div className="auth-proof-avatars" aria-hidden="true">
          <div className="auth-proof-avatar auth-proof-avatar--a">A</div>
          <div className="auth-proof-avatar auth-proof-avatar--b">R</div>
          <div className="auth-proof-avatar auth-proof-avatar--c">P</div>
        </div>
        <span className="auth-stars" aria-hidden="true">★★★★★</span>
        <span>{t("auth.socialProof")}</span>
      </div>

    </div>
  );
}
