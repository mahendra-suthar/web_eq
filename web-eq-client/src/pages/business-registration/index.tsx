import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { useLayoutContext } from "../../layouts/general-layout";
import { RouterConstant } from "../../routers/index";
import { PhoneNumber } from "../../utils/utils";
import {
  useBusinessRegistrationStore,
  QueueData,
} from "../../utils/businessRegistrationStore";
import { ProfileService } from "../../services/profile/profile.service";
import BusinessBasicInfo from "./steps/business-basic-info";
import BusinessSchedule from "./steps/business-schedule";
import BusinessLocation from "./steps/business-location";
import BusinessEmployees from "./steps/business-employees";
import BusinessQueueSetup from "./steps/business-queue-setup";
import "./business-registration.scss";

const TOTAL_STEPS = 5;

export default function BusinessRegistration() {
  const { t } = useLayoutContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { ROUTERS_PATH } = RouterConstant;

  const phoneObj: PhoneNumber | undefined = location.state?.phone;
  const userType = location.state?.userType || "";
  const nextStepFromState = location.state?.nextStep as number | undefined;
  const businessIdFromState = location.state?.businessId as string | undefined;
  const categoryIdFromState = location.state?.categoryId as string | undefined;

  const {
    currentStep,
    businessId,
    registrationData,
    setStep,
    setBusinessId,
    updateRegistrationData,
    resetRegistration
  } = useBusinessRegistrationStore();

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (nextStepFromState && nextStepFromState >= 1 && nextStepFromState <= TOTAL_STEPS) {
      setStep(nextStepFromState);
    }
    if (businessIdFromState) {
      setBusinessId(businessIdFromState);
    }
    if (categoryIdFromState && !registrationData.category_id) {
      updateRegistrationData({ category_id: categoryIdFromState });
    }
  }, [nextStepFromState, businessIdFromState, categoryIdFromState, setStep, setBusinessId, registrationData.category_id, updateRegistrationData]);

  useEffect(() => {
    const fetchCategoryId = async () => {
      const currentBusinessId = businessId || businessIdFromState;
      const hasCategoryId = registrationData.category_id;
      
      if (currentBusinessId && !hasCategoryId && currentStep === 5) {
        try {
          const profileService = new ProfileService();
          const profile = await profileService.getProfile();
          
          if (profile.profile_type === "BUSINESS" && profile.business?.category_id) {
            updateRegistrationData({ category_id: profile.business.category_id });
          }
        } catch (error) {
          console.error("Failed to fetch category_id from profile:", error);
        }
      }
    };

    // Only fetch if category_id is still missing after trying location state
    if (currentStep === 5 && !registrationData.category_id) {
      fetchCategoryId();
    }
  }, [currentStep, businessId, businessIdFromState, registrationData.category_id, updateRegistrationData]);



  const handleNext = (stepData: any) => {
    if (stepData.business_id) {
      setBusinessId(stepData.business_id);
    }

    updateRegistrationData(stepData);

    if (currentStep < TOTAL_STEPS) {
      setStep(currentStep + 1);
      setError("");
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setStep(currentStep - 1);
      setError("");
    } else {
      navigate(ROUTERS_PATH.VERIFYOTP, {
        state: {
          phone: phoneObj,
          userType: userType,
        },
      });
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError("");

    try {
      if (businessId) {
        toast.success("Business registered successfully!");
        resetRegistration();
        navigate(ROUTERS_PATH.DASHBOARD);
      } else {
        toast.error("Business ID is missing. Please try again.");
        setError(t("businessRegistrationFailed"));
      }
    } catch (err: any) {
      setError(err?.message || t("businessRegistrationFailed"));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <BusinessBasicInfo
            onNext={handleNext}
            onBack={handleBack}
            initialData={registrationData}
          />
        );
      case 2:
        return (
          <BusinessSchedule
            onNext={handleNext}
            onBack={handleBack}
            businessId={businessId}
            initialData={registrationData.schedule && registrationData.schedule.length > 0 ? {
              is_always_open: registrationData.is_always_open || false,
              schedule: registrationData.schedule,
            } : undefined}
          />
        );
      case 3:
        return (
          <BusinessLocation
            onNext={handleNext}
            onBack={handleBack}
            initialData={registrationData.address}
            businessId={businessId}
          />
        );
      case 4:
        return (
          <BusinessEmployees
            onNext={handleNext}
            onBack={handleBack}
            initialData={registrationData.employees || []}
            businessId={businessId}
          />
        );
      case 5:
        return (
          <BusinessQueueSetup
            onNext={(queueData: QueueData) => {
              updateRegistrationData({ queue: queueData });
              handleSubmit();
            }}
            onBack={handleBack}
            employees={
              registrationData.employees?.map((emp) => ({
                id: emp.uuid || "",
                full_name: emp.full_name,
              })) || []
            }
            businessId={businessId}
            categoryId={registrationData.category_id}
            initialData={registrationData.queue}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="business-registration-page">
      <div className="progress-indicator">
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${(currentStep / TOTAL_STEPS) * 100}%` }}
          />
        </div>
        <p className="progress-text">
          {t("step")} {currentStep} {t("of")} {TOTAL_STEPS}
        </p>
      </div>

      {error && <div className="error-message">{error}</div>}

      {loading && (
        <div className="loading-overlay">
          <p>{t("submitting")}...</p>
        </div>
      )}

      <div className="step-content">
        {renderStep()}
      </div>
      <ToastContainer position="top-right" autoClose={3000} />
    </div>
  );
}
