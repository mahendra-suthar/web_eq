import React from "react";
import { useTranslation } from "react-i18next";

export interface EmployeeOverviewValues {
    fullName: string;
    email: string;
    countryCode: string;
    phoneNumber: string;
}

export interface EmployeeOverviewErrors {
    fullName?: string;
    email?: string;
    countryCode?: string;
    phoneNumber?: string;
}

interface EmployeeOverviewFormProps {
    values: EmployeeOverviewValues;
    onChange: (field: keyof EmployeeOverviewValues, value: string) => void;
    errors?: EmployeeOverviewErrors;
    disabled?: boolean;
    readOnly?: boolean;
    showVerified?: boolean;
    verified?: boolean;
}

export function EmployeeOverviewForm({
    values,
    onChange,
    errors = {},
    disabled = false,
    readOnly = false,
    showVerified = false,
    verified = false,
}: EmployeeOverviewFormProps) {
    const { t } = useTranslation();

    const phoneDisplay =
        values.countryCode && values.phoneNumber
            ? `${values.countryCode} ${values.phoneNumber}`
            : values.phoneNumber || "";

    return (
        <div className="info-grid employee-overview-form">
            <div className="info-field">
                <label className="info-label">{t("fullName")}</label>
                {readOnly ? (
                    <div className="info-value">{values.fullName || t("notAvailable")}</div>
                ) : (
                    <>
                        <input
                            type="text"
                            className={`info-input ${errors.fullName ? "input-error" : ""}`}
                            value={values.fullName}
                            onChange={(e) => onChange("fullName", e.target.value)}
                            placeholder={t("enterFullName")}
                            disabled={disabled}
                        />
                        {errors.fullName && (
                            <div className="field-error" role="alert">
                                {errors.fullName}
                            </div>
                        )}
                    </>
                )}
            </div>
            <div className="info-field">
                <label className="info-label">{t("email")}</label>
                {readOnly ? (
                    <div className="info-value">{values.email || t("notAvailable")}</div>
                ) : (
                    <>
                        <input
                            type="email"
                            className={`info-input ${errors.email ? "input-error" : ""}`}
                            value={values.email}
                            onChange={(e) => onChange("email", e.target.value)}
                            placeholder={t("enterEmail")}
                            disabled={disabled}
                        />
                        {errors.email && (
                            <div className="field-error" role="alert">
                                {errors.email}
                            </div>
                        )}
                    </>
                )}
            </div>
            {!readOnly && (
                <div className="info-field">
                    <label className="info-label">{t("countryCode")}</label>
                    <input
                        type="text"
                        className="info-input"
                        value={values.countryCode}
                        onChange={(e) => onChange("countryCode", e.target.value)}
                        placeholder="+91"
                        disabled={disabled}
                    />
                </div>
            )}
            <div className="info-field">
                <label className="info-label">{t("phoneNumber")}</label>
                {readOnly ? (
                    <div className="info-value">{phoneDisplay || t("notAvailable")}</div>
                ) : (
                    <>
                        <input
                            type="tel"
                            className={`info-input ${errors.phoneNumber ? "input-error" : ""}`}
                            value={values.phoneNumber}
                            onChange={(e) =>
                                onChange("phoneNumber", e.target.value.replace(/\D/g, "").slice(0, 15))
                            }
                            placeholder={t("enterPhoneNumber")}
                            disabled={disabled}
                        />
                        {errors.phoneNumber && (
                            <div className="field-error" role="alert">
                                {errors.phoneNumber}
                            </div>
                        )}
                    </>
                )}
            </div>
            {showVerified && (
                <div className="info-field">
                    <label className="info-label">{t("isVerified")}</label>
                    <span className={`status-badge ${verified ? "active" : "pending"}`}>
                        {verified ? t("verified") : t("unverified")}
                    </span>
                </div>
            )}
        </div>
    );
}
