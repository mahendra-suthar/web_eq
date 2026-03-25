import React, { useState, useEffect, useCallback } from "react";
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

interface QueueBlockState {
  id: string;
  name: string;
  employee_id: string;
  booking_mode: "QUEUE" | "FIXED" | "APPROXIMATE" | "HYBRID";
  slot_interval_minutes: string; // "" = unset
  max_per_slot: string; // default "1"
  selectedServices: string[];
  serviceSettings: Record<string, { avg_service_time: string; fee: string }>;
}

interface BusinessQueueSetupProps {
  onNext: (queues: QueueData[]) => void;
  onBack?: () => void;
  employees: Employee[];
  businessId: string | null;
  subcategoryIds?: string[];
  initialData?: QueueData[];
}

function createEmptyQueueBlock(id: string): QueueBlockState {
  return {
    id,
    name: "",
    employee_id: "",
    booking_mode: "QUEUE",
    slot_interval_minutes: "",
    max_per_slot: "1",
    selectedServices: [],
    serviceSettings: {},
  };
}

function queueBlockFromData(id: string, data: QueueData): QueueBlockState {
  return {
    id,
    name: data.name || "",
    employee_id: data.employee_id || "",
    booking_mode: ((data as any).booking_mode || "QUEUE").toUpperCase(),
    slot_interval_minutes:
      (data as any).slot_interval_minutes != null ? String((data as any).slot_interval_minutes) : "",
    max_per_slot: (data as any).max_per_slot != null ? String((data as any).max_per_slot) : "1",
    selectedServices: data.services?.map((s) => s.service_id) || [],
    serviceSettings:
      data.services?.reduce(
        (acc, s) => ({
          ...acc,
          [s.service_id]: {
            avg_service_time: s.avg_service_time?.toString() || "",
            fee: s.fee?.toString() || "",
          },
        }),
        {} as Record<string, { avg_service_time: string; fee: string }>
      ) || {},
  };
}

export default function BusinessQueueSetup({
  onNext,
  onBack,
  employees,
  businessId,
  subcategoryIds,
  initialData,
}: BusinessQueueSetupProps) {
  const { t } = useLayoutContext();
  const queueService = new QueueService();
  const serviceService = new ServiceService();

  const [availableServices, setAvailableServices] = useState<ServiceData[]>([]);
  const [loadingServices, setLoadingServices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");

  useEffect(() => {
    if (subcategoryIds && subcategoryIds.length > 0) {
      setLoadingServices(true);
      serviceService
        .getServicesByCategories(subcategoryIds)
        .then(setAvailableServices)
        .catch((err) => {
          console.error("Failed to fetch services:", err);
          setAvailableServices([]);
        })
        .finally(() => setLoadingServices(false));
    } else {
      setAvailableServices([]);
    }
  }, [JSON.stringify(subcategoryIds)]);

  const [queues, setQueues] = useState<QueueBlockState[]>(() => {
    if (initialData?.length) {
      return initialData.map((q, i) => queueBlockFromData(`q-${i}`, q));
    }
    return [createEmptyQueueBlock("q-0")];
  });

  const [errors, setErrors] = useState<Record<string, { name?: string; employee?: string; services?: string }>>({});
  const [touched, setTouched] = useState<Record<string, { name: boolean; employee: boolean; services: boolean }>>({});

  const addQueue = useCallback(() => {
    setQueues((prev) => [...prev, createEmptyQueueBlock(`q-${Date.now()}`)]);
  }, []);

  const removeQueue = useCallback((id: string) => {
    if (queues.length <= 1) return;
    setQueues((prev) => prev.filter((q) => q.id !== id));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setTouched((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [queues.length]);

  const updateQueue = useCallback((id: string, updates: Partial<QueueBlockState>) => {
    setQueues((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...updates } : q))
    );
  }, []);

  const validateQueue = useCallback(
    (block: QueueBlockState): { name?: string; employee?: string; services?: string } => {
      const errs: { name?: string; employee?: string; services?: string } = {};
      if (!block.name?.trim()) errs.name = t("enterQueueName");
      if (!block.employee_id) errs.employee = t("selectEmployee");
      if (!block.selectedServices?.length) errs.services = t("selectAtLeastOneService");
      return errs;
    },
    [t]
  );

  const validateAll = useCallback((): boolean => {
    let valid = true;
    const newErrors: Record<string, { name?: string; employee?: string; services?: string }> = {};
    const newTouched: Record<string, { name: boolean; employee: boolean; services: boolean }> = {};
    queues.forEach((q) => {
      const errs = validateQueue(q);
      if (Object.keys(errs).length) valid = false;
      newErrors[q.id] = errs;
      newTouched[q.id] = { name: true, employee: true, services: true };
    });
    setErrors(newErrors);
    setTouched(newTouched);
    return valid;
  }, [queues, validateQueue]);

  const handleServiceToggle = useCallback(
    (queueId: string, serviceId: string) => {
      const block = queues.find((q) => q.id === queueId);
      if (!block) return;
      const isSelected = block.selectedServices.includes(serviceId);
      if (isSelected) {
        const newSettings = { ...block.serviceSettings };
        delete newSettings[serviceId];
        updateQueue(queueId, {
          selectedServices: block.selectedServices.filter((id) => id !== serviceId),
          serviceSettings: newSettings,
        });
      } else {
        updateQueue(queueId, {
          selectedServices: [...block.selectedServices, serviceId],
          serviceSettings: {
            ...block.serviceSettings,
            [serviceId]: { avg_service_time: "", fee: "" },
          },
        });
      }
    },
    [queues, updateQueue]
  );

  const updateServiceSetting = useCallback(
    (queueId: string, serviceId: string, field: "avg_service_time" | "fee", value: string) => {
      const block = queues.find((q) => q.id === queueId);
      if (!block) return;
      updateQueue(queueId, {
        serviceSettings: {
          ...block.serviceSettings,
          [serviceId]: {
            ...block.serviceSettings[serviceId],
            [field]: value,
          },
        },
      });
    },
    [queues, updateQueue]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!validateAll() || !businessId) {
      if (!businessId) {
        setSubmitError(t("businessIdMissing"));
        toast.error(t("businessIdMissing"));
      }
      return;
    }

    setSubmitError("");
    setIsSubmitting(true);
    try {
      const payload = {
        business_id: businessId,
        queues: queues.map((q) => ({
          name: q.name.trim(),
          employee_id: q.employee_id || null,
          booking_mode: q.booking_mode,
          slot_interval_minutes: null, // backend uses min service avg time when null
          max_per_slot:
            q.booking_mode === "QUEUE" || !q.max_per_slot.trim()
              ? null
              : parseInt(q.max_per_slot, 10),
          services: q.selectedServices.map((service_id) => {
            const s = q.serviceSettings[service_id];
            const avgTime = s?.avg_service_time?.trim();
            const fee = s?.fee?.trim();
            return {
              service_id,
              avg_service_time: avgTime && !isNaN(parseInt(avgTime, 10)) ? parseInt(avgTime, 10) : undefined,
              service_fee: fee && !isNaN(parseFloat(fee)) ? parseFloat(fee) : undefined,
            };
          }),
        })),
      };
      await queueService.createQueuesBatch(payload);
      const queuesForStore: QueueData[] = queues.map((q) => ({
        name: q.name.trim(),
        employee_id: q.employee_id,
        booking_mode: q.booking_mode as any,
        slot_interval_minutes: q.slot_interval_minutes as any,
        max_per_slot: q.max_per_slot as any,
        services: q.selectedServices.map((sid) => {
          const s = q.serviceSettings[sid];
          return {
            service_id: sid,
            avg_service_time: s?.avg_service_time && !isNaN(parseInt(s.avg_service_time, 10))
              ? parseInt(s.avg_service_time, 10)
              : undefined,
            fee: s?.fee && !isNaN(parseFloat(s.fee)) ? parseFloat(s.fee) : undefined,
          };
        }),
      }));
      onNext(queuesForStore);
    } catch (error: any) {
      const msg =
        error?.response?.data?.detail?.message ||
        error?.response?.data?.detail ||
        error?.message ||
        t("queueCreationFailed");
      setSubmitError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="business-queue-setup-page">
      <div className="business-queue-setup-header">
        {onBack && (
          <button type="button" className="back-button" onClick={onBack}>
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
          <div
            className="error-message"
            style={{
              color: "red",
              marginBottom: "1rem",
              padding: "0.5rem",
              backgroundColor: "#fee",
              borderRadius: "4px",
            }}
          >
            {submitError}
          </div>
        )}

        <div className="queues-list">
          {queues.map((block, index) => (
            <div key={block.id} className="queue-block">
              <div className="queue-block-header">
                <h3 className="queue-block-title">
                  {t("queue")} {index + 1}
                </h3>
                {queues.length > 1 && (
                  <button
                    type="button"
                    className="queue-block-remove"
                    onClick={() => removeQueue(block.id)}
                    aria-label={t("removeQueue")}
                  >
                    × {t("removeQueue")}
                  </button>
                )}
              </div>

              <div className="business-queue-setup-form-fields">
                <div className="form-field-wrapper">
                  <label className="form-label">{t("queueName")} *</label>
                  <div className={`form-field ${touched[block.id]?.name && errors[block.id]?.name ? "error" : ""}`}>
                    <input
                      type="text"
                      placeholder={t("enterQueueName")}
                      value={block.name}
                      onChange={(e) => updateQueue(block.id, { name: e.target.value })}
                      onBlur={() =>
                        setTouched((p) => ({
                          ...p,
                          [block.id]: { ...p[block.id], name: true },
                        }))
                      }
                      maxLength={100}
                    />
                    {touched[block.id]?.name && errors[block.id]?.name && (
                      <div className="error-text">{errors[block.id]?.name}</div>
                    )}
                  </div>
                </div>

                <div className="form-field-wrapper">
                  <label className="form-label">{t("selectEmployee")} *</label>
                  <div
                    className={`form-field ${touched[block.id]?.employee && errors[block.id]?.employee ? "error" : ""}`}
                  >
                    <select
                      value={block.employee_id}
                      onChange={(e) => updateQueue(block.id, { employee_id: e.target.value })}
                      onBlur={() =>
                        setTouched((p) => ({
                          ...p,
                          [block.id]: { ...p[block.id], employee: true },
                        }))
                      }
                    >
                      <option value="">{t("selectEmployee")}</option>
                      {employees.map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.full_name}
                        </option>
                      ))}
                    </select>
                    {touched[block.id]?.employee && errors[block.id]?.employee && (
                      <div className="error-text">{errors[block.id]?.employee}</div>
                    )}
                  </div>
                </div>

                <div className="form-field-wrapper">
                  <label className="form-label">Booking mode</label>
                  <div className="form-field">
                    <select
                      value={block.booking_mode}
                      onChange={(e) => {
                        const v = (e.target.value || "QUEUE") as any;
                        updateQueue(block.id, {
                          booking_mode: v,
                          ...(v === "QUEUE" ? { slot_interval_minutes: "", max_per_slot: "1" } : {}),
                        });
                      }}
                    >
                      <option value="QUEUE">Walk-in (Queue)</option>
                      <option value="FIXED">Fixed time</option>
                      <option value="APPROXIMATE">Approximate time</option>
                      <option value="HYBRID">Hybrid (Walk-in + Scheduled)</option>
                    </select>
                  </div>
                </div>

                {block.booking_mode !== "QUEUE" && (
                  <div className="form-field-wrapper">
                    <label className="form-label">Max per slot</label>
                    <div className="form-field">
                      <input
                        type="number"
                        min={1}
                        value={block.max_per_slot}
                        onChange={(e) => updateQueue(block.id, { max_per_slot: e.target.value })}
                      />
                      <p style={{ margin: "8px 0 0", color: "#64748b", fontSize: 13 }}>
                        Slot duration is derived from the queue’s minimum service average time.
                      </p>
                    </div>
                  </div>
                )}

                <div className="form-field-wrapper">
                  <label className="form-label">{t("selectServices")} *</label>
                  <div
                    className={`service-selection ${touched[block.id]?.services && errors[block.id]?.services ? "error" : ""}`}
                  >
                    {loadingServices ? (
                      <p>{t("loading")}...</p>
                    ) : (
                      <div className="service-checkboxes">
                        {availableServices.map((service) => {
                          const sid = service.service_uuid || service.uuid;
                          return (
                            <label key={sid} className="service-checkbox-label">
                              <input
                                type="checkbox"
                                checked={block.selectedServices.includes(sid)}
                                onChange={() => handleServiceToggle(block.id, sid)}
                                onBlur={() =>
                                  setTouched((p) => ({
                                    ...p,
                                    [block.id]: { ...p[block.id], services: true },
                                  }))
                                }
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
                    {touched[block.id]?.services && errors[block.id]?.services && (
                      <div className="error-text">{errors[block.id]?.services}</div>
                    )}
                  </div>
                </div>

                {block.selectedServices.length > 0 && (
                  <div className="per-service-config">
                    <h4 className="section-title">{t("serviceSpecificSettings")}</h4>
                    <div className="service-settings-list">
                      {block.selectedServices.map((serviceId) => {
                        const service = availableServices.find(
                          (s) => (s.service_uuid || s.uuid) === serviceId
                        );
                        if (!service) return null;
                        return (
                          <div key={serviceId} className="service-setting-item">
                            <span className="service-name">{service.name}</span>
                            <div className="service-setting-fields">
                              <div className="form-field-wrapper">
                                <label className="form-label">
                                  {t("averageServiceTime")} ({t("minutes")})
                                </label>
                                <input
                                  type="number"
                                  placeholder="15"
                                  value={block.serviceSettings[serviceId]?.avg_service_time || ""}
                                  onChange={(e) =>
                                    updateServiceSetting(block.id, serviceId, "avg_service_time", e.target.value)
                                  }
                                  min={1}
                                />
                              </div>
                              <div className="form-field-wrapper">
                                <label className="form-label">
                                  {t("fee")} ({t("currency")})
                                </label>
                                <input
                                  type="number"
                                  placeholder="0.00"
                                  value={block.serviceSettings[serviceId]?.fee || ""}
                                  onChange={(e) =>
                                    updateServiceSetting(block.id, serviceId, "fee", e.target.value)
                                  }
                                  min={0}
                                  step="0.01"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="add-queue-row">
          <Button type="button" text={t("addQueue")} color="transparent" onClick={addQueue} />
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
