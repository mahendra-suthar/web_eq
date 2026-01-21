import React, { useState, useEffect } from "react";
import { useLayoutContext } from "../../../../layouts/general-layout";
import { toast } from "react-toastify";
import Button from "../../../../components/button";
import { QueueData } from "../../../../utils/businessRegistrationStore";
import { QueueService } from "../../../../services/queue/queue.service";
import { ServiceService, ServiceData } from "../../../../services/service/service.service";
import "./business-queue-setup.scss";

interface Employee {
  id: string;
  full_name: string;
}

interface BusinessQueueSetupProps {
  onNext: (queueData: QueueData) => void;
  onBack?: () => void;
  employees: Employee[];
  businessId: string | null;
  categoryId?: string;
  initialData?: QueueData;
}

export default function BusinessQueueSetup({
  onNext, onBack, employees, businessId, categoryId, initialData,
}: BusinessQueueSetupProps) {
  const { t } = useLayoutContext();
  const queueService = new QueueService();
  const serviceService = new ServiceService();

  const [availableServices, setAvailableServices] = useState<ServiceData[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");

  useEffect(() => {
    if (categoryId) {
      setLoadingServices(true);
      serviceService.getServicesByCategory(categoryId)
        .then((services) => {
          setAvailableServices(services);
        })
        .catch((error) => {
          console.error("Failed to fetch services:", error);
          setAvailableServices([]);
        })
        .finally(() => setLoadingServices(false));
    } else {
      console.warn("No categoryId provided for service loading");
      setAvailableServices([]);
    }
  }, [categoryId]);

  const [name, setName] = useState<string>(initialData?.name || "");
  const [selectedEmployee, setSelectedEmployee] = useState<string>(initialData?.employee_id || "");
  const [selectedServices, setSelectedServices] = useState<string[]>(initialData?.services?.map(s => s.service_id) || []);
  const [serviceSettings, setServiceSettings] = useState<Record<string, { avg_service_time: string; fee: string }>>(
    initialData?.services?.reduce((acc, s) => ({
      ...acc,
      [s.service_id]: {
        avg_service_time: s.avg_service_time?.toString() || "",
        fee: s.fee?.toString() || ""
      }
    }), {}) || {}
  );

  const [errors, setErrors] = useState<{
    name?: string; employee?: string; services?: string;
    [key: string]: string | undefined;
  }>({});

  const [touched, setTouched] = useState<{
    name: boolean; employee: boolean; services: boolean;
    [key: string]: boolean;
  }>({
    name: false, employee: false, services: false,
  });

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServices((prev) => {
      const isSelected = prev.includes(serviceId);
      if (isSelected) {
        const newSettings = { ...serviceSettings };
        delete newSettings[serviceId];
        setServiceSettings(newSettings);
        return prev.filter((id) => id !== serviceId);
      } else {
        setServiceSettings({
          ...serviceSettings,
          [serviceId]: { avg_service_time: "", fee: "" }
        });
        return [...prev, serviceId];
      }
    });

    if (touched.services) {
      validateField("services", selectedServices.includes(serviceId)
        ? selectedServices.filter((id) => id !== serviceId)
        : [...selectedServices, serviceId]);
    }
  };

  const updateServiceSetting = (serviceId: string, field: "avg_service_time" | "fee", value: string) => {
    setServiceSettings((prev) => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        [field]: value
      }
    }));
  };

  const validateField = (field: string, value: any): boolean => {
    const newErrors = { ...errors };

    switch (field) {
      case "name":
        if (!value || !value.trim()) {
          newErrors.name = t("enterQueueName");
        } else {
          delete newErrors.name;
        }
        break;
      case "employee":
        if (!value) {
          newErrors.employee = t("selectEmployee");
        } else {
          delete newErrors.employee;
        }
        break;
      case "services":
        if (!value || value.length === 0) {
          newErrors.services = t("selectAtLeastOneService");
        } else {
          delete newErrors.services;
        }
        break;
    }

    setErrors(newErrors);
    return !newErrors[field as keyof typeof newErrors];
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const value = field === "name" ? name : field === "employee" ? selectedEmployee : selectedServices;
    validateField(field, value);
  };

  const validateForm = (): boolean => {
    let isValid = true;

    const fields = ["name", "employee", "services"] as const;
    fields.forEach((field) => {
      setTouched((prev) => ({ ...prev, [field]: true }));
      const value = field === "name" ? name : field === "employee" ? selectedEmployee : selectedServices;
      if (!validateField(field, value)) {
        isValid = false;
      }
    });

    return isValid;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validateForm()) {
      return;
    }

    const queueData: QueueData = {
      name: name.trim(),
      employee_id: selectedEmployee,
      services: selectedServices.map((service_id) => {
        const settings = serviceSettings[service_id];
        const avgTime = settings?.avg_service_time?.trim();
        const fee = settings?.fee?.trim();
        
        return {
          service_id,
          avg_service_time: avgTime && !isNaN(parseInt(avgTime, 10)) ? parseInt(avgTime, 10) : undefined,
          service_fee: fee && !isNaN(parseFloat(fee)) ? parseFloat(fee) : undefined,
        };
      }),
    };

    if (businessId) {
      setIsSubmitting(true);
      setSubmitError("");
      try {
        await queueService.createQueue({ business_id: businessId, ...queueData });
        onNext(queueData);
      } catch (error: any) {
        const errorMessage = error?.response?.data?.detail?.message || 
                           error?.response?.data?.detail || 
                           error?.message || 
                           t("queueCreationFailed");
        setSubmitError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      setSubmitError(t("businessIdMissing"));
      toast.error(t("businessIdMissing"));
    }
  };

  return (
    <div className="business-queue-setup-page">
      <div className="business-queue-setup-header">
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ←
          </button>
        )}
        <div className="header-content">
          <h1 className="business-queue-setup-title">{t("queueSetup")}</h1>
          <p className="business-queue-setup-subtitle">{t("configureQueueSettings")}</p>
        </div>
      </div>

      <form className="business-queue-setup-form" onSubmit={handleSubmit}>
        {submitError && (
          <div className="error-message" style={{ color: "red", marginBottom: "1rem", padding: "0.5rem", backgroundColor: "#fee", borderRadius: "4px" }}>
            {submitError}
          </div>
        )}
        <div className="business-queue-setup-form-fields">
          {/* Queue Name */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("queueName")} *</label>
            <div className={`form-field ${touched.name && errors.name ? "error" : ""}`}>
              <input
                type="text"
                placeholder={t("enterQueueName")}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (touched.name) {
                    validateField("name", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("name")}
                maxLength={100}
              />
              {touched.name && errors.name && (
                <div className="error-text">{errors.name}</div>
              )}
            </div>
          </div>

          {/* Employee Selection */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("selectEmployee")} *</label>
            <div className={`form-field ${touched.employee && errors.employee ? "error" : ""}`}>
              <select
                value={selectedEmployee}
                onChange={(e) => {
                  setSelectedEmployee(e.target.value);
                  if (touched.employee) {
                    validateField("employee", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("employee")}
              >
                <option value="">{t("selectEmployee")}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.full_name}
                  </option>
                ))}
              </select>
              {touched.employee && errors.employee && (
                <div className="error-text">{errors.employee}</div>
              )}
            </div>
          </div>

          {/* Service Selection (Multi-select) */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("selectServices")} *</label>
            <div className={`service-selection ${touched.services && errors.services ? "error" : ""}`}>
              {loadingServices ? (
                <p>{t("loadingServices")}...</p>
              ) : (
                <div className="service-checkboxes">
                  {availableServices.map((service) => {
                    const serviceId = service.service_uuid || service.uuid;
                    return (
                      <label key={serviceId} className="service-checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedServices.includes(serviceId)}
                          onChange={() => handleServiceToggle(serviceId)}
                          onBlur={() => handleBlur("services")}
                        />
                        <span>{service.name}</span>
                      </label>
                    );
                  })}
                  {availableServices.length === 0 && (
                    <p className="no-services-text">{t("noServicesAvailable")}</p>
                  )}
                </div>
              )}
              {touched.services && errors.services && (
                <div className="error-text">{errors.services}</div>
              )}
            </div>
          </div>

          {/* Per-Service Configuration */}
          {selectedServices.length > 0 && (
            <div className="per-service-config">
              <h3 className="section-title">{t("serviceSpecificSettings")}</h3>
              <div className="service-settings-list">
                {selectedServices.map((serviceId) => {
                  const service = availableServices.find(s => (s.service_uuid || s.uuid) === serviceId);
                  if (!service) return null;
                  return (
                    <div key={serviceId} className="service-setting-item">
                      <h4 className="service-name">{service.name}</h4>
                      <div className="service-setting-fields">
                        <div className="form-field-wrapper">
                          <label className="form-label">{t("avgServiceTime")} ({t("min")})</label>
                          <div className="form-field">
                            <input
                              type="number"
                              placeholder="15"
                              value={serviceSettings[serviceId]?.avg_service_time || ""}
                              onChange={(e) => updateServiceSetting(serviceId, "avg_service_time", e.target.value)}
                              min="1"
                            />
                          </div>
                        </div>
                        <div className="form-field-wrapper">
                          <label className="form-label">{t("fee")} ({t("currency")})</label>
                          <div className="form-field">
                            <input
                              type="number"
                              placeholder="0.00"
                              value={serviceSettings[serviceId]?.fee || ""}
                              onChange={(e) => updateServiceSetting(serviceId, "fee", e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="business-queue-setup-form-action">
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
            text={isSubmitting ? t("submitting") : t("next")}
            color="blue"
            disabled={isSubmitting}
          />
        </div>
      </form>
    </div>
  );
}
