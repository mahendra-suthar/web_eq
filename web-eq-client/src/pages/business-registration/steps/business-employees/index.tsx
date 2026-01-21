import React, { useState } from "react";
import { useLayoutContext } from "../../../../layouts/general-layout";
import Button from "../../../../components/button";
import { EmployeeData } from "../../../../utils/businessRegistrationStore";
import "./business-employees.scss";

import { EmployeeService } from "../../../../services/employee/employee.service";
import { toast } from "react-toastify";

interface BusinessEmployeesProps {
  onNext: (data: { employees: EmployeeData[] }) => void;
  onBack?: () => void;
  initialData?: EmployeeData[];
  businessId: string | null;
}

export default function BusinessEmployees({
  onNext,
  onBack,
  initialData,
  businessId,
}: BusinessEmployeesProps) {
  const { t } = useLayoutContext();
  const employeeService = new EmployeeService();
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Array<EmployeeData & { preview?: string }>>(
    initialData?.map((emp) => ({ ...emp, preview: "" })) || []
  );
  const initialMap = React.useMemo(() => {
    return new Map(initialData?.map(e => [e.uuid, e]) || []);
  }, [initialData]);

  const [errors, setErrors] = useState<{ [key: number]: { full_name?: string; email?: string; profile_picture?: string } }>({});

  const addEmployee = () => {
    setEmployees([...employees, { full_name: "", email: "", preview: "" }]);
  };

  const removeEmployee = (index: number) => {
    const updated = employees.filter((_, i) => i !== index);
    setEmployees(updated);
    const newErrors = { ...errors };
    delete newErrors[index];
    setErrors(newErrors);
  };

  const updateEmployee = (index: number, field: keyof EmployeeData, value: string | File | undefined) => {
    const updated = [...employees];
    if (field === "profile_picture" && value instanceof File) {
      updated[index] = { ...updated[index], [field]: value };
      const reader = new FileReader();
      reader.onloadend = () => {
        updated[index].preview = reader.result as string;
        setEmployees([...updated]);
      };
      reader.readAsDataURL(value);
    } else {
      updated[index] = { ...updated[index], [field]: value };
      setEmployees(updated);
    }

    if (errors[index]) {
      const newErrors = { ...errors };
      if (newErrors[index][field as keyof typeof newErrors[number]]) {
        delete newErrors[index][field as keyof typeof newErrors[number]];
        setErrors(newErrors);
      }
    }
  };

  const validateEmployees = (): boolean => {
    const newErrors: typeof errors = {};
    let isValid = true;

    employees.forEach((emp, index) => {
      const empErrors: { full_name?: string; email?: string; profile_picture?: string } = {};

      if (!emp.full_name || !emp.full_name.trim()) {
        empErrors.full_name = t("enterEmployeeName");
        isValid = false;
      }

      if (emp.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email)) {
        empErrors.email = t("emailInvalid");
        isValid = false;
      }

      if (emp.profile_picture) {
        const validTypes = ["image/jpeg", "image/jpg", "image/png"];
        const maxSize = 5 * 1024 * 1024;
        if (!validTypes.includes(emp.profile_picture.type)) {
          empErrors.profile_picture = t("invalidImageType");
          isValid = false;
        } else if (emp.profile_picture.size > maxSize) {
          empErrors.profile_picture = t("imageTooLarge");
          isValid = false;
        }
      }

      if (Object.keys(empErrors).length > 0) {
        newErrors[index] = empErrors;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (validateEmployees()) {
      if (businessId) {
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
              const original = empData.uuid ? initialMap.get(empData.uuid) : undefined;
              const isModified = original && (
                original.full_name !== empData.full_name ||
                original.email !== empData.email ||
                empData.profile_picture !== original.profile_picture
              );
              if (isModified) {
                modifiedEmployees.push(empData);
              } else {
                unchangedEmployees.push(empData);
              }
            }
          });

          const apiCalls: Promise<EmployeeData[]>[] = [];

          if (modifiedEmployees.length > 0) {
            const updatePromises = modifiedEmployees.map(emp =>
              employeeService.updateEmployee(emp.uuid!, emp)
            );
            apiCalls.push(Promise.all(updatePromises));
          }

          if (newEmployees.length > 0) {
            apiCalls.push(employeeService.createEmployees(businessId, newEmployees));
          }
          const results = await Promise.all(apiCalls);

          const updatedAndCreated = results.flat();
          const finalEmployees = [...unchangedEmployees, ...updatedAndCreated];

          onNext({ employees: finalEmployees });
        } catch (error) {
          console.error("Error saving employees:", error);
          toast.error("Failed to save employees. Please try again.");
        } finally {
          setLoading(false);
        }
      } else {
        onNext({ employees: employees.map(({ preview, ...emp }) => emp) });
      }
    }
  };


  return (
    <div className="business-employees-page">
      <div className="business-employees-header">
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ←
          </button>
        )}
        <div className="header-content">
          <h1 className="business-employees-title">{t("businessEmployees")}</h1>
          <p className="business-employees-subtitle">{t("addEmployees")}</p>
        </div>
      </div>

      <form className="business-employees-form" onSubmit={handleSubmit}>
        <div className="business-employees-form-fields">
          {employees.map((employee, index) => (
            <div key={index} className="employee-card">
              <div className="employee-card-header">
                <h3>{t("employee")} {index + 1}</h3>
                <button
                  type="button"
                  className="remove-button"
                  onClick={() => removeEmployee(index)}
                >
                  {t("removeEmployee")}
                </button>
              </div>

              <div className="employee-fields">
                <div className="form-field-wrapper">
                  <label className="form-label">{t("employeeFullName")} *</label>
                  <div className={`form-field ${errors[index]?.full_name ? "error" : ""}`}>
                    <input
                      type="text"
                      placeholder={t("enterEmployeeName")}
                      value={employee.full_name}
                      onChange={(e) => updateEmployee(index, "full_name", e.target.value)}
                      maxLength={100}
                    />
                    {errors[index]?.full_name && (
                      <div className="error-text">{errors[index]?.full_name}</div>
                    )}
                  </div>
                </div>

                <div className="form-field-wrapper">
                  <label className="form-label">{t("employeeEmail")}</label>
                  <div className={`form-field ${errors[index]?.email ? "error" : ""}`}>
                    <input
                      type="email"
                      placeholder={t("enterEmployeeEmail")}
                      value={employee.email || ""}
                      onChange={(e) => updateEmployee(index, "email", e.target.value)}
                    />
                    {errors[index]?.email && (
                      <div className="error-text">{errors[index]?.email}</div>
                    )}
                  </div>
                </div>

                <div className="form-field-wrapper">
                  <label className="form-label">{t("employeePicture")}</label>
                  <div className="form-field">
                    <input
                      type="file"
                      accept="image/jpeg,image/jpg,image/png"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) updateEmployee(index, "profile_picture", file);
                      }}
                      className="file-input"
                    />
                    {errors[index]?.profile_picture && (
                      <div className="error-text">{errors[index]?.profile_picture}</div>
                    )}
                    {employee.preview && (
                      <div className="image-preview">
                        <img src={employee.preview} alt="Preview" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            className="add-employee-button"
            onClick={addEmployee}
          >
            + {t("addEmployee")}
          </button>
        </div>

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
