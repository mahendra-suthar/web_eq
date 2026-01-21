import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLayoutContext } from "../../layouts/general-layout";
import { RouterConstant } from "../../routers/index";
import { OTPInput, SlotProps } from 'input-otp';
import { PhoneNumber, formatPhoneForDisplay } from "../../utils/utils";
import Button from "../../components/button";
import { OTPService } from "../../services/otp/otp.service";
import { ProfileService } from "../../services/profile/profile.service";
import { useUserStore } from "../../utils/userStore";
import "./verify-otp.scss";

export default function VerifyOTP() {
  const { t } = useLayoutContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { ROUTERS_PATH } = RouterConstant;
  const { setUserInfo } = useUserStore();

  const phoneObj: PhoneNumber | undefined = location.state?.phone;
  const userType = location.state?.userType || "";

  const phone = phoneObj ? formatPhoneForDisplay(phoneObj) : "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(300);
  const [hasReachedLimit, setHasReachedLimit] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const otpService = new OTPService();

  useEffect(() => {
    if (countdown === 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatTime = (seconds: number) => {
    const m = String(Math.floor(seconds / 60)).padStart(2, '0');
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleBackClick = () => {
    navigate(ROUTERS_PATH.SENDOTP);
  };

  const handleVerifyOTP = async () => {
    setLoading(true);
    setError("");

    if (otp.length !== 5) {
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
      const userTypeLower = userType.toLowerCase();
      const response = await otpService.verifyOTP(
        phoneObj.countryCode, phoneObj.localNumber, otp, userTypeLower, "web"
      );

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
        if (!userData.full_name || userData.full_name.trim() === "") {
          navigate(ROUTERS_PATH.USERPROFILE, { state: { phone: phoneObj, userType } });
          return;
        }

        try {
          const profileService = new ProfileService();
          const profile = await profileService.getProfile();
          const isBusinessUser = profile.profile_type === "BUSINESS" || userTypeLower === "business";
          if (isBusinessUser) {
            if (!profile.business) {
              navigate(ROUTERS_PATH.BUSINESSREGISTRATION, {
                state: {
                  phone: phoneObj,
                  userType: userType || "business",
                  nextStep: 1,
                },
              });
              return;
            }
            
            const currentStep = profile.business.current_step;
            const businessStatus = Number(profile.business.status);
            if (businessStatus === 1) {
              navigate(ROUTERS_PATH.DASHBOARD);
              return;
            }
            
            const nextStep = currentStep ? Math.min(Math.max(currentStep + 1, 1), 5) : 1;
            navigate(ROUTERS_PATH.BUSINESSREGISTRATION, {
              state: {
                phone: phoneObj,
                userType: userType || "business",
                businessId: profile.business.uuid,
                nextStep: nextStep,
                categoryId: profile.business.category_id,
              },
            });
            return;
          }
        } catch (profileError) {
          if (userTypeLower === "business") {
            navigate(ROUTERS_PATH.BUSINESSREGISTRATION, {
              state: {
                phone: phoneObj,
                userType: userType || "business",
                nextStep: 1,
              },
            });
            return;
          }
        }

        navigate(ROUTERS_PATH.DASHBOARD);
      }
    } catch (err: any) {
      setOtp("");
      let errorMessage = t("otpVerificationFailed");

      if (err?.response?.data?.detail?.error_code) {
        const errorCode = err.response.data.detail.error_code;
        switch (errorCode) {
          case 1:
            errorMessage = t("otpNotFound");
            break;
          case 2:
            errorMessage = t("otpExpired");
            break;
          case 3:
            errorMessage = t("otpInvalid");
            break;
          case 4:
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

  const handleResendOtp = async () => {
    if (!phoneObj) {
      return;
    }

    setResendLoading(true);
    setError("");

    try {
      const userTypeLower = userType.toLowerCase();
      await otpService.sendOTP(
        phoneObj.countryCode,
        phoneObj.localNumber,
        userTypeLower
      );

      setCountdown(300);
      setOtp("");
      setHasReachedLimit(false);
    } catch (err: any) {
      let errorMessage = t("errorSendingCode");

      if (err?.response?.data?.detail?.error_code) {
        const errorCode = err.response.data.detail.error_code;
        switch (errorCode) {
          case 1:
            errorMessage = t("invalidPhoneFormat");
            break;
          case 2:
            errorMessage = t("rateLimitExceeded");
            setHasReachedLimit(true);
            break;
          case 3:
            errorMessage = t("phoneAlreadyExist");
            break;
          case 4:
            errorMessage = t("phoneDoesNotExist");
            break;
          default:
            errorMessage = err?.response?.data?.detail?.message || err?.customMessage || t("errorSendingCode");
        }
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        errorMessage = t("networkError");
      } else {
        errorMessage = err?.customMessage || err?.response?.data?.detail?.message || t("errorSendingCode");
      }

      setError(errorMessage);
    } finally {
      setResendLoading(false);
    }
  };

  const handleOtpChange = (value: string) => {
    if (error) {
      setError("");
    }
    const numericValue = value.replace(/\D/g, '').slice(0, 5);
    setOtp(numericValue);
  };

  useEffect(() => {
    if (!phone) {
      navigate(ROUTERS_PATH.SENDOTP, { replace: true });
    }
  }, [phone, navigate, ROUTERS_PATH.SENDOTP]);

  return (
    <div className="verify-otp-page">
      <div className="verify-otp-header">
        <button className="back-button" onClick={handleBackClick}>
          ←
        </button>
        <div className="header-content">
          <h1 className="verify-otp-title">{t("verifyOtp")}</h1>
          <p className="verify-otp-subtitle">{t("otpSentToPhone")}</p>
        </div>
      </div>

      <form className="verify-otp-form">
        <div className="verify-otp-form-fields">
          <div className="phone-info-container">
            <p className="phone-display">{phone}</p>
          </div>

          <div className="otp-input-section">
            <p className="otp-info-text">{t("enterReceivedCode")}</p>
            <OTPInput
              maxLength={5}
              value={otp}
              onChange={handleOtpChange}
              containerClassName={`otp-container ${error ? 'invalid' : ''}`}
              disabled={hasReachedLimit}
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
            disabled={loading || otp.length !== 5 || hasReachedLimit}
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

