import React from "react";
import { PhoneNumber, validatePhoneNumber, getCountryInfo } from "../../utils/utils";
import "./phone-input.scss";

export interface CountryOption {
  code: string;
  label: string;
  value: string;
  flag: string;
  dialCode: string;
}

interface Props {
  phone: PhoneNumber;
  countryCode: string;
  onPhoneChange: (phone: PhoneNumber) => void;
  onCountryCodeChange: (value: string) => void;
  countryOptions?: CountryOption[];
  onValidChange?: (isValid: boolean) => void;
  placeholder?: string;
  t?: (key: string) => string;
}

const PhoneInput: React.FC<Props> = ({
  phone,
  countryCode,
  onPhoneChange,
  onCountryCodeChange,
  countryOptions = [{
    code: "IN",
    label: "India",
    flag: "https://flagcdn.com/w20/in.png",
    value: "+91",
    dialCode: "+91"
  }],
  onValidChange,
  placeholder,
  t
}) => {
  const handlePhoneInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const prefix = countryCode + " ";
    
    // Remove prefix and extract digits
    const withoutPrefix = value.startsWith(prefix) 
      ? value.slice(prefix.length) 
      : value;
    const digits = withoutPrefix.replace(/\D/g, "");
    
    // Get country info for max length (India: 10 digits)
    const countryInfo = getCountryInfo(countryCode);
    const limitedDigits = digits.slice(0, countryInfo.maxLength);
    
    const newPhone: PhoneNumber = {
      countryCode: countryCode,
      localNumber: limitedDigits
    };
    
    onPhoneChange(newPhone);
    onValidChange?.(validatePhoneNumber(newPhone));
  };

  const countryInfo = getCountryInfo(countryCode);
  const maxLength = countryCode.length + 1 + countryInfo.maxLength;

  return (
    <div className="phone-input-container">
      <div className="phone-field form-field">
        <input
          value={countryCode + " " + phone.localNumber}
          onChange={handlePhoneInputChange}
          placeholder={placeholder || (t ? t("enterPhoneNumber") : "Enter your phone number")}
          maxLength={maxLength}
        />
      </div>
    </div>
  );
};

export default PhoneInput;
