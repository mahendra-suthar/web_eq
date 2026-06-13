import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QueueService } from "../../services/queue/queue.service";
import { ServiceService, ServiceData } from "../../services/service/service.service";
import { EmployeeService, EmployeeResponse } from "../../services/employee/employee.service";
import { ProfileService } from "../../services/profile/profile.service";
import { QueueServicePicker, validateQueueServices, type PickerService } from "../../components/queue/QueueServicePicker";
import { useUserStore } from "../../utils/userStore";
import { RouterConstant } from "../../routers";
import "./queue-add.scss";

type SelectedService = PickerService;

const QueueAdd = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const queueService = useMemo(() => new QueueService(), []);
    const serviceService = useMemo(() => new ServiceService(), []);
    const employeeService = useMemo(() => new EmployeeService(), []);
    const profileService = useMemo(() => new ProfileService(), []);
    const { profile, setProfile, getBusinessId } = useUserStore();

    const businessId = getBusinessId() || (location.state as { businessId?: string })?.businessId || "";

    const [name, setName] = useState("");
    const [employeeId, setEmployeeId] = useState<string | null>(null);
    const [bookingMode, setBookingMode] = useState<"QUEUE" | "APPROXIMATE" | "HYBRID">("QUEUE");
    const [maxPerSlot, setMaxPerSlot] = useState<number | "">(1);
    const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
    const [allServices, setAllServices] = useState<ServiceData[]>([]);
    const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [loadingServices, setLoadingServices] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [serviceErrors, setServiceErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        const load = async () => {
            if (!profile) {
                try {
                    const p = await profileService.getProfile();
                    setProfile(p);
                } catch {
                    setLoadingProfile(false);
                    return;
                }
            }
            setLoadingProfile(false);
        };
        load();
    }, [profile, profileService, setProfile]);

    useEffect(() => {
        if (!businessId) return;
        setLoadingEmployees(true);
        employeeService
            .getEmployees(businessId, 1, 500, "")
            .then((res) => setEmployees(res.items))
            .catch(() => setEmployees([]))
            .finally(() => setLoadingEmployees(false));
    }, [businessId, employeeService]);

    useEffect(() => {
        if (!businessId) return;
        setLoadingServices(true);
        serviceService
            .getServicesByBusiness(businessId)
            .then(setAllServices)
            .catch(() => setAllServices([]))
            .finally(() => setLoadingServices(false));
    }, [businessId, serviceService]);

    const addService = (svc: ServiceData) => {
        if (selectedServices.some((s) => s.service_id === svc.uuid)) return;
        setSelectedServices((prev) => [
            ...prev,
            {
                service_id: svc.uuid,
                service_name: svc.name,
                service_fee: svc.service_fee,
                avg_service_time: svc.avg_service_time,
            },
        ]);
    };

    const removeService = (serviceId: string) => {
        setSelectedServices((prev) => prev.filter((s) => s.service_id !== serviceId));
    };

    const updateSelectedService = (serviceId: string, field: "service_fee" | "avg_service_time", value: number | undefined) => {
        setSelectedServices((prev) =>
            prev.map((s) => (s.service_id === serviceId ? { ...s, [field]: value } : s))
        );
        setServiceErrors((prev) => {
            const next = { ...prev };
            delete next[serviceId];
            return next;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!name.trim()) {
            setError(t("queueNameRequired"));
            return;
        }
        if (!businessId) {
            setError(t("businessIdRequired"));
            return;
        }
        if (bookingMode !== "QUEUE") {
            const cap = maxPerSlot === "" ? NaN : Number(maxPerSlot);
            if (isNaN(cap) || cap < 1) {
                setError(t("maxPerSlotRequired"));
                return;
            }
        }
        const svcErrs = validateQueueServices(selectedServices, t);
        if (Object.keys(svcErrs).length > 0) {
            setServiceErrors(svcErrs);
            return;
        }
        setServiceErrors({});
        setSaving(true);
        try {
            const created = await queueService.createQueue({
                business_id: businessId,
                name: name.trim(),
                employee_id: employeeId || undefined,
                booking_mode: bookingMode,
                slot_interval_minutes: null, // backend uses min service avg time when null
                max_per_slot: bookingMode === "QUEUE" ? null : (maxPerSlot === "" ? 1 : Number(maxPerSlot)),
                services: selectedServices.map((s) => ({
                    service_id: s.service_id,
                    service_fee: s.service_fee,
                    avg_service_time: s.avg_service_time,
                })),
            });
            navigate(`${RouterConstant.ROUTERS_PATH.QUEUES}/${created.uuid}`, {
                state: { businessId },
            });
        } catch (err: unknown) {
            const e = err as { message?: string };
            setError(e?.message || t("failedToCreateQueue"));
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        navigate(RouterConstant.ROUTERS_PATH.QUEUES, { state: businessId ? { businessId } : undefined });
    };

    if (loadingProfile || !businessId) {
        return (
            <div className="queue-add-page">
                <div className="content-card">
                    <div className="loading-state">{t("loading")}</div>
                    {!businessId && !loadingProfile && (
                        <div className="error-message">{t("businessIdRequired")}</div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="queue-add-page">
            <div className="content-card">
                <div className="section-header section-header-actions">
                    <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                        {t("cancel")}
                    </button>
                </div>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit} className="queue-add-form">
                    <div className="form-block">
                        <label className="form-label">{t("queueName")} *</label>
                        <input
                            type="text"
                            className="form-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder={t("queueNamePlaceholder")}
                            disabled={saving}
                        />
                    </div>

                    <div className="form-block">
                        <label className="form-label">{t("assignEmployee")}</label>
                        <select
                            className="form-select"
                            value={employeeId ?? ""}
                            onChange={(e) => setEmployeeId(e.target.value || null)}
                            disabled={saving || loadingEmployees}
                        >
                            <option value="">— {t("none")} —</option>
                            {employees.map((emp) => (
                                <option key={emp.uuid} value={emp.uuid}>
                                    {emp.full_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-block">
                        <label className="form-label">Booking mode</label>
                        <select
                            className="form-select"
                            value={bookingMode}
                            onChange={(e) => {
                                const v = (e.target.value || "QUEUE") as any;
                                setBookingMode(v);
                                if (v === "QUEUE") setMaxPerSlot(1);
                            }}
                            disabled={saving}
                        >
                            <option value="QUEUE">Walk-in (Queue)</option>
                            <option value="APPROXIMATE">Approximate time</option>
                            <option value="HYBRID">Hybrid (Walk-in + Scheduled)</option>
                        </select>
                        <p className="form-hint">
                            Approx/Hybrid will generate time slots based on the queue’s minimum service average time.
                        </p>
                    </div>

                    {bookingMode !== "QUEUE" && (
                        <div className="form-block">
                            <label className="form-label">Max per slot</label>
                            <input
                                type="number"
                                className="form-input"
                                value={maxPerSlot}
                                min={1}
                                onChange={(e) => setMaxPerSlot(e.target.value === "" ? "" : Number(e.target.value))}
                                disabled={saving}
                            />
                            <p className="form-hint">
                                Slot duration is derived from the queue’s minimum service average time.
                            </p>
                        </div>
                    )}

                    <div className="form-block">
                        <h3 className="form-block-title">{t("queueServices")}</h3>
                        <p className="form-hint">{t("addQueueServicesHint")}</p>
                        {loadingServices ? (
                            <p className="info-value">{t("loading")}</p>
                        ) : (
                            <QueueServicePicker
                                available={allServices}
                                selected={selectedServices}
                                errors={serviceErrors}
                                disabled={saving}
                                onAdd={addService}
                                onRemove={removeService}
                                onUpdate={updateSelectedService}
                            />
                        )}
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
                            {t("cancel")}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? t("saving") : t("createQueue")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default QueueAdd;
