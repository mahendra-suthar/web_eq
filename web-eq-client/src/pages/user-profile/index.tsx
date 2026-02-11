import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLayoutContext } from "../../layouts/general-layout";
import { RouterConstant } from "../../routers/index";
import { PhoneNumber, formatPhoneForDisplay, emailRegex } from "../../utils/utils";
import Button from "../../components/button";
import { OTPService } from "../../services/otp/otp.service";
import { useUserStore } from "../../utils/userStore";
import "./user-profile.scss";

export default function UserProfile() {
  const { t } = useLayoutContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { ROUTERS_PATH } = RouterConstant;
  const { profile, setProfile, setNextStep } = useUserStore();

  const phoneObj: PhoneNumber | undefined = location.state?.phone;
  const userType = location.state?.userType || "";

  const [fullName, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [birthdate, setBirthdate] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [errors, setErrors] = useState({
    fullName: "",
    email: "",
    birthdate: "",
    gender: ""
  });
  const [touched, setTouched] = useState({
    fullName: false,
    email: false,
    birthdate: false,
    gender: false
  });
  const phone: PhoneNumber = phoneObj || {countryCode: "+91", localNumber: ""};
  const displayPhone = formatPhoneForDisplay(phone);
  
  const otpService = new OTPService();

  const normalizeDateOfBirth = (dateOfBirth: any): string | null => {
    if (!dateOfBirth) return null;
    return typeof dateOfBirth === 'string'
      ? dateOfBirth
      : new Date(dateOfBirth).toISOString();
  };

  const validateField = (field: string, value: string) => {
    const newErrors = { ...errors };

    switch (field) {
      case "fullName":
        if (!value.trim()) {
          newErrors.fullName = t("enterFullName");
        } else if (value.length > 50) {
          newErrors.fullName = t("nameContainUpTo50");
        } else {
          newErrors.fullName = "";
        }
        break;

      case "email":
        if (value.trim() && !emailRegex.test(value)) {
          newErrors.email = t("emailInvalid");
        } else {
          newErrors.email = "";
        }
        break;

      case "birthdate":
        if (value) {
          const birthDate = new Date(value);
          const today = new Date();
          if (birthDate > today) {
            newErrors.birthdate = t("birthdateInvalid");
          } else {
            newErrors.birthdate = "";
          }
        } else {
          newErrors.birthdate = "";
        }
        break;

      case "gender":
        // Gender is optional, no validation needed
        newErrors.gender = "";
        break;
    }

    setErrors(newErrors);
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const value = field === "gender" ? gender : field === "fullName" ? fullName : field === "email" ? email : birthdate;
    validateField(field, value);
  };

  const handleInputChange = (field: string, value: string) => {
    switch (field) {
      case "fullName":
        setFullName(value);
        break;
      case "email":
        setEmail(value);
        break;
      case "birthdate":
        setBirthdate(value);
        break;
      case "gender":
        setGender(value);
        break;
    }

    if (touched[field as keyof typeof touched]) {
      validateField(field, value);
    }
  };

  const validateForm = () => {
    // Only fullName is required
    let isValid = true;
    const newErrors = { ...errors };

    // Validate fullName (required)
    if (!fullName.trim()) {
      newErrors.fullName = t("enterFullName");
      isValid = false;
    } else if (fullName.length > 50) {
      newErrors.fullName = t("nameContainUpTo50");
      isValid = false;
    } else {
      newErrors.fullName = "";
    }

    // Validate email (optional, but must be valid format if provided)
    if (email.trim() && !emailRegex.test(email)) {
      newErrors.email = t("emailInvalid");
      isValid = false;
    } else {
      newErrors.email = "";
    }

    // Validate birthdate (optional, but must be valid if provided)
    if (birthdate) {
      const birthDate = new Date(birthdate);
      const today = new Date();
      if (birthDate > today) {
        newErrors.birthdate = t("birthdateInvalid");
        isValid = false;
      } else {
        newErrors.birthdate = "";
      }
    } else {
      newErrors.birthdate = "";
    }

    // Gender is optional, no validation needed
    newErrors.gender = "";

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched({fullName: true, email: true, birthdate: true, gender: true});
    if (!validateForm()) {
      return;
    }

    if (!phoneObj || !phoneObj.localNumber) {
      setError(t("userCreationFailed"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const genderValue = gender === "male" ? 1 : gender === "female" ? 2 : null;
      const emailValue = email.trim() || null;
      const dateOfBirthValue = birthdate.trim() || null;
      
      // Use unified update endpoint for both customer and business users
      const response = await otpService.updateUserProfile(
        phoneObj.countryCode,
        phoneObj.localNumber,
        fullName.trim(),
        emailValue,
        dateOfBirthValue,
        genderValue,
        userType.toLowerCase(),
        "web"
      );

      if (response.user && profile) {
        const userData = {
          uuid: response.user.uuid,
          country_code: response.user.country_code ?? "",
          phone_number: response.user.phone_number ?? "",
          full_name: response.user.full_name ?? undefined,
          email: response.user.email ?? undefined,
          date_of_birth: normalizeDateOfBirth(response.user.date_of_birth) ?? undefined,
          gender: response.user.gender ?? undefined,
        };
        setProfile({ ...profile, user: userData });
      }

      // Navigate based on user type
      if (userType.toLowerCase() === "business") {
        setNextStep("business_registration");
        navigate(ROUTERS_PATH.BUSINESSREGISTRATION, {
          state: {
            phone: phoneObj,
            userType: userType,
          },
        });
      } else {
        setNextStep("dashboard");
        navigate(ROUTERS_PATH.DASHBOARD);
      }
    } catch (err: any) {
      let errorMessage = t("userCreationFailed");
      
      if (err?.response?.data?.detail?.message) {
        errorMessage = err.response.data.detail.message;
      } else if (err?.customMessage) {
        errorMessage = err.customMessage;
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        errorMessage = t("networkError");
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    navigate(ROUTERS_PATH.VERIFYOTP, {
      state: {
        phone: phone,
        userType: userType
      }
    });
  };

  const genderOptions = [
    { value: "male", label: t("male") },
    { value: "female", label: t("female") }
  ];

  return (
    <div className="user-profile-page">
      <div className="user-profile-header">
        <button className="back-button" onClick={handleBackClick}>
          ←
        </button>
        <div className="header-content">
          <h1 className="user-profile-title">
            {userType.toLowerCase() === "business" ? t("ownerInfo") : t("userProfile")}
          </h1>
          <p className="user-profile-subtitle">
            {userType.toLowerCase() === "business" ? t("completeOwnerInfo") : t("completeYourProfile")}
          </p>
        </div>
      </div>

      <form className="user-profile-form" onSubmit={handleSubmit}>
        <div className="user-profile-form-fields">
          {/* Full Name */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("fullName")} *</label>
            <div className={`form-field ${touched.fullName && errors.fullName ? "error" : ""}`}>
              <input
                type="text"
                placeholder={t("enterFullName")}
                value={fullName}
                onChange={(e) => handleInputChange("fullName", e.target.value)}
                onBlur={() => handleBlur("fullName")}
                maxLength={50}
              />
              {touched.fullName && errors.fullName && (
                <div className="error-text">{errors.fullName}</div>
              )}
            </div>
          </div>

          {/* Phone Number (Read-only) */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("phoneNumber")}</label>
            <div className="form-field phone-display-field">
              <input
                type="text"
                value={displayPhone}
                readOnly
                disabled
              />
            </div>
          </div>

          {/* Email */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("email")}</label>
            <div className={`form-field ${touched.email && errors.email ? "error" : ""}`}>
              <input
                type="email"
                placeholder={t("enterEmail")}
                value={email}
                onChange={(e) => handleInputChange("email", e.target.value)}
                onBlur={() => handleBlur("email")}
              />
              {touched.email && errors.email && (
                <div className="error-text">{errors.email}</div>
              )}
            </div>
          </div>

          {/* Birthdate */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("birthdate")}</label>
            <div className={`form-field ${touched.birthdate && errors.birthdate ? "error" : ""}`}>
              <input
                type="date"
                value={birthdate}
                onChange={(e) => handleInputChange("birthdate", e.target.value)}
                onBlur={() => handleBlur("birthdate")}
                max={new Date().toISOString().split('T')[0]}
              />
              {touched.birthdate && errors.birthdate && (
                <div className="error-text">{errors.birthdate}</div>
              )}
            </div>
          </div>

          {/* Gender */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("gender")}</label>
            <div className={`gender-selection ${touched.gender && errors.gender ? "error" : ""}`}>
              <div className="gender-buttons">
                {genderOptions.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`gender-button ${gender === option.value ? "selected" : ""}`}
                    onClick={() => {
                      handleInputChange("gender", option.value);
                      if (touched.gender) {
                        validateField("gender", option.value);
                      }
                    }}
                    onBlur={() => handleBlur("gender")}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {touched.gender && errors.gender && (
                <div className="error-text">{errors.gender}</div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="user-profile-form-action">
          <Button
            type="submit"
            text={t("save")}
            color="blue"
            onClick={handleSubmit}
            disabled={loading}
            loading={loading}
          />
        </div>
      </form>
    </div>
  );
}

