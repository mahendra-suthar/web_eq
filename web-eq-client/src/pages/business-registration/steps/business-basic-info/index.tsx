import React, { useState, useEffect } from "react";
import { useLayoutContext } from "../../../../layouts/general-layout";
import Button from "../../../../components/button";
import { BusinessService, Category } from "../../../../services/business/business.service";
import { emailRegex } from "../../../../utils/utils";
import { useUserStore } from "../../../../utils/userStore";
import "./business-basic-info.scss";

interface BusinessBasicInfoProps {
  onNext: (data: {
    business_id?: string;
    business_name: string;
    business_email: string;
    about_business?: string;
    category_id: string;
    profile_picture?: File;
  }) => void;
  onBack?: () => void;
  initialData?: any;
}

export default function BusinessBasicInfo({
  onNext,
  onBack,
  initialData,
}: BusinessBasicInfoProps) {
  const { t } = useLayoutContext();
  const businessService = new BusinessService();
  const { userInfo } = useUserStore();

  const [businessName, setBusinessName] = useState<string>(initialData?.business_name || "");
  const [businessEmail, setBusinessEmail] = useState<string>(initialData?.business_email || "");
  const [aboutBusiness, setAboutBusiness] = useState<string>(initialData?.about_business || "");
  const [categoryId, setCategoryId] = useState<string>(initialData?.category_id || "");
  const [profilePicture, setProfilePicture] = useState<File | undefined>(initialData?.profile_picture);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string>("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [errors, setErrors] = useState<{
    business_name?: string;
    business_email?: string;
    category_id?: string;
    profile_picture?: string;
  }>({});

  const [touched, setTouched] = useState<{
    business_name: boolean;
    business_email: boolean;
    category_id: boolean;
  }>({
    business_name: false,
    business_email: false,
    category_id: false,
  });

  useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true);
      try {
        const cats = await businessService.getCategories();
        setCategories(cats);
      } catch (error) {
        console.error("Failed to fetch categories:", error);
      } finally {
        setLoadingCategories(false);
      }
    };
    fetchCategories();
  }, []);

  const validateField = (field: string, value: any): boolean => {
    const newErrors = { ...errors };

    switch (field) {
      case "business_name":
        if (!value || !value.trim()) {
          newErrors.business_name = t("enterBusinessName");
        } else if (value.length > 100) {
          newErrors.business_name = t("nameTooLong");
        } else {
          delete newErrors.business_name;
        }
        break;

      case "business_email":
        if (!value || !value.trim()) {
          newErrors.business_email = t("enterEmail");
        } else if (!emailRegex.test(value)) {
          newErrors.business_email = t("emailInvalid");
        } else {
          delete newErrors.business_email;
        }
        break;

      case "category_id":
        if (!value) {
          newErrors.category_id = t("selectCategory");
        } else {
          delete newErrors.category_id;
        }
        break;

      case "profile_picture":
        if (value) {
          const validTypes = ["image/jpeg", "image/jpg", "image/png"];
          const maxSize = 5 * 1024 * 1024; // 5MB

          if (!validTypes.includes(value.type)) {
            newErrors.profile_picture = t("invalidImageType");
          } else if (value.size > maxSize) {
            newErrors.profile_picture = t("imageTooLarge");
          } else {
            delete newErrors.profile_picture;
          }
        }
        break;
    }

    setErrors(newErrors);
    return !newErrors[field as keyof typeof newErrors];
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const value =
      field === "business_name"
        ? businessName
        : field === "business_email"
        ? businessEmail
        : categoryId;
    validateField(field, value);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (validateField("profile_picture", file)) {
        setProfilePicture(file);
        const reader = new FileReader();
        reader.onloadend = () => {
          setProfilePicturePreview(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Mark all fields as touched
    setTouched({
      business_name: true,
      business_email: true,
      category_id: true,
    });

    // Validate all fields
    const isValid =
      validateField("business_name", businessName) &&
      validateField("business_email", businessEmail) &&
      validateField("category_id", categoryId) &&
      (!profilePicture || validateField("profile_picture", profilePicture));

    if (!isValid) {
      return;
    }

    if (!userInfo?.uuid || !userInfo?.phone_number || !userInfo?.country_code) {
      setError(t("userCreationFailed"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      const profilePictureUrl = profilePicture ? undefined : undefined;

      const businessData = await businessService.createBusinessBasicInfo({
        name: businessName.trim(),
        email: businessEmail.trim().toLowerCase() || undefined,
        about_business: aboutBusiness.trim() || undefined,
        category_id: categoryId,
        profile_picture: profilePictureUrl,
        owner_id: userInfo.uuid,
        phone_number: userInfo.phone_number,
        country_code: userInfo.country_code,
      });

      onNext({
        business_id: businessData.uuid, // Pass business_id to parent
        business_name: businessData.name,
        business_email: businessData.email || "",
        about_business: businessData.about_business || undefined,
        category_id: businessData.category_id,
        profile_picture: profilePicture, // Keep file reference for potential future upload
      });
    } catch (err: any) {
      let errorMessage = t("businessRegistrationFailed");
      
      if (err?.errorCode === "BUSINESS_ALREADY_EXISTS") {
        errorMessage = t("businessAlreadyRegistered");
      } else if (err?.errorCode === "OWNER_NOT_FOUND") {
        errorMessage = t("userCreationFailed");
      } else if (err?.message) {
        errorMessage = err.message;
      } else if (err?.response?.data?.detail?.message) {
        errorMessage = err.response.data.detail.message;
      } else if (err?.code === "ERR_NETWORK" || !err?.response) {
        errorMessage = t("networkError");
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="business-basic-info-page">
      <div className="business-basic-info-header">
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ←
          </button>
        )}
        <div className="header-content">
          <h1 className="business-basic-info-title">{t("businessBasicInfo")}</h1>
          <p className="business-basic-info-subtitle">{t("enterBusinessDetails")}</p>
        </div>
      </div>

      <form className="business-basic-info-form" onSubmit={handleSubmit}>
        <div className="business-basic-info-form-fields">
          {/* Business Name */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("businessName")} *</label>
            <div className={`form-field ${touched.business_name && errors.business_name ? "error" : ""}`}>
              <input
                type="text"
                placeholder={t("enterBusinessName")}
                value={businessName}
                onChange={(e) => {
                  setBusinessName(e.target.value);
                  if (touched.business_name) {
                    validateField("business_name", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("business_name")}
                maxLength={100}
              />
              {touched.business_name && errors.business_name && (
                <div className="error-text">{errors.business_name}</div>
              )}
            </div>
          </div>

          {/* Business Email */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("businessEmail")} *</label>
            <div className={`form-field ${touched.business_email && errors.business_email ? "error" : ""}`}>
              <input
                type="email"
                placeholder={t("enterBusinessEmail")}
                value={businessEmail}
                onChange={(e) => {
                  setBusinessEmail(e.target.value);
                  if (touched.business_email) {
                    validateField("business_email", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("business_email")}
              />
              {touched.business_email && errors.business_email && (
                <div className="error-text">{errors.business_email}</div>
              )}
            </div>
          </div>

          {/* About Business */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("aboutBusiness")}</label>
            <div className="form-field">
              <textarea
                placeholder={t("enterAboutBusiness")}
                value={aboutBusiness}
                onChange={(e) => setAboutBusiness(e.target.value)}
                rows={4}
                maxLength={500}
              />
            </div>
          </div>

          {/* Category */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("category")} *</label>
            <div className={`form-field ${touched.category_id && errors.category_id ? "error" : ""}`}>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  if (touched.category_id) {
                    validateField("category_id", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("category_id")}
                disabled={loadingCategories}
              >
                <option value="">{loadingCategories ? t("loading") : t("selectCategory")}</option>
                {categories.map((category) => (
                  <option key={category.uuid} value={category.uuid}>
                    {category.name}
                  </option>
                ))}
              </select>
              {touched.category_id && errors.category_id && (
                <div className="error-text">{errors.category_id}</div>
              )}
            </div>
          </div>

          {/* Profile Picture */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("businessProfilePicture")}</label>
            <div className="form-field">
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={handleImageChange}
                className="file-input"
              />
              {errors.profile_picture && (
                <div className="error-text">{errors.profile_picture}</div>
              )}
              {profilePicturePreview && (
                <div className="image-preview">
                  <img src={profilePicturePreview} alt="Preview" />
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="error-message" style={{ marginBottom: "1rem", color: "red" }}>
            {error}
          </div>
        )}

        <div className="business-basic-info-form-action">
          {onBack && (
            <Button
              type="button"
              text={t("back")}
              color="transparent"
              onClick={onBack}
              className="back-button-action"
            />
          )}
          <Button
            type="submit"
            text={t("next")}
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
