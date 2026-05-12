import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLayoutContext } from "../../layouts/general-layout";
import { RouterConstant } from "../../routers/index";
import { PhoneNumber, validatePhoneNumber } from "../../utils/utils";
import PhoneInput from "../../components/phone-input";
import Button from "../../components/button";
import { sendFirebaseOTP } from "../../services/auth/firebase-phone";
import { DEFAULT_COUNTRY_CODE } from "../../utils/constants";
import "./send-otp.scss";

function getFirebaseSendError(t: (key: string) => string, err: unknown): string {
  const code = (err as any)?.code as string | undefined;
  switch (code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return t("invalidPhoneFormat");
    case "auth/too-many-requests":
      return t("rateLimitExceeded");
    case "auth/network-request-failed":
      return t("networkError");
    case "auth/quota-exceeded":
      return t("rateLimitExceeded");
    default:
      return (err as any)?.message || t("errorSendingCode");
  }
}

export default function SendOTP() {
  const { t } = useLayoutContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { ROUTERS_PATH } = RouterConstant;
  const prefilled = location.state?.phone as PhoneNumber | undefined;
  const [phone, setPhone] = useState<PhoneNumber>({
    countryCode: prefilled?.countryCode ?? DEFAULT_COUNTRY_CODE,
    localNumber: prefilled?.localNumber ?? "",
  });
  const [isPhoneValid, setIsPhoneValid] = useState<boolean>(
    prefilled ? validatePhoneNumber(prefilled) : false
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const countryOptions = [{
    code: "IN",
    label: "India",
    flag: "https://flagcdn.com/w20/in.png",
    value: "+91",
    dialCode: "+91"
  }];

  const handleSendOTP = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!isPhoneValid || !phone.localNumber) return;

    setLoading(true);
    setError("");

    try {
      await sendFirebaseOTP(`${phone.countryCode}${phone.localNumber}`);
      navigate(ROUTERS_PATH.VERIFYOTP, { state: { phone, userType: "Business" } });
    } catch (err: unknown) {
      setError(getFirebaseSendError(t, err));
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
          <div className="phone-input-wrapper">
            <label className="phone-input-label">{t("phoneNumber")}</label>
            <PhoneInput
              phone={phone}
              countryCode={phone.countryCode}
              onPhoneChange={setPhone}
              onCountryCodeChange={(newCountryCode) => {
                setPhone({ countryCode: newCountryCode, localNumber: phone.localNumber });
              }}
              countryOptions={countryOptions}
              onValidChange={setIsPhoneValid}
              t={t}
            />
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

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
