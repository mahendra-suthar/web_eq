import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QueueService } from "../../services/queue/queue.service";
import { ServiceService, ServiceData } from "../../services/service/service.service";
import { EmployeeService, EmployeeResponse } from "../../services/employee/employee.service";
import { ProfileService } from "../../services/profile/profile.service";
import { useUserStore } from "../../utils/userStore";
import { ProfileType } from "../../utils/constants";
import { RouterConstant } from "../../routers";
import "./queue-add.scss";

interface SelectedService {
    service_id: string;
    service_name: string;
    service_fee?: number;
    avg_service_time?: number;
}

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
    const [employees, setEmployees] = useState<EmployeeResponse[]>([]);
    const [allServices, setAllServices] = useState<ServiceData[]>([]);
    const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingEmployees, setLoadingEmployees] = useState(false);
    const [loadingServices, setLoadingServices] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

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
            .then(setEmployees)
            .catch(() => setEmployees([]))
            .finally(() => setLoadingEmployees(false));
    }, [businessId, employeeService]);

    useEffect(() => {
        setLoadingServices(true);
        serviceService
            .getAllServices()
            .then(setAllServices)
            .catch(() => setAllServices([]))
            .finally(() => setLoadingServices(false));
    }, [serviceService]);

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
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        if (!name.trim()) {
            setError(t("queueNameRequired") || "Queue name is required");
            return;
        }
        if (!businessId) {
            setError(t("businessIdRequired") || "Business ID is required");
            return;
        }
        setSaving(true);
        try {
            const created = await queueService.createQueue({
                business_id: businessId,
                name: name.trim(),
                employee_id: employeeId || undefined,
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
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            setError(e?.response?.data?.detail || (e?.message as string) || t("failedToCreateQueue") || "Failed to create queue");
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
                    <h2 className="section-title">{t("addQueue") || "Add queue"}</h2>
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
                            placeholder={t("queueNamePlaceholder") || "Enter queue name"}
                            disabled={saving}
                        />
                    </div>

                    <div className="form-block">
                        <label className="form-label">{t("assignEmployee") || "Assign employee (optional)"}</label>
                        <select
                            className="form-select"
                            value={employeeId ?? ""}
                            onChange={(e) => setEmployeeId(e.target.value || null)}
                            disabled={saving || loadingEmployees}
                        >
                            <option value="">— {t("none") || "None"} —</option>
                            {employees.map((emp) => (
                                <option key={emp.uuid} value={emp.uuid}>
                                    {emp.full_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-block">
                        <h3 className="form-block-title">{t("queueServices") || "Queue services"}</h3>
                        <p className="form-hint">{t("addQueueServicesHint") || "Add one or more services to this queue."}</p>
                        {loadingServices ? (
                            <p className="info-value">{t("loading")}</p>
                        ) : (
                            <>
                                <select
                                    className="form-select"
                                    value=""
                                    onChange={(e) => {
                                        const id = e.target.value;
                                        if (id) {
                                            const svc = allServices.find((s) => s.uuid === id);
                                            if (svc) addService(svc);
                                            e.target.value = "";
                                        }
                                    }}
                                    disabled={saving}
                                >
                                    <option value="">+ {t("addService") || "Add service"}...</option>
                                    {allServices
                                        .filter((s) => !selectedServices.some((x) => x.service_id === s.uuid))
                                        .map((s) => (
                                            <option key={s.uuid} value={s.uuid}>
                                                {s.name}
                                            </option>
                                        ))}
                                </select>
                                {selectedServices.length > 0 && (
                                    <ul className="selected-services-list">
                                        {selectedServices.map((s) => (
                                            <li key={s.service_id} className="selected-service-item">
                                                <span className="service-name">{s.service_name}</span>
                                                <input
                                                    type="number"
                                                    className="form-input small"
                                                    placeholder={t("fee")}
                                                    value={s.service_fee ?? ""}
                                                    onChange={(e) =>
                                                        updateSelectedService(
                                                            s.service_id,
                                                            "service_fee",
                                                            e.target.value === "" ? undefined : Number(e.target.value)
                                                        )
                                                    }
                                                    disabled={saving}
                                                />
                                                <input
                                                    type="number"
                                                    className="form-input small"
                                                    placeholder={t("minutes")}
                                                    value={s.avg_service_time ?? ""}
                                                    onChange={(e) =>
                                                        updateSelectedService(
                                                            s.service_id,
                                                            "avg_service_time",
                                                            e.target.value === "" ? undefined : Number(e.target.value)
                                                        )
                                                    }
                                                    disabled={saving}
                                                />
                                                <button
                                                    type="button"
                                                    className="btn btn-ghost btn-sm"
                                                    onClick={() => removeService(s.service_id)}
                                                    disabled={saving}
                                                >
                                                    {t("remove")}
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </>
                        )}
                    </div>

                    <div className="form-actions">
                        <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
                            {t("cancel")}
                        </button>
                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? t("saving") : t("createQueue") || "Create queue"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default QueueAdd;
