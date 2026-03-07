import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    QueueService,
    QueueDetailData,
    QueueServiceDetailData,
} from "../../services/queue/queue.service";
import { ServiceService, ServiceData } from "../../services/service/service.service";
import { EmployeeService, EmployeeResponse } from "../../services/employee/employee.service";
import { RouterConstant } from "../../routers";
import { formatDurationMinutes, getQueueStatusLabel } from "../../utils/utils";
import "./queue-detail.scss";

const QueueDetail = () => {
    const { t } = useTranslation();
    const { queueId } = useParams<{ queueId: string }>();
    const navigate = useNavigate();
    const queueService = useMemo(() => new QueueService(), []);
    const serviceService = useMemo(() => new ServiceService(), []);
    const employeeService = useMemo(() => new EmployeeService(), []);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [data, setData] = useState<QueueDetailData | null>(null);
    const [allServices, setAllServices] = useState<ServiceData[]>([]);
    const [employees, setEmployees] = useState<EmployeeResponse[]>([]);

    const [editingQueue, setEditingQueue] = useState(false);
    const [editName, setEditName] = useState("");
    const [editStatus, setEditStatus] = useState<number | "">("");
    const [editLimit, setEditLimit] = useState<number | "">("");
    const [editEmployeeId, setEditEmployeeId] = useState<string | null>(null);
    const [editBookingMode, setEditBookingMode] = useState<"QUEUE" | "FIXED" | "APPROXIMATE" | "HYBRID">("QUEUE");
    const [editMaxPerSlot, setEditMaxPerSlot] = useState<number | "">(1);
    const [savingQueue, setSavingQueue] = useState(false);
    const [queueSaveError, setQueueSaveError] = useState("");

    const [addFee, setAddFee] = useState<number | "">("");
    const [addAvgTime, setAddAvgTime] = useState<number | "">("");
    const [addServiceError, setAddServiceError] = useState("");
    const [savingService, setSavingService] = useState(false);
    const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
    const [editSvcFee, setEditSvcFee] = useState<number | "">("");
    const [editSvcAvgTime, setEditSvcAvgTime] = useState<number | "">("");
    const [editServiceError, setEditServiceError] = useState("");

    const loadDetail = useCallback(() => {
        if (!queueId) return;
        setLoading(true);
        setError("");
        queueService
            .getQueueDetail(queueId)
            .then((d) => {
                setData(d);
                setEditName(d.name);
                setEditStatus(d.status ?? "");
                setEditLimit(d.limit ?? "");
                setEditEmployeeId(d.assigned_employee_id ?? null);
                setEditBookingMode(((d.booking_mode || "QUEUE") as any).toUpperCase());
                setEditMaxPerSlot(d.max_per_slot ?? 1);
            })
            .catch((err: unknown) => {
                const e = err as { response?: { data?: { detail?: string } }; message?: string };
                setError(e?.response?.data?.detail || (e?.message as string) || t("failedToLoadQueue") || "Failed to load queue");
                setData(null);
            })
            .finally(() => setLoading(false));
    }, [queueId, queueService, t]);

    useEffect(() => {
        loadDetail();
    }, [loadDetail]);

    useEffect(() => {
        if (!data?.business_id) return;
        serviceService.getServicesByBusiness(data.business_id).then(setAllServices).catch(() => setAllServices([]));
    }, [data?.business_id, serviceService]);

    useEffect(() => {
        if (!data?.business_id) return;
        employeeService.getEmployees(data.business_id, 1, 500, "").then(setEmployees).catch(() => setEmployees([]));
    }, [data?.business_id, employeeService]);

    const handleSaveQueue = async () => {
        if (!queueId || !data) return;
        setQueueSaveError("");
        setSavingQueue(true);
        try {
            if (editBookingMode !== "QUEUE") {
                const cap = editMaxPerSlot === "" ? NaN : Number(editMaxPerSlot);
                if (isNaN(cap) || cap < 1) {
                    setQueueSaveError("Max per slot must be at least 1");
                    return;
                }
            }
            await queueService.updateQueue(queueId, data.business_id, {
                name: editName.trim(),
                status: editStatus === "" ? undefined : Number(editStatus),
                limit: editLimit === "" ? undefined : Number(editLimit),
                employee_id: editEmployeeId || null,
                booking_mode: editBookingMode,
                slot_interval_minutes: null, // backend uses min service avg time when null
                max_per_slot: editBookingMode === "QUEUE" ? null : (editMaxPerSlot === "" ? 1 : Number(editMaxPerSlot)),
            });
            loadDetail();
            setEditingQueue(false);
        } catch (err: unknown) {
            const e = err as { response?: { data?: { detail?: string } }; message?: string };
            setQueueSaveError(e?.response?.data?.detail || (e?.message as string) || t("failedToSave") || "Failed to save");
        } finally {
            setSavingQueue(false);
        }
    };

    const handleAddService = async (serviceId: string) => {
        if (!queueId || !data) return;
        setAddServiceError("");
        const feeNum = addFee === "" ? NaN : Number(addFee);
        const avgTimeNum = addAvgTime === "" ? NaN : Number(addAvgTime);
        if (isNaN(feeNum) || feeNum < 0) {
            setAddServiceError(t("addServiceFeeRequired") || "Fee is required when adding a service.");
            return;
        }
        if (isNaN(avgTimeNum) || avgTimeNum < 1) {
            setAddServiceError(t("addServiceAvgTimeRequired") || "Average service time (minutes) is required when adding a service.");
            return;
        }
        setSavingService(true);
        try {
            await queueService.addServicesToQueue(queueId, data.business_id, [
                {
                    service_id: serviceId,
                    service_fee: feeNum,
                    avg_service_time: avgTimeNum,
                },
            ]);
            setAddFee("");
            setAddAvgTime("");
            setAddServiceError("");
            await loadDetail();
        } catch {
            // keep form open on error
        }
        setSavingService(false);
    };

    const canAddService = (): boolean => {
        const feeNum = addFee === "" ? NaN : Number(addFee);
        const avgTimeNum = addAvgTime === "" ? NaN : Number(addAvgTime);
        return !isNaN(feeNum) && feeNum >= 0 && !isNaN(avgTimeNum) && avgTimeNum >= 1;
    };

    const handleUpdateService = async (svc: QueueServiceDetailData) => {
        if (!editingServiceId) return;
        const feeNum = editSvcFee === "" ? NaN : Number(editSvcFee);
        const avgTimeNum = editSvcAvgTime === "" ? NaN : Number(editSvcAvgTime);
        if (isNaN(feeNum) || feeNum < 0) {
            setEditServiceError(t("addServiceFeeRequired") || "Fee is required.");
            return;
        }
        if (isNaN(avgTimeNum) || avgTimeNum < 1) {
            setEditServiceError(t("addServiceAvgTimeRequired") || "Average service time (minutes) is required.");
            return;
        }
        setEditServiceError("");
        setSavingService(true);
        try {
            await queueService.updateQueueService(editingServiceId, {
                service_fee: feeNum,
                avg_service_time: avgTimeNum,
            });
            setEditingServiceId(null);
            loadDetail();
        } catch {
            // keep form open on error
        }
        setSavingService(false);
    };

    const handleRemoveService = async (queueServiceId: string) => {
        if (!window.confirm(t("confirmRemoveService") || "Remove this service from the queue?")) return;
        setSavingService(true);
        try {
            await queueService.deleteQueueService(queueServiceId);
            loadDetail();
        } catch {
            // show error could be added
        }
        setSavingService(false);
    };

    if (!queueId) {
        return (
            <div className="queue-detail-page">
                <div className="content-card">
                    <div className="error-message">{t("notAvailable")}</div>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUES)}>
                        {t("back")}
                    </button>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="queue-detail-page">
                <div className="content-card">
                    <div className="loading-state">{t("loading")}</div>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="queue-detail-page">
                <div className="content-card">
                    <div className="error-message">{error || t("notAvailable")}</div>
                    <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUES)}>
                        {t("back")}
                    </button>
                </div>
            </div>
        );
    }

    const services = data.services || [];
    const availableToAdd = allServices.filter((s) => !services.some((qs) => qs.service_id === s.uuid));

    return (
        <div className="queue-detail-page">
            <div className="content-card">
                <div className="section-header section-header-actions">
                    <h2 className="section-title">{t("queueDetails") || "Queue details"}</h2>
                    <div className="header-buttons">
                        {editingQueue ? (
                            <>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingQueue(false)} disabled={savingQueue}>
                                    {t("cancel")}
                                </button>
                                <button type="button" className="btn btn-primary btn-sm" onClick={handleSaveQueue} disabled={savingQueue}>
                                    {savingQueue ? t("saving") : t("save")}
                                </button>
                            </>
                        ) : (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingQueue(true)}>
                                {t("edit")}
                            </button>
                        )}
                        <button type="button" className="btn btn-secondary" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUES)}>
                            {t("back")}
                        </button>
                    </div>
                </div>

                {queueSaveError && <div className="error-message">{queueSaveError}</div>}

                <div className="queue-detail-content">
                    <div className="info-block queue-details-block">
                        <h3 className="info-block-title">{t("queueInformation") || "Queue information"}</h3>
                        {editingQueue ? (
                            <div className="queue-edit-form">
                                <div className="form-row">
                                    <label className="form-label">{t("queueName")}</label>
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        disabled={savingQueue}
                                    />
                                </div>
                                <div className="form-row">
                                    <label className="form-label">{t("status")}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={editStatus}
                                        onChange={(e) => setEditStatus(e.target.value === "" ? "" : Number(e.target.value))}
                                        disabled={savingQueue}
                                    />
                                </div>
                                <div className="form-row">
                                    <label className="form-label">{t("queueLimit")}</label>
                                    <input
                                        type="number"
                                        className="form-input"
                                        value={editLimit}
                                        onChange={(e) => setEditLimit(e.target.value === "" ? "" : Number(e.target.value))}
                                        disabled={savingQueue}
                                    />
                                </div>
                                <div className="form-row">
                                    <label className="form-label">{t("assignToEmployee") || "Assign to employee"}</label>
                                    <select
                                        className="form-input form-select"
                                        value={editEmployeeId ?? ""}
                                        onChange={(e) => setEditEmployeeId(e.target.value || null)}
                                        disabled={savingQueue}
                                    >
                                        <option value="">— {t("none") || "None"} —</option>
                                        {employees.map((emp) => (
                                            <option key={emp.uuid} value={emp.uuid}>
                                                {emp.full_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-row">
                                    <label className="form-label">Booking mode</label>
                                    <select
                                        className="form-input form-select"
                                        value={editBookingMode}
                                        onChange={(e) => {
                                            const v = (e.target.value || "QUEUE") as any;
                                            setEditBookingMode(v);
                                            if (v === "QUEUE") {
                                                setEditSlotIntervalMinutes("");
                                                setEditMaxPerSlot(1);
                                            }
                                        }}
                                        disabled={savingQueue}
                                    >
                                        <option value="QUEUE">Walk-in (Queue)</option>
                                        <option value="FIXED">Fixed time</option>
                                        <option value="APPROXIMATE">Approximate time</option>
                                        <option value="HYBRID">Hybrid (Walk-in + Scheduled)</option>
                                    </select>
                                </div>

                                {editBookingMode !== "QUEUE" && (
                                    <>
                                        <div className="form-row">
                                            <label className="form-label">Max per slot</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={editMaxPerSlot}
                                                min={1}
                                                onChange={(e) => setEditMaxPerSlot(e.target.value === "" ? "" : Number(e.target.value))}
                                                disabled={savingQueue}
                                            />
                                        </div>
                                        <p className="form-hint">
                                            Slot duration is derived from the queue’s minimum service average time.
                                        </p>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="info-grid">
                                <div className="info-field">
                                    <label className="info-label">{t("queueName")}</label>
                                    <div className="info-value">{data.name || t("notAvailable")}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("assignToEmployee") || "Assigned employee"}</label>
                                    <div className="info-value">
                                        {data.assigned_employee_name ??
                                            (data.assigned_employee_id
                                                ? employees.find((e) => e.uuid === data.assigned_employee_id)?.full_name ?? t("notAvailable")
                                                : "—")}
                                    </div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("status")}</label>
                                    <div className="info-value">{getQueueStatusLabel(data.status, t)}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">{t("queueLimit")}</label>
                                    <div className="info-value">{data.limit != null ? String(data.limit) : "—"}</div>
                                </div>
                                <div className="info-field">
                                    <label className="info-label">Booking mode</label>
                                    <div className="info-value">{(data.booking_mode || "QUEUE").toUpperCase()}</div>
                                </div>
                                {(data.booking_mode || "QUEUE").toUpperCase() !== "QUEUE" && (
                                    <>
                                        <div className="info-field">
                                            <label className="info-label">Max per slot</label>
                                            <div className="info-value">{data.max_per_slot != null ? String(data.max_per_slot) : "1"}</div>
                                        </div>
                                        <p className="form-hint" style={{ gridColumn: "1 / -1" }}>
                                            Slot duration: from queue’s minimum service average time.
                                        </p>
                                    </>
                                )}
                                {data.current_length != null && (
                                    <div className="info-field">
                                        <label className="info-label">{t("currentLength")}</label>
                                        <div className="info-value">{data.current_length}</div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="info-block queue-services-block">
                        <h3 className="info-block-title">{t("queueServices") || "Queue services"}</h3>

                        {/* Add Queue Service: services from business category as selectable buttons; selecting adds to queue */}
                        {availableToAdd.length > 0 && (
                            <div className="add-queue-service-section">
                                <p className="add-queue-service-intro">{t("addQueueServiceIntro")}</p>
                                {addServiceError && (
                                    <div className="add-service-error" role="alert">{addServiceError}</div>
                                )}
                                <div className="add-service-required-fields">
                                    <div className="add-service-field">
                                        <label className="form-label">{t("fee")} *</label>
                                        <input
                                            type="number"
                                            className="form-input small"
                                            placeholder={t("enterFee") || "0.00"}
                                            value={addFee}
                                            onChange={(e) => {
                                                setAddFee(e.target.value === "" ? "" : Number(e.target.value));
                                                setAddServiceError("");
                                            }}
                                            min={0}
                                            step="0.01"
                                            disabled={savingService}
                                        />
                                    </div>
                                    <div className="add-service-field">
                                        <label className="form-label">{t("averageServiceTime")} ({t("minutes")}) *</label>
                                        <input
                                            type="number"
                                            className="form-input small"
                                            placeholder="15"
                                            value={addAvgTime}
                                            onChange={(e) => {
                                                setAddAvgTime(e.target.value === "" ? "" : Number(e.target.value));
                                                setAddServiceError("");
                                            }}
                                            min={1}
                                            disabled={savingService}
                                        />
                                    </div>
                                </div>
                                <div className="service-buttons-grid">
                                    {availableToAdd.map((s) => (
                                        <button
                                            key={s.uuid}
                                            type="button"
                                            className="btn btn-service-chip"
                                            onClick={() => handleAddService(s.uuid)}
                                            disabled={savingService || !canAddService()}
                                            title={!canAddService() ? t("addQueueServiceIntro") : undefined}
                                        >
                                            {s.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {services.length === 0 ? (
                            <p className="info-value">{t("noServicesAssigned") || "No services assigned to this queue."}</p>
                        ) : (
                            <div className="queue-services-table-wrap">
                                <table className="data-table queue-services-table">
                                    <thead>
                                        <tr>
                                            <th>{t("serviceName")}</th>
                                            <th>{t("serviceDescription") || "Description"}</th>
                                            <th>{t("fee")}</th>
                                            <th>{t("averageServiceTime") || "Avg. time (min)"}</th>
                                            <th>{t("actions")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {services.map((svc) => (
                                            <tr key={svc.uuid}>
                                                <td>{svc.service_name ?? t("notAvailable")}</td>
                                                <td>{svc.description ?? t("notAvailable")}</td>
                                                {editingServiceId === svc.uuid ? (
                                                    <>
                                                        <td>
                                                            {editServiceError && (
                                                                <div className="edit-service-error-inline" role="alert">{editServiceError}</div>
                                                            )}
                                                            <input
                                                                type="number"
                                                                className="form-input small"
                                                                value={editSvcFee}
                                                                onChange={(e) => {
                                                                    setEditSvcFee(e.target.value === "" ? "" : Number(e.target.value));
                                                                    setEditServiceError("");
                                                                }}
                                                                min={0}
                                                                step="0.01"
                                                                disabled={savingService}
                                                                placeholder={t("fee")}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                type="number"
                                                                className="form-input small"
                                                                value={editSvcAvgTime}
                                                                onChange={(e) => {
                                                                    setEditSvcAvgTime(e.target.value === "" ? "" : Number(e.target.value));
                                                                    setEditServiceError("");
                                                                }}
                                                                min={1}
                                                                disabled={savingService}
                                                                placeholder={t("minutes")}
                                                            />
                                                        </td>
                                                        <td>
                                                            <button type="button" className="btn btn-primary btn-sm" onClick={() => handleUpdateService(svc)} disabled={savingService}>
                                                                {t("save")}
                                                            </button>
                                                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingServiceId(null); setEditServiceError(""); }} disabled={savingService}>
                                                                {t("cancel")}
                                                            </button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td>{svc.service_fee != null ? String(svc.service_fee) : t("notAvailable")}</td>
                                                        <td>{svc.avg_service_time != null ? formatDurationMinutes(svc.avg_service_time) : t("notAvailable")}</td>
                                                        <td>
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-sm"
                                                                onClick={() => {
                                                                    setEditingServiceId(svc.uuid);
                                                                    setEditSvcFee(svc.service_fee ?? "");
                                                                    setEditSvcAvgTime(svc.avg_service_time ?? "");
                                                                    setEditServiceError("");
                                                                }}
                                                                disabled={savingService}
                                                            >
                                                                {t("edit")}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-ghost btn-sm danger"
                                                                onClick={() => handleRemoveService(svc.uuid)}
                                                                disabled={savingService}
                                                            >
                                                                {t("remove")}
                                                            </button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QueueDetail;
