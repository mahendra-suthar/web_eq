import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLayoutContext } from "../../layouts/general-layout";
import { RouterConstant } from "../../routers/index";
import { OTPInput, SlotProps } from 'input-otp';
import { PhoneNumber, formatPhoneForDisplay } from "../../utils/utils";
import Button from "../../components/button";
import { OTPService } from "../../services/otp/otp.service";
import { ProfileService } from "../../services/profile/profile.service";
import { confirmFirebaseOTP, sendFirebaseOTP, clearConfirmation, clearRecaptcha } from "../../services/auth/firebase-phone";
import { useUserStore } from "../../utils/userStore";
import { OTP_COUNTDOWN_SECONDS, OTP_LENGTH } from "../../utils/constants";
import "./verify-otp.scss";

const NEXT_STEP = {
  DASHBOARD: "dashboard",
  INVITATION_CODE: "invitation_code",
  OWNER_INFO: "owner_info",
  BUSINESS_REGISTRATION: "business_registration",
} as const;

function getFirebaseVerifyError(t: (key: string) => string, err: unknown): string {
  const code = (err as any)?.code as string | undefined;
  switch (code) {
    case "auth/invalid-verification-code":
      return t("otpInvalid");
    case "auth/code-expired":
      return t("otpExpired");
    case "auth/too-many-requests":
      return t("rateLimitExceeded");
    case "auth/network-request-failed":
      return t("networkError");
    default:
      return (err as any)?.customMessage || (err as any)?.response?.data?.detail?.message || t("otpVerificationFailed");
  }
}

export default function VerifyOTP() {
  const { t } = useLayoutContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { ROUTERS_PATH } = RouterConstant;
  const { setProfile, setNextStep, setToken } = useUserStore();

  const phoneObj: PhoneNumber | undefined = location.state?.phone;
  const phone = phoneObj ? formatPhoneForDisplay(phoneObj) : "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(OTP_COUNTDOWN_SECONDS);
  const [hasReachedLimit, setHasReachedLimit] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const otpService = new OTPService();

  // Clear Firebase confirmation and reCAPTCHA state on unmount
  useEffect(() => {
    return () => {
      clearConfirmation();
      clearRecaptcha();
    };
  }, []);

  useEffect(() => {
    if (countdown === 0) return;
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleChangeNumber = () => {
    navigate(ROUTERS_PATH.SENDOTP, { state: location.state });
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    setError("");

    if (otp.length !== OTP_LENGTH) {
      setError(t("incorrectCode"));
      setLoading(false);
      return;
    }

    if (!phoneObj) {
      setError(t("otpVerificationFailed"));
      setLoading(false);
      return;
    }

    try {
      const idToken = await confirmFirebaseOTP(otp);
      const response = await otpService.verifyFirebasePhone(idToken, "web");

      if (!response.token || !response.user) {
        setError(t("otpVerificationFailed"));
        return;
      }

      const nextStepFromBackend = response.next_step ?? null;
      setNextStep(nextStepFromBackend);
      if (response.token?.access_token) {
        setToken(response.token.access_token);
      }

      const userAsOwner = {
        uuid: response.user.uuid,
        country_code: response.user.country_code ?? "",
        phone_number: response.user.phone_number ?? "",
        full_name: response.user.full_name ?? undefined,
        email: response.user.email ?? undefined,
        date_of_birth: response.user.date_of_birth
          ? String(response.user.date_of_birth).slice(0, 10)
          : undefined,
        gender: response.user.gender ?? undefined,
      };

      if (nextStepFromBackend === NEXT_STEP.DASHBOARD) {
        try {
          const profileService = new ProfileService();
          const profile = await profileService.getBusinessProfile();
          setProfile({
            profile_type: (response.profile_type as "BUSINESS" | "EMPLOYEE") ?? "BUSINESS",
            user: profile.owner,
            business: profile.business,
            address: profile.address,
            schedule: profile.schedule,
            employee: profile.employee,
          });
        } catch (_) {
          const unified = await new ProfileService().getProfile();
          setProfile(unified);
        }
        navigate(ROUTERS_PATH.DASHBOARD);
        return;
      }

      setProfile({
        profile_type: (response.profile_type as "BUSINESS" | "EMPLOYEE") ?? "BUSINESS",
        user: userAsOwner,
      });

      if (nextStepFromBackend === NEXT_STEP.INVITATION_CODE) {
        navigate(ROUTERS_PATH.INVITATION_CODE, { state: { phone: phoneObj } });
        return;
      }

      if (nextStepFromBackend === NEXT_STEP.OWNER_INFO) {
        navigate(ROUTERS_PATH.USERPROFILE, {
          state: { phone: phoneObj, userType: (response.profile_type ?? "BUSINESS").toLowerCase() },
        });
        return;
      }

      if (nextStepFromBackend === NEXT_STEP.BUSINESS_REGISTRATION) {
        navigate(ROUTERS_PATH.BUSINESSREGISTRATION, { state: { phone: phoneObj } });
        return;
      }

      navigate(ROUTERS_PATH.DASHBOARD);
    } catch (err: unknown) {
      setOtp("");
      setError(getFirebaseVerifyError(t, err));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!phoneObj) return;
    setResendLoading(true);
    setError("");

    try {
      await sendFirebaseOTP(`${phoneObj.countryCode}${phoneObj.localNumber}`);
      setCountdown(OTP_COUNTDOWN_SECONDS);
      setOtp("");
      setHasReachedLimit(false);
    } catch (err: unknown) {
      const code = (err as any)?.code as string | undefined;
      if (code === "auth/too-many-requests") {
        setError(t("rateLimitExceeded"));
        setHasReachedLimit(true);
      } else {
        setError((err as any)?.message || t("errorSendingCode"));
      }
    } finally {
      setResendLoading(false);
    }
  };

  const handleOtpChange = (value: string) => {
    if (error) setError("");
    setOtp(value.replace(/\D/g, '').slice(0, OTP_LENGTH));
  };

  useEffect(() => {
    if (!phone) navigate(ROUTERS_PATH.SENDOTP, { replace: true });
  }, [phone, navigate, ROUTERS_PATH.SENDOTP]);

  return (
    <div className="verify-otp-page">
      <div className="verify-otp-header">
        <div className="header-content">
          <h1 className="verify-otp-title">{t("verifyOtp")}</h1>
          <p className="verify-otp-subtitle">{t("otpSentToPhone")}</p>
        </div>
      </div>

      <form className="verify-otp-form">
        <div className="verify-otp-form-fields">
          <div className="phone-info-container">
            <p className="phone-display">{phone}</p>
            <button type="button" className="change-number-btn" onClick={handleChangeNumber}>
              {t("changeNumber")}
            </button>
          </div>

          <div className="otp-input-section">
            <p className="otp-info-text">{t("enterReceivedCode")}</p>
            <OTPInput
              maxLength={OTP_LENGTH}
              value={otp}
              onChange={handleOtpChange}
              containerClassName={`otp-container ${error ? 'invalid' : ''}`}
              disabled={hasReachedLimit}
              autoFocus
              render={({ slots }) => (
                <div className="otp-box">
                  {slots.map((slot, idx) => (
                    <OTPSlot key={idx} {...slot} />
                  ))}
                </div>
              )}
            />

            <div className="otp-validation-container">
              {error && <p className="error-text">{error}</p>}

              {!hasReachedLimit && (
                <div className="resend-container">
                  <button
                    type="button"
                    className={`resend-button ${countdown > 0 || resendLoading ? 'disabled' : ''}`}
                    disabled={countdown > 0 || resendLoading}
                    onClick={handleResendOtp}
                  >
                    {resendLoading ? "..." : t("sendMeAgain")}
                  </button>
                  {countdown > 0 && (
                    <p className="countdown-text">{formatTime(countdown)}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="verify-otp-form-action">
          <Button
            type="submit"
            text={t("verify")}
            color="blue"
            onClick={handleVerifyOTP}
            disabled={loading || otp.length !== OTP_LENGTH || hasReachedLimit}
            loading={loading}
          />
        </div>
      </form>
    </div>
  );
}

function OTPSlot(props: SlotProps) {
  const isFilled = props.char !== null;
  return (
    <div className={`otp-slot ${props.isActive ? 'active' : ''}`}>
      <span className={`otp-char ${isFilled ? 'filled' : 'placeholder'}`}>
        {isFilled ? props.char : '•'}
      </span>
    </div>
  );
}
