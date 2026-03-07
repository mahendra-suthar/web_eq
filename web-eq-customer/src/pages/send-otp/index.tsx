import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthService } from "../../services/auth/auth.service";
import { PHONE_NUMBER_LENGTH, DEFAULT_COUNTRY_CODE, VALID_PHONE_START_DIGITS, OTPErrorCode, ProfileType } from "../../utils/constants";
import { saveBookingReturnState, getBookingReturnState } from "../../utils/bookingReturnState";
import Button from "../../components/button";
import "./send-otp.scss";

export default function SendOTPPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

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

  const validatePhone = (phoneNumber: string): boolean => {
    const digits = phoneNumber.replace(/\D/g, "");
    return digits.length === PHONE_NUMBER_LENGTH && VALID_PHONE_START_DIGITS.test(digits);
  };

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!phone || !validatePhone(phone)) {
      setError(t("enterValidPhone"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const authService = new AuthService();
      await authService.sendOTP(DEFAULT_COUNTRY_CODE, phone, ProfileType.CUSTOMER.toLowerCase());
      
      navigate("/verify-otp", {
        replace: true,
        state: {
          phone: `${DEFAULT_COUNTRY_CODE} ${phone.replace(/\D/g, "")}`,
          phoneNumber: phone.replace(/\D/g, ""),
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
      let errorMessage = t("failedToSendOtp");
      
      if (err?.response?.data?.detail?.error_code) {
        const errorCode = err.response.data.detail.error_code;
        switch (errorCode) {
          case OTPErrorCode.INVALID_PHONE_FORMAT:
            errorMessage = t("invalidPhoneFormat");
            break;
          case OTPErrorCode.RATE_LIMIT_EXCEEDED:
            errorMessage = t("rateLimitExceeded");
            break;
          case OTPErrorCode.PHONE_ALREADY_EXIST:
            errorMessage = t("phoneAlreadyExist");
            break;
          case OTPErrorCode.PHONE_DOES_NOT_EXIST:
            errorMessage = t("phoneDoesNotExist");
            break;
          default:
            errorMessage = err?.response?.data?.detail?.message || err?.customMessage || t("failedToSendOtp");
        }
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        errorMessage = t("networkError");
      } else {
        errorMessage = err?.customMessage || err?.response?.data?.detail?.message || t("failedToSendOtp");
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, PHONE_NUMBER_LENGTH);
    setPhone(value);
    if (error) setError("");
  };

  return (
    <div className="send-otp-page">
      <div className="welcome-header">
        <h1 className="welcome-title">{t("welcome")}</h1>
        <p className="welcome-subtitle">{t("enterPhoneToContinue")}</p>
      </div>

      <form className="send-otp-form" onSubmit={handleSendOTP}>
        <div className="send-otp-form-fields">
          <div className="phone-input-wrapper">
            <label className="phone-input-label">{t("phoneNumber")}</label>
            <div className="form-field">
              <input
                type="tel"
                placeholder={t("enterPhoneNumber")}
                value={phone}
                onChange={handlePhoneChange}
                maxLength={PHONE_NUMBER_LENGTH}
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            {!error && (
              <p className="send-otp-hint">
                {t("weWillSendCode")}
              </p>
            )}
          </div>
        </div>

        <div className="send-otp-form-action">
          <Button
            text={loading ? t("sending") : t("sendOtp")}
            color="blue"
            size="lg"
            onClick={handleSendOTP}
            disabled={!phone || phone.length !== PHONE_NUMBER_LENGTH || loading}
            loading={loading}
            type="submit"
          />
        </div>

        <div className="send-otp-back-wrap">
          <button
            type="button"
            className="send-otp-back-btn"
            onClick={() => navigate(returnTo || "/")}
          >
            {t("back")} {returnTo ? t("backToPreviousPage") : t("backToHome")}
          </button>
        </div>
      </form>
    </div>
  );
}
