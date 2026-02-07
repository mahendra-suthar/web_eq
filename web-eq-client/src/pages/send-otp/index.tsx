import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLayoutContext } from "../../layouts/general-layout";
import { RouterConstant } from "../../routers/index";
import { PhoneNumber, formatPhoneForDisplay, validatePhoneNumber } from "../../utils/utils";
import PhoneInput from "../../components/phone-input";
import Button from "../../components/button";
import { OTPService } from "../../services/otp/otp.service";
import "./send-otp.scss";

export default function SendOTP() {
  const { t } = useLayoutContext();
  const navigate = useNavigate();
  const { ROUTERS_PATH } = RouterConstant;
  // Always use "business" user type for web-eq-client
  const userType = "Business";
  const [phone, setPhone] = useState<PhoneNumber>({
    countryCode: "+91",
    localNumber: ""
  });
  const [isPhoneValid, setIsPhoneValid] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const otpService = new OTPService();

  const countryOptions = [{
    code: "IN",
    label: "India",
    flag: "https://flagcdn.com/w20/in.png",
    value: "+91",
    dialCode: "+91"
  }];

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!isPhoneValid || !phone.localNumber) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      await otpService.sendOTP(phone.countryCode, phone.localNumber, "business");
      navigate(ROUTERS_PATH.VERIFYOTP, { state: { phone: phone, userType: "Business" } });
    } catch (err: any) {
      let errorMessage = t("errorSendingCode");
      if (err?.response?.data?.detail?.error_code) {
        const errorCode = err.response.data.detail.error_code;
        switch (errorCode) {
          case 1: // INVALID_PHONE_FORMAT
            errorMessage = t("invalidPhoneFormat");
            break;
          case 2: // RATE_LIMIT_EXCEEDED
            errorMessage = t("rateLimitExceeded");
            break;
          case 3: // PHONE_ALREADY_EXIST
            errorMessage = t("phoneAlreadyExist");
            break;
          case 4: // PHONE_DOES_NOT_EXIST
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
      setLoading(false);
    }
  };

  return (
    <div className="send-otp-page">
      <div className="welcome-header">
        <h1 className="welcome-title">{t("welcome")}</h1>
        <p className="welcome-subtitle">{t("enterPhoneToContinue")}</p>
      </div>

      <form className="send-otp-form" onSubmit={handleSendOTP}>
        <div className="send-otp-form-fields">
          {/* Phone Input */}
          <div className="phone-input-wrapper">
            <label className="phone-input-label">{t("phoneNumber")}</label>
            <PhoneInput
              phone={phone}
              countryCode={phone.countryCode}
              onPhoneChange={setPhone}
              onCountryCodeChange={(newCountryCode) => {
                setPhone({
                  countryCode: newCountryCode,
                  localNumber: phone.localNumber
                });
              }}
              countryOptions={countryOptions}
              onValidChange={setIsPhoneValid}
              t={t}
            />
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="send-otp-form-action">
          <Button
            type="submit"
            text={t("sendOtp")}
            color="blue"
            onClick={handleSendOTP}
            disabled={!isPhoneValid || loading}
            loading={loading}
          />
        </div>
      </form>
    </div>
  );
}
