import { useTranslation } from "react-i18next";
import "./queue-service-picker.scss";

export interface PickerService {
    service_id: string;
    service_name: string;
    service_fee?: number;
    avg_service_time?: number;
}

export interface PickerAvailableService {
    uuid: string;
    name: string;
    /** Optional catalog defaults used to prefill the staged row's fee / duration. */
    service_fee?: number;
    avg_service_time?: number;
}

interface QueueServicePickerProps {
    /** Services that can still be added (already-selected ones should be excluded by the caller or are filtered here). */
    available: PickerAvailableService[];
    /** Services currently staged, each with its own fee / duration. */
    selected: PickerService[];
    /** Per-service validation errors, keyed by service_id. */
    errors: Record<string, string>;
    disabled?: boolean;
    onAdd: (svc: PickerAvailableService) => void;
    onRemove: (serviceId: string) => void;
    onUpdate: (serviceId: string, field: "service_fee" | "avg_service_time", value: number | undefined) => void;
}

/**
 * Validate a staged service list. Fee is required (>= 0); duration is required (>= 1 min).
 * Returns a map of service_id -> error message (empty when all valid).
 */
export function validateQueueServices(
    selected: PickerService[],
    t: (key: string) => string
): Record<string, string> {
    const errs: Record<string, string> = {};
    for (const s of selected) {
        if (
            s.service_fee === undefined ||
            s.service_fee === null ||
            isNaN(s.service_fee) ||
            s.service_fee < 0
        ) {
            errs[s.service_id] = t("addServiceFeeRequired");
        } else if (!s.avg_service_time || s.avg_service_time < 1) {
            errs[s.service_id] = t("addServiceAvgTimeRequired");
        }
    }
    return errs;
}

/**
 * Shared service picker used by both Add Queue and Edit Queue.
 * A dropdown adds a service to the staged list; each staged row carries its own
 * fee + duration inputs with inline per-row validation errors.
 */
export function QueueServicePicker({
    available,
    selected,
    errors,
    disabled = false,
    onAdd,
    onRemove,
    onUpdate,
}: QueueServicePickerProps) {
    const { t } = useTranslation();
    const selectable = available.filter((s) => !selected.some((x) => x.service_id === s.uuid));

    return (
        <div className="queue-service-picker">
            <select
                className="form-select queue-service-picker__select"
                value=""
                onChange={(e) => {
                    const id = e.target.value;
                    if (id) {
                        const svc = available.find((s) => s.uuid === id);
                        if (svc) onAdd(svc);
                        e.target.value = "";
                    }
                }}
                disabled={disabled || selectable.length === 0}
            >
                <option value="">+ {t("addService")}...</option>
                {selectable.map((s) => (
                    <option key={s.uuid} value={s.uuid}>
                        {s.name}
                    </option>
                ))}
            </select>

            {selected.length > 0 && (
                <ul className="selected-services-list">
                    {selected.map((s) => (
                        <li
                            key={s.service_id}
                            className={`selected-service-item${errors[s.service_id] ? " selected-service-item--error" : ""}`}
                        >
                            <div className="service-item-row">
                                <span className="service-name">{s.service_name}</span>
                                <input
                                    type="number"
                                    className="form-input small"
                                    placeholder={`${t("fee")} *`}
                                    min={0}
                                    value={s.service_fee ?? ""}
                                    onChange={(e) =>
                                        onUpdate(
                                            s.service_id,
                                            "service_fee",
                                            e.target.value === "" ? undefined : Number(e.target.value)
                                        )
                                    }
                                    disabled={disabled}
                                />
                                <input
                                    type="number"
                                    className="form-input small"
                                    placeholder={`${t("minutes")} *`}
                                    min={1}
                                    value={s.avg_service_time ?? ""}
                                    onChange={(e) =>
                                        onUpdate(
                                            s.service_id,
                                            "avg_service_time",
                                            e.target.value === "" ? undefined : Number(e.target.value)
                                        )
                                    }
                                    disabled={disabled}
                                />
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => onRemove(s.service_id)}
                                    disabled={disabled}
                                >
                                    {t("remove")}
                                </button>
                            </div>
                            {errors[s.service_id] && (
                                <p className="service-item-error" role="alert">
                                    {errors[s.service_id]}
                                </p>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
