import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthService } from "../../services/auth/auth.service";
import { useAuthStore } from "../../store/auth.store";
import { OTP_COUNTDOWN_SECONDS, OTP_LENGTH, OTPErrorCode, ProfileType, DEFAULT_COUNTRY_CODE } from "../../utils/constants";
import Button from "../../components/button";
import "./verify-otp.scss";

export default function VerifyOTPPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { setUserInfo } = useAuthStore();
  
  const phone = (location.state?.phone as string) || "";
  const phoneNumber = (location.state?.phoneNumber as string) || "";
  const countryCode = (location.state?.countryCode as string) || DEFAULT_COUNTRY_CODE;
  const returnTo = (location.state?.returnTo as string) || null;
  const selectedServices = (location.state?.selectedServices as string[]) || null;
  const businessName = (location.state?.businessName as string) || null;

  const [otp, setOtp] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(OTP_COUNTDOWN_SECONDS);
  const [resendLoading, setResendLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!phone || !phoneNumber) {
      navigate("/send-otp", { replace: true });
    }
  }, [phone, phoneNumber, navigate]);

  useEffect(() => {
    if (countdown === 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, "0");
    const s = String(seconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleVerifyOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (otp.length !== OTP_LENGTH) {
      setError(t("enter5DigitOtp"));
      return;
    }

    if (!phoneNumber) {
      setError(t("phoneNumberRequired"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const authService = new AuthService();
      const response = await authService.verifyOTP(countryCode, phoneNumber, otp, ProfileType.CUSTOMER.toLowerCase(), "web");

      if (response.token && response.user) {
        const userData = {
          ...response.user,
          date_of_birth: response.user.date_of_birth
            ? (typeof response.user.date_of_birth === 'string'
              ? response.user.date_of_birth
              : new Date(response.user.date_of_birth).toISOString())
            : null,
        };
        setUserInfo(userData);

        if (returnTo) {
          navigate(returnTo, {
            state: {selectedServices, businessName},
          });
        } else {
          navigate("/");
        }
      } else {
        setError(t("invalidResponse"));
      }
    } catch (err: any) {
      setOtp("");
      let errorMessage = t("otpVerificationFailed");

      if (err?.response?.data?.detail?.error_code) {
        const errorCode = err.response.data.detail.error_code;
        switch (errorCode) {
          case OTPErrorCode.OTP_NOT_FOUND:
            errorMessage = t("otpNotFound");
            break;
          case OTPErrorCode.OTP_EXPIRED:
            errorMessage = t("otpExpired");
            break;
          case OTPErrorCode.OTP_INVALID:
            errorMessage = t("otpInvalid");
            break;
          case OTPErrorCode.OTP_ALREADY_USED:
            errorMessage = t("otpAlreadyUsed");
            break;
          default:
            errorMessage = err?.response?.data?.detail?.message || err?.customMessage || t("otpVerificationFailed");
        }
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        errorMessage = t("networkError");
      } else {
        errorMessage = err?.customMessage || err?.response?.data?.detail?.message || t("otpVerificationFailed");
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!phoneNumber) return;
    
    setResendLoading(true);
    setError("");

    try {
      const authService = new AuthService();
      await authService.sendOTP(countryCode, phoneNumber, ProfileType.CUSTOMER.toLowerCase());
      setCountdown(OTP_COUNTDOWN_SECONDS);
      setOtp("");
      alert(t("otpSentSuccessfully"));
    } catch (err: any) {
      let errorMessage = t("failedToSendOtp");
      if (err?.response?.data?.detail?.message) {
        errorMessage = err.response.data.detail.message;
      } else if (err?.customMessage) {
        errorMessage = err.customMessage;
      }
      setError(errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setOtp(value);
    if (error) setError("");
  };

  if (!phone || !phoneNumber) {
    return null;
  }

  return (
    <div className="verify-otp-page">
      <div className="verify-otp-header">
        <button className="back-button" onClick={() => navigate("/send-otp", { state: { returnTo, selectedServices, businessName } })}>
          ←
        </button>
        <div className="header-content">
          <h1 className="verify-otp-title">{t("verifyOtp")}</h1>
          <p className="verify-otp-subtitle">{t("otpSentToPhone")}</p>
        </div>
      </div>

      <form className="verify-otp-form" onSubmit={handleVerifyOTP}>
        <div className="verify-otp-form-fields">
          <div className="phone-info-container">
            <p className="phone-display">{phone}</p>
          </div>

          <div className="otp-input-section">
            <p className="otp-info-text">{t("enterReceivedCode")}</p>
            <div className={`otp-container ${error ? "invalid" : ""}`} style={{ position: "relative" }}>
              <input
                type="text"
                value={otp}
                onChange={handleOtpChange}
                maxLength={OTP_LENGTH}
                style={{
                  position: "absolute",
                  opacity: 0,
                  pointerEvents: "auto",
                  width: "100%",
                  height: "100%",
                  top: 0,
                  left: 0,
                  border: "none",
                  background: "transparent",
                  fontSize: "1px",
                  color: "transparent",
                  zIndex: 10,
                }}
                autoFocus
              />
              <div className="otp-box">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div key={idx} className={`otp-slot ${idx === otp.length ? "active" : ""}`}>
                    <span className={`otp-char ${otp[idx] ? "filled" : "placeholder"}`}>
                      {otp[idx] || "•"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="otp-validation-container">
              {error && <p className="error-text">{error}</p>}

              {countdown > 0 ? (
                <div className="resend-container">
                  <button
                    type="button"
                    className="resend-button disabled"
                    disabled
                  >
                    {t("sendMeAgain")}
                  </button>
                  <p className="countdown-text">{formatTime(countdown)}</p>
                </div>
              ) : (
                <button
                  type="button"
                  className={`resend-button ${resendLoading ? "disabled" : ""}`}
                  disabled={resendLoading}
                  onClick={handleResendOTP}
                >
                  {resendLoading ? t("sending") : t("sendMeAgain")}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="verify-otp-form-action">
          <Button
            text={loading ? t("verifying") : t("verify")}
            color="blue"
            size="lg"
            onClick={handleVerifyOTP}
            disabled={otp.length !== OTP_LENGTH || loading}
            loading={loading}
            type="submit"
          />
        </div>
      </form>
    </div>
  );
}
