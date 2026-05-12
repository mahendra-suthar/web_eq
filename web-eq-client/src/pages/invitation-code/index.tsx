import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useLayoutContext } from "../../layouts/general-layout";
import { RouterConstant } from "../../routers/index";
import Button from "../../components/button";
import { EmployeeService } from "../../services/employee/employee.service";
import { ProfileService } from "../../services/profile/profile.service";
import { useUserStore } from "../../utils/userStore";
import "./invitation-code.scss";

export default function InvitationCodePage() {
  const { t } = useLayoutContext();
  const navigate = useNavigate();
  const location = useLocation();
  const { ROUTERS_PATH } = RouterConstant;
  const { setProfile, setNextStep } = useUserStore();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const employeeService = new EmployeeService();

  const handleVerify = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!code.trim()) {
      setError(t("enterInvitationCode") || "Enter your invitation code");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await employeeService.verifyInvitationCode(code);

      if (response.next_step === "dashboard") {
        setNextStep("dashboard");
        try {
          const profileService = new ProfileService();
          const profile = await profileService.getBusinessProfile();
          setProfile({
            profile_type: (response.profile_type as "BUSINESS" | "EMPLOYEE") ?? "EMPLOYEE",
            user: profile.owner,
            business: profile.business,
            address: profile.address,
            schedule: profile.schedule,
            employee: profile.employee,
          });
        } catch (_) {
          const unified = await new ProfileService().getProfile();
          setProfile(unified);
        }
        navigate(ROUTERS_PATH.DASHBOARD);
      } else {
        navigate(ROUTERS_PATH.DASHBOARD);
      }
    } catch (err: any) {
      setError(
        err?.response?.data?.detail?.message ||
          err?.customMessage ||
          (t("failedToVerifyInvitationCode") || "Failed to verify invitation code")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate(ROUTERS_PATH.SENDOTP);
  };

  return (
    <div className="invitation-code-page">
      <div className="invitation-code-header">
        <button type="button" className="back-button" onClick={handleBack}>
          ←
        </button>
        <div className="header-content">
          <h1 className="invitation-code-title">
            {t("invitationCode") || "Invitation Code"}
          </h1>
          <p className="invitation-code-subtitle">
            {t("enterInvitationCodeSent") || "Enter the code shared by your business."}
          </p>
        </div>
      </div>

      <form className="invitation-code-form" onSubmit={handleVerify}>
        <div className="invitation-code-form-fields">
          <div className="form-field">
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError("");
              }}
              placeholder={t("invitationCodePlaceholder") || "e.g. ABC123"}
              autoFocus
              disabled={loading}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
        </div>

        <div className="invitation-code-form-action">
          <Button
            type="submit"
            text={loading ? (t("verifying") || "Verifying...") : t("verify")}
            color="blue"
            onClick={handleVerify}
            disabled={loading || !code.trim()}
            loading={loading}
          />
        </div>
      </form>
    </div>
  );
}
