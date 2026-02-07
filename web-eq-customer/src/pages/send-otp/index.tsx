import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthService } from "../../services/auth/auth.service";
import { PHONE_NUMBER_LENGTH, DEFAULT_COUNTRY_CODE, VALID_PHONE_START_DIGITS, OTPErrorCode, ProfileType } from "../../utils/constants";
import Button from "../../components/button";
import "./send-otp.scss";

export default function SendOTPPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [phone, setPhone] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const returnTo = (location.state?.returnTo as string) || null;
  const selectedServices = (location.state?.selectedServices as string[]) || null;
  const businessName = (location.state?.businessName as string) || null;

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
        state: { 
          phone: `${DEFAULT_COUNTRY_CODE} ${phone.replace(/\D/g, "")}`,
          phoneNumber: phone.replace(/\D/g, ""),
          countryCode: DEFAULT_COUNTRY_CODE,
          returnTo,
          selectedServices,
          businessName,
        } 
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
              <p style={{ color: "#637381", fontSize: "14px", margin: "8px 0 0 0" }}>
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

        <div style={{ textAlign: "center", marginTop: "16px" }}>
          <button
            type="button"
            onClick={() => navigate(returnTo || "/")}
            style={{
              background: "none",
              border: "none",
              color: "#00695C",
              cursor: "pointer",
              fontSize: "14px",
              textDecoration: "underline",
              fontFamily: '"Noto Sans Hebrew", serif',
            }}
          >
            {t("back")} {returnTo ? t("backToPreviousPage") : t("backToHome")}
          </button>
        </div>
      </form>
    </div>
  );
}
