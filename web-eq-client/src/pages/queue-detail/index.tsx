import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
    QueueService,
    QueueDetailData,
    QueueServiceDetailData,
} from "../../services/queue/queue.service";
import { ServiceService, ServiceData } from "../../services/service/service.service";
import { EmployeeService, EmployeeResponse } from "../../services/employee/employee.service";
import { QueueServicePicker, validateQueueServices, type PickerService, type PickerAvailableService } from "../../components/queue/QueueServicePicker";
import { ConfirmModal } from "../../components/confirm-modal";
import { useUserStore } from "../../utils/userStore";
import { hasPermission, Permission } from "../../utils/permissions";
import { toast } from "react-toastify";
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
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const canDelete = hasPermission(useUserStore((s) => s.getProfileType()), Permission.DELETE_QUEUE);

    const [pendingServices, setPendingServices] = useState<PickerService[]>([]);
    const [pendingErrors, setPendingErrors] = useState<Record<string, string>>({});
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
                setError(e?.response?.data?.detail || (e?.message as string) || t("failedToLoadQueue"));
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
        employeeService.getEmployees(data.business_id, 1, 500, "").then((res) => setEmployees(res.items)).catch(() => setEmployees([]));
    }, [data?.business_id, employeeService]);

    const handleSaveQueue = async () => {
        if (!queueId || !data) return;
        setQueueSaveError("");
        setSavingQueue(true);
        try {
            if (editBookingMode !== "QUEUE") {
                const cap = editMaxPerSlot === "" ? NaN : Number(editMaxPerSlot);
                if (isNaN(cap) || cap < 1) {
                    setQueueSaveError(t("maxPerSlotRequired"));
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
            setQueueSaveError(e?.response?.data?.detail || (e?.message as string) || t("failedToSave"));
        } finally {
            setSavingQueue(false);
        }
    };

    const addPendingService = (svc: PickerAvailableService) => {
        setPendingServices((prev) =>
            prev.some((s) => s.service_id === svc.uuid)
                ? prev
                : [
                      ...prev,
                      {
                          service_id: svc.uuid,
                          service_name: svc.name,
                          service_fee: svc.service_fee,
                          avg_service_time: svc.avg_service_time,
                      },
                  ]
        );
    };

    const removePendingService = (serviceId: string) => {
        setPendingServices((prev) => prev.filter((s) => s.service_id !== serviceId));
        setPendingErrors((prev) => {
            const next = { ...prev };
            delete next[serviceId];
            return next;
        });
    };

    const updatePendingService = (serviceId: string, field: "service_fee" | "avg_service_time", value: number | undefined) => {
        setPendingServices((prev) => prev.map((s) => (s.service_id === serviceId ? { ...s, [field]: value } : s)));
        setPendingErrors((prev) => {
            const next = { ...prev };
            delete next[serviceId];
            return next;
        });
    };

    const handleAddPendingServices = async () => {
        if (!queueId || !data || pendingServices.length === 0) return;
        const errs = validateQueueServices(pendingServices, t);
        if (Object.keys(errs).length > 0) {
            setPendingErrors(errs);
            return;
        }
        setPendingErrors({});
        setSavingService(true);
        try {
            await queueService.addServicesToQueue(
                queueId,
                data.business_id,
                pendingServices.map((s) => ({
                    service_id: s.service_id,
                    service_fee: s.service_fee as number,
                    avg_service_time: s.avg_service_time as number,
                }))
            );
            setPendingServices([]);
            loadDetail();
        } catch {
            // keep staged rows on error so the user can retry
        }
        setSavingService(false);
    };

    const handleUpdateService = async (_svc: QueueServiceDetailData) => {
        if (!editingServiceId) return;
        const feeNum = editSvcFee === "" ? NaN : Number(editSvcFee);
        const avgTimeNum = editSvcAvgTime === "" ? NaN : Number(editSvcAvgTime);
        if (isNaN(feeNum) || feeNum < 0) {
            setEditServiceError(t("addServiceFeeRequired"));
            return;
        }
        if (isNaN(avgTimeNum) || avgTimeNum < 1) {
            setEditServiceError(t("addServiceAvgTimeRequired"));
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
        if (!window.confirm(t("confirmRemoveService"))) return;
        setSavingService(true);
        try {
            await queueService.deleteQueueService(queueServiceId);
            loadDetail();
        } catch {
            // show error could be added
        }
        setSavingService(false);
    };

    const handleDeleteQueue = useCallback(async () => {
        if (!queueId || !data?.business_id) return;
        setDeleting(true);
        try {
            await queueService.deleteQueue(queueId, data.business_id);
            toast.success(t("deleteQueueSuccess"));
            navigate(RouterConstant.ROUTERS_PATH.QUEUES);
        } catch (err: any) {
            // Surface the server reason (e.g. 409 active customers) verbatim.
            toast.error(err?.message || t("deleteQueueFailed"));
            setShowDeleteConfirm(false);
        } finally {
            setDeleting(false);
        }
    }, [queueId, data?.business_id, queueService, navigate, t]);

    if (!queueId) {
        return (
            <div className="queue-detail-page">
                <div className="content-card">
                    <div className="error-message">{t("notAvailable")}</div>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUES)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>{t("back")}
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
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUES)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>{t("back")}
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
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate(RouterConstant.ROUTERS_PATH.QUEUES)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>{t("back")}
                    </button>
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
                            <>
                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditingQueue(true)}>
                                    {t("edit")}
                                </button>
                                {canDelete && (
                                    <button
                                        type="button"
                                        className="btn btn-danger btn-sm"
                                        onClick={() => setShowDeleteConfirm(true)}
                                        disabled={deleting}
                                    >
                                        {t("deleteQueue")}
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {queueSaveError && <div className="error-message">{queueSaveError}</div>}

                <div className="queue-detail-content">
                    <div className="info-block queue-details-block">
                        <h3 className="info-block-title">{t("queueInformation")}</h3>
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
                                    <label className="form-label">{t("assignToEmployee")}</label>
                                    <select
                                        className="form-input form-select"
                                        value={editEmployeeId ?? ""}
                                        onChange={(e) => setEditEmployeeId(e.target.value || null)}
                                        disabled={savingQueue}
                                    >
                                        <option value="">— {t("none")} —</option>
                                        {employees.map((emp) => (
                                            <option key={emp.uuid} value={emp.uuid}>
                                                {emp.full_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-row">
                                    <label className="form-label">{t("bookingMode")}</label>
                                    <select
                                        className="form-input form-select"
                                        value={editBookingMode}
                                        onChange={(e) => {
                                            const v = (e.target.value || "QUEUE") as any;
                                            setEditBookingMode(v);
                                            if (v === "QUEUE") {
                                                setEditMaxPerSlot(1);
                                            }
                                        }}
                                        disabled={savingQueue}
                                    >
                                        <option value="QUEUE">{t("bookingModeQueue")}</option>
                                        <option value="FIXED">{t("bookingModeFixed")}</option>
                                        <option value="APPROXIMATE">{t("bookingModeApproximate")}</option>
                                        <option value="HYBRID">{t("bookingModeHybrid")}</option>
                                    </select>
                                </div>

                                {editBookingMode !== "QUEUE" && (
                                    <>
                                        <div className="form-row">
                                            <label className="form-label">{t("maxPerSlot")}</label>
                                            <input
                                                type="number"
                                                className="form-input"
                                                value={editMaxPerSlot}
                                                min={1}
                                                onChange={(e) => setEditMaxPerSlot(e.target.value === "" ? "" : Number(e.target.value))}
                                                disabled={savingQueue}
                                            />
                                        </div>
                                        <div className="queue-slot-hint">
                                            <span className="queue-slot-hint__icon">ℹ</span>
                                            {t("slotDurationHint")}
                                        </div>
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
                                    <label className="info-label">{t("assignedEmployee")}</label>
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
                                    <label className="info-label">{t("bookingMode")}</label>
                                    <div className="info-value">{t(`bookingMode${(data.booking_mode || "QUEUE").charAt(0).toUpperCase() + (data.booking_mode || "QUEUE").slice(1).toLowerCase()}`)}</div>
                                </div>
                                {(data.booking_mode || "QUEUE").toUpperCase() !== "QUEUE" && (
                                    <>
                                        <div className="info-field">
                                            <label className="info-label">{t("maxPerSlot")}</label>
                                            <div className="info-value">{data.max_per_slot != null ? String(data.max_per_slot) : "1"}</div>
                                        </div>
                                        <div className="queue-slot-hint" style={{ gridColumn: "1 / -1" }}>
                                            <span className="queue-slot-hint__icon">ℹ</span>
                                            {t("slotDurationHint")}
                                        </div>
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
                        <h3 className="info-block-title">{t("queueServices")}</h3>

                        {/* Add Queue Service: pick from the business catalog, set fee + duration per row, then commit. */}
                        {availableToAdd.length > 0 && (
                            <div className="add-queue-service-section">
                                <p className="add-queue-service-intro">{t("addQueueServicesHint")}</p>
                                <QueueServicePicker
                                    available={availableToAdd}
                                    selected={pendingServices}
                                    errors={pendingErrors}
                                    disabled={savingService}
                                    onAdd={addPendingService}
                                    onRemove={removePendingService}
                                    onUpdate={updatePendingService}
                                />
                                {pendingServices.length > 0 && (
                                    <div className="add-queue-service-actions">
                                        <button
                                            type="button"
                                            className="btn btn-primary btn-sm"
                                            onClick={handleAddPendingServices}
                                            disabled={savingService}
                                        >
                                            {savingService ? t("saving") : t("addToQueue")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {services.length === 0 ? (
                            <p className="info-value">{t("noServicesAssigned")}</p>
                        ) : (
                            <div className="queue-services-table-wrap">
                                <table className="data-table queue-services-table">
                                    <thead>
                                        <tr>
                                            <th>{t("serviceName")}</th>
                                            <th>{t("serviceDescription")}</th>
                                            <th>{t("fee")}</th>
                                            <th>{t("averageServiceTime")}</th>
                                            <th>{t("actions")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {services.map((svc) => (
                                            <tr key={svc.uuid}>
                                                <td data-label={t("serviceName")}>{svc.service_name ?? t("notAvailable")}</td>
                                                <td data-label={t("serviceDescription")}>{svc.description ?? t("notAvailable")}</td>
                                                {editingServiceId === svc.uuid ? (
                                                    <>
                                                        <td data-label={t("fee")}>
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
                                                        <td data-label={t("averageServiceTime")}>
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
                                                        <td data-label={t("actions")}>
                                                            <div className="svc-edit-actions">
                                                                <button type="button" className="btn btn-primary btn-sm" onClick={() => handleUpdateService(svc)} disabled={savingService}>
                                                                    {t("save")}
                                                                </button>
                                                                <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setEditingServiceId(null); setEditServiceError(""); }} disabled={savingService}>
                                                                    {t("cancel")}
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td data-label={t("fee")}>{svc.service_fee != null ? String(svc.service_fee) : t("notAvailable")}</td>
                                                        <td data-label={t("averageServiceTime")}>{svc.avg_service_time != null ? formatDurationMinutes(svc.avg_service_time) : t("notAvailable")}</td>
                                                        <td data-label={t("actions")}>
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

            {showDeleteConfirm && (
                <ConfirmModal
                    title={t("deleteQueue")}
                    message={t("confirmDeleteQueue", { name: data.name })}
                    confirmLabel={t("deletePermanently")}
                    cancelLabel={t("cancel")}
                    destructive
                    loading={deleting}
                    onConfirm={handleDeleteQueue}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}
        </div>
    );
};

export default QueueDetail;
