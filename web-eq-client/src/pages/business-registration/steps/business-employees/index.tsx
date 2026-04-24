import React, { useState, useMemo } from "react";
import { useLayoutContext } from "../../../../layouts/general-layout";
import Button from "../../../../components/button";
import { EmployeeData } from "../../../../utils/businessRegistrationStore";
import { useBusinessRegistrationStore } from "../../../../utils/businessRegistrationStore";
import { useUserStore } from "../../../../utils/userStore";
import { EmployeeService } from "../../../../services/employee/employee.service";
import { emailRegex, phoneRegex } from "../../../../utils/utils";
import { toast } from "react-toastify";
import "./business-employees.scss";

interface BusinessEmployeesProps {
  onNext: (data: { employees: EmployeeData[] }) => void;
  onBack?: () => void;
  initialData?: EmployeeData[];
  businessId: string | null;
}

type EmployeeWithPreview = EmployeeData & { preview?: string };

const EMPTY_EMPLOYEE = (): EmployeeWithPreview => ({
  full_name: "",
  email: "",
  country_code: "+91",
  phone_number: "",
  preview: "",
});

export default function BusinessEmployees({
  onNext,
  onBack,
  initialData,
  businessId,
}: BusinessEmployeesProps) {
  const { t } = useLayoutContext();
  const employeeService = useMemo(() => new EmployeeService(), []);
  const { profile } = useUserStore();
  const { setSelfEmployee, isSelfEmployee } = useBusinessRegistrationStore();
  const [selfEmployee, setSelfEmployeeLocal] = useState(
    () => isSelfEmployee || !!initialData?.some((e) => e.is_owner)
  );

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<EmployeeWithPreview[]>(() => {
    const mapped: EmployeeWithPreview[] = initialData?.map((emp) => ({ ...emp, preview: "" })) ?? [];
    if (isSelfEmployee && !mapped.some((e) => e.is_owner)) {
      const ownerUserId = profile?.user?.uuid;
      const existingIdx = ownerUserId ? mapped.findIndex((e) => e.user_id === ownerUserId) : -1;
      if (existingIdx >= 0) {
        const updated = [...mapped];
        updated[existingIdx] = { ...updated[existingIdx], is_owner: true };
        return updated;
      }
      return [{
        ...(ownerUserId ? { user_id: ownerUserId } : {}),
        is_owner: true,
        full_name: profile?.user?.full_name ?? "",
        email: profile?.user?.email ?? "",
        country_code: profile?.user?.country_code ?? "+91",
        phone_number: profile?.user?.phone_number ?? "",
        preview: "",
      }, ...mapped];
    }
    return mapped;
  });
  const [errors, setErrors] = useState<
    Record<number, { full_name?: string; email?: string; phone_number?: string; profile_picture?: string }>
  >({});
  const [stepError, setStepError] = useState<string>("");
  const initialMap = useMemo(
    () => new Map(initialData?.map((e) => [e.uuid, e]) ?? []),
    [initialData]
  );

  const buildOwnerEntry = (): EmployeeWithPreview => ({
    ...(profile?.user?.uuid ? { user_id: profile.user.uuid } : {}),
    is_owner: true,
    full_name: profile?.user?.full_name ?? "",
    email: profile?.user?.email ?? "",
    country_code: profile?.user?.country_code ?? "+91",
    phone_number: profile?.user?.phone_number ?? "",
    preview: "",
  });

  const toggleSelfEmployee = (checked: boolean) => {
    setSelfEmployeeLocal(checked);
    setSelfEmployee(checked);
    if (checked) {
      setEmployees((prev) =>
        prev.some((e) => e.is_owner) ? prev : [buildOwnerEntry(), ...prev]
      );
      setStepError("");
    } else {
      setEmployees((prev) => prev.filter((e) => !e.is_owner));
    }
  };

  const addEmployee = () => {
    setEmployees((prev) => [...prev, EMPTY_EMPLOYEE()]);
    setStepError("");
  };

  const removeEmployee = (index: number) => {
    setEmployees((prev) => prev.filter((_, i) => i !== index));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[index];
      return Object.fromEntries(
        Object.entries(next).map(([k, v]) => [
          Number(k) > index ? Number(k) - 1 : Number(k),
          v,
        ])
      );
    });
  };

  const updateEmployee = (
    index: number,
    field: keyof EmployeeData,
    value: string | File | undefined
  ) => {
    setEmployees((prev) => {
      const updated = [...prev];
      if (field === "profile_picture" && value instanceof File) {
        updated[index] = { ...updated[index], [field]: value };
        const reader = new FileReader();
        reader.onloadend = () => {
          setEmployees((cur) => {
            const next = [...cur];
            next[index] = { ...next[index], preview: reader.result as string };
            return next;
          });
        };
        reader.readAsDataURL(value);
      } else {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });

    setErrors((prev) => {
      if (!prev[index]?.[field as keyof (typeof prev)[number]]) return prev;
      const next = { ...prev, [index]: { ...prev[index] } };
      delete next[index][field as keyof (typeof next)[number]];
      return next;
    });
  };

  const validateEmployees = (): boolean => {
    const newErrors: typeof errors = {};
    let isValid = true;

    employees.forEach((emp, index) => {
      const errs: (typeof errors)[number] = {};

      if (!emp.full_name?.trim()) {
        errs.full_name = t("enterEmployeeName");
        isValid = false;
      }

      if (emp.email && !emailRegex.test(emp.email)) {
        errs.email = t("emailInvalid");
        isValid = false;
      }

      if (!emp.is_owner && emp.phone_number?.trim()) {
        const digits = emp.phone_number.replace(/\D/g, "");
        if (!phoneRegex.test(digits)) {
          errs.phone_number = t("invalidPhoneFormat") || "Invalid phone number";
          isValid = false;
        }
      }

      if (emp.profile_picture) {
        const validTypes = ["image/jpeg", "image/jpg", "image/png"];
        if (!validTypes.includes(emp.profile_picture.type)) {
          errs.profile_picture = t("invalidImageType");
          isValid = false;
        } else if (emp.profile_picture.size > 5 * 1024 * 1024) {
          errs.profile_picture = t("imageTooLarge");
          isValid = false;
        }
      }

      if (Object.keys(errs).length) newErrors[index] = errs;
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setStepError("");

    if (!selfEmployee && employees.length === 0) {
      setStepError(t("atLeastOneEmployee"));
      return;
    }

    if (!validateEmployees()) return;

    if (!businessId) {
      onNext({ employees: employees.map(({ preview, ...emp }) => emp) });
      return;
    }

    setLoading(true);
    try {
      const newEmployees: EmployeeData[] = [];
      const modifiedEmployees: EmployeeData[] = [];
      const unchangedEmployees: EmployeeData[] = [];

      employees.forEach((emp) => {
        const { preview, ...empData } = emp;
        if (!empData.uuid) {
          newEmployees.push(empData);
        } else {
          const original = initialMap.get(empData.uuid);
          const modified =
            original &&
            (original.full_name !== empData.full_name ||
              original.email !== empData.email ||
              (original.country_code ?? "") !== (empData.country_code ?? "") ||
              (original.phone_number ?? "") !== (empData.phone_number ?? "") ||
              empData.profile_picture !== original.profile_picture);
          if (modified) {
            modifiedEmployees.push(empData);
          } else {
            unchangedEmployees.push(empData);
          }
        }
      });

      const [createdResults, updatedResults] = await Promise.all([
        newEmployees.length
          ? employeeService.createEmployees(businessId, newEmployees)
          : Promise.resolve([] as EmployeeData[]),
        modifiedEmployees.length
          ? Promise.all(
              modifiedEmployees.map((emp) =>
                employeeService.updateEmployee(emp.uuid!, emp)
              )
            )
          : Promise.resolve([] as EmployeeData[]),
      ]);

      // API responses don't include is_owner or user_id — restore by index (creation order is preserved)
      const createdWithFlags = (createdResults as EmployeeData[]).map((emp, i) => ({
        ...emp,
        ...(newEmployees[i]?.is_owner ? { is_owner: true } : {}),
        ...(newEmployees[i]?.user_id ? { user_id: newEmployees[i].user_id } : {}),
      }));
      const updatedWithFlags = (updatedResults as EmployeeData[]).map((emp, i) => ({
        ...emp,
        ...(modifiedEmployees[i]?.is_owner ? { is_owner: true } : {}),
      }));

      const finalEmployees = [
        ...unchangedEmployees,
        ...updatedWithFlags,
        ...createdWithFlags,
      ];

      onNext({ employees: finalEmployees });
    } catch (error) {
      console.error("Error saving employees:", error);
      toast.error("Failed to save employees. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="business-employees-page">
      <div className="business-employees-header">
        {onBack && (
          <button type="button" className="back-button" onClick={onBack}>
            ←
          </button>
        )}
        <div className="header-content">
          <h1 className="business-employees-title">{t("businessEmployees")}</h1>
          <p className="business-employees-subtitle">{t("addEmployees")}</p>
        </div>
      </div>

      <form className="business-employees-form" onSubmit={handleSubmit}>
        {/* Self-employee toggle */}
        <div className="self-employee-toggle-card">
          <div className="self-employee-toggle-content">
            <div className="self-employee-toggle-text">
              <span className="self-employee-toggle-title">
                I'll personally serve customers
              </span>
              <span className="self-employee-toggle-desc">
                Adds you as an employee so you can manage a queue directly.
              </span>
            </div>
            <label className="toggle-switch" aria-label="Add myself as an employee">
              <input
                type="checkbox"
                checked={selfEmployee}
                onChange={(e) => toggleSelfEmployee(e.target.checked)}
              />
              <span className="toggle-slider" />
            </label>
          </div>
        </div>

        {/* Employee cards */}
        <div className="business-employees-form-fields">
          {employees.map((employee, index) => {
            const isOwner = !!employee.is_owner;
            return (
              <div key={index} className={`employee-card${isOwner ? " employee-card--owner" : ""}`}>
                <div className="employee-card-header">
                  <h3>
                    {isOwner ? (
                      <>
                        <span className="owner-badge">Owner</span>
                        &nbsp;You
                      </>
                    ) : (
                      `${t("employee")} ${employees.filter((e) => !e.is_owner).indexOf(employee) + 1}`
                    )}
                  </h3>
                  {!isOwner && (
                    <button
                      type="button"
                      className="remove-button"
                      onClick={() => removeEmployee(index)}
                    >
                      {t("removeEmployee")}
                    </button>
                  )}
                </div>

                <div className="employee-fields">
                  {/* Full name */}
                  <div className="form-field-wrapper">
                    <label className="form-label">{t("employeeFullName")} *</label>
                    <div className={`form-field ${errors[index]?.full_name ? "error" : ""}`}>
                      <input
                        type="text"
                        placeholder={t("enterEmployeeName")}
                        value={employee.full_name}
                        onChange={(e) => updateEmployee(index, "full_name", e.target.value)}
                        maxLength={100}
                        readOnly={isOwner}
                      />
                      {errors[index]?.full_name && (
                        <div className="error-text">{errors[index].full_name}</div>
                      )}
                    </div>
                  </div>

                  {/* Email */}
                  <div className="form-field-wrapper">
                    <label className="form-label">{t("employeeEmail")}</label>
                    <div className={`form-field ${errors[index]?.email ? "error" : ""}`}>
                      <input
                        type="email"
                        placeholder={t("enterEmployeeEmail")}
                        value={employee.email ?? ""}
                        onChange={(e) => updateEmployee(index, "email", e.target.value.toLowerCase())}
                        readOnly={isOwner}
                      />
                      {errors[index]?.email && (
                        <div className="error-text">{errors[index].email}</div>
                      )}
                    </div>
                  </div>

                  {/* Phone */}
                  <div className="form-field-wrapper form-field-row">
                    <div className="form-field-half">
                      <label className="form-label">{t("countryCode") || "Country code"}</label>
                      <div className="form-field">
                        <input
                          type="text"
                          placeholder="+91"
                          value={employee.country_code ?? "+91"}
                          onChange={(e) => updateEmployee(index, "country_code", e.target.value)}
                          maxLength={5}
                          readOnly={isOwner}
                        />
                      </div>
                    </div>
                    <div className="form-field-half">
                      <label className="form-label">{t("phoneNumber")}</label>
                      <div className={`form-field ${errors[index]?.phone_number ? "error" : ""}`}>
                        <input
                          type="tel"
                          placeholder={t("enterPhoneNumber") || "10-digit number"}
                          value={employee.phone_number ?? ""}
                          onChange={(e) =>
                            updateEmployee(
                              index,
                              "phone_number",
                              e.target.value.replace(/\D/g, "").slice(0, 10)
                            )
                          }
                          maxLength={10}
                          readOnly={isOwner}
                        />
                        {errors[index]?.phone_number && (
                          <div className="error-text">{errors[index].phone_number}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Profile picture — not shown for owner card */}
                  {!isOwner && (
                    <div className="form-field-wrapper">
                      <label className="form-label">{t("employeePicture")}</label>
                      <div className="form-field">
                        <input
                          type="file"
                          accept="image/jpeg,image/jpg,image/png"
                          className="file-input"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) updateEmployee(index, "profile_picture", file);
                          }}
                        />
                        {errors[index]?.profile_picture && (
                          <div className="error-text">{errors[index].profile_picture}</div>
                        )}
                        {employee.preview && (
                          <div className="image-preview">
                            <img src={employee.preview} alt="Preview" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            className="add-employee-button"
            onClick={addEmployee}
          >
            + {t("addEmployee")}
          </button>
        </div>

        {stepError && (
          <div className="step-error" role="alert">{stepError}</div>
        )}

        <div className="business-employees-form-action">
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
            text={loading ? t("saving") : t("next")}
          />
        </div>
      </form>
    </div>
  );
}
