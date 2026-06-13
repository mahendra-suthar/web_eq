import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmployeeService, EmployeeResponse } from "../../services/employee/employee.service";
import { EmployeeOverviewForm } from "../../components/employee/EmployeeOverviewForm";
import type { EmployeeOverviewValues, EmployeeOverviewErrors } from "../../components/employee/EmployeeOverviewForm";
import { RouterConstant } from "../../routers/index";
import { useBusinessRegistrationStore } from "../../utils/businessRegistrationStore";
import { useUserStore } from "../../utils/userStore";
import { emailRegex } from "../../utils/utils";
import { ShareMenu } from "../../components/share-menu/ShareMenu";
import "./employee-add.scss";

const initialValues: EmployeeOverviewValues = {
    fullName: "",
    email: "",
    countryCode: "+91",
    phoneNumber: "",
};

function validate(values: EmployeeOverviewValues, t: (key: string) => string): EmployeeOverviewErrors {
    const errors: EmployeeOverviewErrors = {};
    if (!values.fullName?.trim()) {
        errors.fullName = t("fullNameRequired");
    }
    if (values.email?.trim() && !emailRegex.test(values.email.trim())) {
        errors.email = t("emailInvalid");
    }
    const phone = values.phoneNumber?.trim();
    if (phone) {
        if (!/^\d{10}$/.test(phone)) {
            errors.phoneNumber = t("employeePhoneInvalid");
        } else if (!values.countryCode?.trim()) {
            errors.countryCode = t("countryCodeRequired");
        }
    }
    return errors;
}

const EmployeeAdd = () => {
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { businessId: storeBusinessId } = useBusinessRegistrationStore();
    const profileBusinessId = useUserStore((s) => s.getBusinessId());

    const employeeService = useMemo(() => new EmployeeService(), []);

    const resolvedBusinessId = useMemo(
        () => (location.state as { businessId?: string })?.businessId || storeBusinessId || profileBusinessId,
        [location.state, storeBusinessId, profileBusinessId]
    );

    const [values, setValues] = useState<EmployeeOverviewValues>(initialValues);
    const [errors, setErrors] = useState<EmployeeOverviewErrors>({});
    const [saving, setSaving] = useState(false);
    const [submitError, setSubmitError] = useState<string>("");
    const [createdEmployee, setCreatedEmployee] = useState<EmployeeResponse | null>(null);

    const handleChange = (field: keyof EmployeeOverviewValues, value: string) => {
        setValues((prev) => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors((prev) => ({ ...prev, [field]: undefined }));
        }
        setSubmitError("");
    };

    const handleCancel = () => {
        navigate(RouterConstant.ROUTERS_PATH.EMPLOYEES, {
            state: resolvedBusinessId ? { businessId: resolvedBusinessId } : undefined,
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (saving) return; // Guard against double submission
        const validationErrors = validate(values, t);
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors);
            return;
        }
        setErrors({});
        setSubmitError("");
        if (!resolvedBusinessId) {
            setSubmitError(t("businessIdRequired"));
            return;
        }
        setSaving(true);
        try {
            const created = await employeeService.createEmployees(resolvedBusinessId, [
                {
                    full_name: values.fullName.trim(),
                    email: values.email?.trim().toLowerCase() || undefined,
                    country_code: values.countryCode?.trim() || undefined,
                    phone_number: values.phoneNumber?.trim() || undefined,
                },
            ]);
            const emp = created?.[0] as EmployeeResponse | undefined;
            if (emp?.invitation_code) {
                setCreatedEmployee(emp);
            } else {
                navigate(emp?.uuid
                    ? `${RouterConstant.ROUTERS_PATH.EMPLOYEES}/${emp.uuid}`
                    : RouterConstant.ROUTERS_PATH.EMPLOYEES,
                    { state: { businessId: resolvedBusinessId } }
                );
            }
        } catch (err: unknown) {
            type DupExisting = { full_name?: string; email?: string | null; phone_number?: string | null };
            type Detail =
                | string
                | {
                      message?: string;
                      error_code?: string;
                      existing?: DupExisting[];
                  };
            const detail = (err as { response?: { data?: { detail?: Detail } } })?.response?.data?.detail;
            const status = (err as { response?: { status?: number } })?.response?.status;

            if (status === 409 && detail && typeof detail !== "string" && detail.error_code === "EMPLOYEE_DUPLICATE") {
                const first = detail.existing?.[0];
                const matchedBy = first?.email && first.email === values.email?.trim().toLowerCase()
                    ? t("duplicateByEmail")
                    : first?.phone_number && first.phone_number === values.phoneNumber?.trim()
                        ? t("duplicateByPhone")
                        : detail.message || t("duplicateEmployee");
                setSubmitError(matchedBy);
            } else {
                const msg =
                    (typeof detail === "string" ? detail : detail?.message) ||
                    (err as Error)?.message ||
                    t("failedToLoadEmployees");
                setSubmitError(typeof msg === "string" ? msg : "Failed to add employee");
            }
        } finally {
            setSaving(false);
        }
    };

    const goToDetail = () => {
        if (!createdEmployee) return;
        navigate(`${RouterConstant.ROUTERS_PATH.EMPLOYEES}/${createdEmployee.uuid}`, {
            state: { businessId: resolvedBusinessId },
        });
    };

    if (!resolvedBusinessId) {
        return (
            <div className="employee-add-page">
                <div className="content-card">
                    <div className="error-message">
                        {t("businessIdRequired")}
                    </div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>{t("back")}
                    </button>
                </div>
            </div>
        );
    }

    // Success panel — shown after creation when employee has an invitation code
    if (createdEmployee?.invitation_code) {
        return (
            <div className="employee-add-page">
                <div className="content-card">
                    <div className="emp-add-success">
                        <div className="emp-add-success__icon">✅</div>
                        <h2 className="emp-add-success__title">Employee Added!</h2>
                        <p className="emp-add-success__sub">
                            Share the invitation code with <strong>{createdEmployee.full_name}</strong> so they can join on EaseQueue.
                        </p>

                        <div className="emp-add-success__code-card">
                            <span className="emp-add-success__code-label">Invitation Code</span>
                            <span className="emp-add-success__code">{createdEmployee.invitation_code}</span>
                            <p className="emp-add-success__code-hint">Valid for 48 hours</p>
                        </div>

                        <div className="emp-add-success__actions">
                            <ShareMenu
                                employeeName={createdEmployee.full_name}
                                code={createdEmployee.invitation_code}
                                label="Share Code"
                                className="emp-add-success__share-btn"
                            />
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={goToDetail}
                            >
                                Go to Employee Profile
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="employee-add-page">
            <div className="content-card">
                <div className="card-header section-header-actions">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={handleCancel}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>{t("back")}
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="employee-add-form">
                    {submitError && (
                        <div className="employee-add-submit-error" role="alert">
                            {submitError}
                        </div>
                    )}
                    <div className="profile-section">
                        <div className="section-header">
                            <h2 className="section-title">{t("basicInformation")}</h2>
                        </div>
                        <div className="section-content">
                            <div className="info-block employee-block">
                                <EmployeeOverviewForm
                                    values={values}
                                    onChange={handleChange}
                                    errors={errors}
                                    disabled={saving}
                                    readOnly={false}
                                    showVerified={false}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="section-actions employee-add-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
                            {t("cancel")}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? t("saving") : t("saveChanges")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EmployeeAdd;
