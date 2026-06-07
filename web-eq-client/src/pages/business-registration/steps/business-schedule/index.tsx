import React, { useMemo, useState } from "react";
import { useLayoutContext } from "../../../../layouts/general-layout";
import Button from "../../../../components/button";
import { BreakTime, DaySchedule } from "../../../../utils/businessRegistrationStore";
import {
  BreakTimeInput,
  BusinessService,
  ScheduleInput,
} from "../../../../services/business/business.service";
import { DayOfWeek, DAYS_IN_WEEK, DAYS_OF_WEEK } from "../../../../utils/constants";
import { uiDowToBackendDow } from "../../../../utils/utils";
import "./business-schedule.scss";

interface BusinessScheduleProps {
  onNext: (scheduleData: {
    is_always_open: boolean;
    schedule: DaySchedule[];
  }) => void;
  onBack?: () => void;
  businessId?: string | null;
  initialData?: {
    is_always_open: boolean;
    schedule: DaySchedule[];
  };
}

type DayErrors = {
  range?: string;
  breaks?: Record<number, string>;
};

const toMinutes = (t: string): number => {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return NaN;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const overlaps = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): boolean => aStart < bEnd && bStart < aEnd;

export default function BusinessSchedule({
  onNext,
  onBack,
  businessId,
  initialData,
}: BusinessScheduleProps) {
  const { t } = useLayoutContext();
  const businessService = useMemo(() => new BusinessService(), []);
  const [loading, setLoading] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<string>("");

  const [isAlwaysOpen, setIsAlwaysOpen] = useState<boolean>(
    initialData?.is_always_open || false
  );

  const getDefaultSchedule = (): DaySchedule[] => {
    const dayNameMap: Record<DayOfWeek, string> = {
      [DayOfWeek.MONDAY]: t("monday"),
      [DayOfWeek.TUESDAY]: t("tuesday"),
      [DayOfWeek.WEDNESDAY]: t("wednesday"),
      [DayOfWeek.THURSDAY]: t("thursday"),
      [DayOfWeek.FRIDAY]: t("friday"),
      [DayOfWeek.SATURDAY]: t("saturday"),
      [DayOfWeek.SUNDAY]: t("sunday"),
    };

    return DAYS_OF_WEEK.map((dayOfWeek) => ({
      day_of_week: dayOfWeek,
      day_name: dayNameMap[dayOfWeek],
      is_open: false,
      opening_time: "",
      closing_time: "",
      break_times: [],
    }));
  };

  const getInitialSchedule = (): DaySchedule[] => {
    if (initialData?.schedule && initialData.schedule.length === DAYS_IN_WEEK) {
      return initialData.schedule.map((d) => ({
        ...d,
        break_times: d.break_times ?? [],
      }));
    }
    return getDefaultSchedule();
  };

  const [schedule, setSchedule] = useState<DaySchedule[]>(getInitialSchedule());
  const [globalError, setGlobalError] = useState<string>("");
  const [dayErrors, setDayErrors] = useState<Record<number, DayErrors>>({});
  const [touched, setTouched] = useState<boolean>(false);

  const validateSchedule = (
    scheduleData: DaySchedule[]
  ): { ok: boolean; global: string; perDay: Record<number, DayErrors> } => {
    const perDay: Record<number, DayErrors> = {};
    const hasOpenDays = scheduleData.some((d) => d.is_open);

    if (!isAlwaysOpen && !hasOpenDays) {
      return { ok: false, global: t("selectAtLeastOneDay"), perDay };
    }

    if (isAlwaysOpen) return { ok: true, global: "", perDay };

    let ok = true;

    for (const day of scheduleData) {
      if (!day.is_open) continue;
      const dayErr: DayErrors = { breaks: {} };
      const openMin = toMinutes(day.opening_time);
      const closeMin = toMinutes(day.closing_time);

      if (
        !day.opening_time ||
        !day.closing_time ||
        isNaN(openMin) ||
        isNaN(closeMin) ||
        openMin >= closeMin
      ) {
        dayErr.range = t("invalidTimeRange");
        ok = false;
      }

      const breaks = day.break_times ?? [];
      const validIntervals: Array<{ start: number; end: number; idx: number }> = [];

      breaks.forEach((br, idx) => {
        const bStart = toMinutes(br.break_start);
        const bEnd = toMinutes(br.break_end);

        if (!br.break_start || !br.break_end || isNaN(bStart) || isNaN(bEnd)) {
          dayErr.breaks![idx] = t("breakTimesRequired");
          ok = false;
          return;
        }
        if (bStart >= bEnd) {
          dayErr.breaks![idx] = t("breakStartBeforeEnd");
          ok = false;
          return;
        }
        if (!isNaN(openMin) && bStart <= openMin) {
          dayErr.breaks![idx] = t("breakAfterOpening");
          ok = false;
          return;
        }
        if (!isNaN(closeMin) && bEnd >= closeMin) {
          dayErr.breaks![idx] = t("breakBeforeClosing");
          ok = false;
          return;
        }

        const conflict = validIntervals.find((iv) =>
          overlaps(iv.start, iv.end, bStart, bEnd)
        );
        if (conflict) {
          dayErr.breaks![idx] = t("breakOverlaps");
          ok = false;
          return;
        }
        validIntervals.push({ start: bStart, end: bEnd, idx });
      });

      if (dayErr.range || Object.keys(dayErr.breaks!).length > 0) {
        perDay[day.day_of_week] = dayErr;
      }
    }

    return { ok, global: "", perDay };
  };

  const runValidation = (next: DaySchedule[]) => {
    const result = validateSchedule(next);
    setGlobalError(result.global);
    setDayErrors(result.perDay);
    return result.ok;
  };

  const updateSchedule = (
    next: DaySchedule[],
    revalidate: boolean = touched
  ) => {
    setSchedule(next);
    if (revalidate) runValidation(next);
  };

  const handleDayToggle = (dayIndex: number) => {
    const next = schedule.map((day, index) => {
      if (index !== dayIndex) return day;
      const opening = !day.is_open ? "09:00" : "";
      const closing = !day.is_open ? "18:00" : "";
      return {
        ...day,
        is_open: !day.is_open,
        opening_time: opening,
        closing_time: closing,
        break_times: !day.is_open ? day.break_times ?? [] : [],
      };
    });
    updateSchedule(next);
  };

  const handleTimeChange = (
    dayIndex: number,
    field: "opening_time" | "closing_time",
    value: string
  ) => {
    const next = schedule.map((day, index) =>
      index === dayIndex ? { ...day, [field]: value } : day
    );
    updateSchedule(next);
  };

  const handleAddBreak = (dayIndex: number) => {
    const next = schedule.map((day, index) => {
      if (index !== dayIndex) return day;
      const breaks = [...(day.break_times ?? [])];
      breaks.push({ break_start: "", break_end: "" });
      return { ...day, break_times: breaks };
    });
    updateSchedule(next, false); // don't validate on add — new break has empty times
  };

  const handleBreakChange = (
    dayIndex: number,
    breakIndex: number,
    field: "break_start" | "break_end",
    value: string
  ) => {
    const next = schedule.map((day, index) => {
      if (index !== dayIndex) return day;
      const breaks = (day.break_times ?? []).map((br, i) =>
        i === breakIndex ? { ...br, [field]: value } : br
      );
      return { ...day, break_times: breaks };
    });
    updateSchedule(next);
  };

  const handleRemoveBreak = (dayIndex: number, breakIndex: number) => {
    const next = schedule.map((day, index) => {
      if (index !== dayIndex) return day;
      const breaks = (day.break_times ?? []).filter((_, i) => i !== breakIndex);
      return { ...day, break_times: breaks };
    });
    updateSchedule(next);
  };

  const handleAlwaysOpenToggle = (checked: boolean) => {
    setIsAlwaysOpen(checked);
    if (checked) {
      const next = getDefaultSchedule().map((d) => ({ ...d, is_open: true }));
      setSchedule(next);
      setDayErrors({});
      setGlobalError("");
    } else {
      const next = getDefaultSchedule();
      setSchedule(next);
      if (touched) runValidation(next);
    }
  };

  const buildBreaksPayload = (breaks: BreakTime[] = []): BreakTimeInput[] =>
    breaks
      .filter((br) => br.break_start && br.break_end)
      .map((br) => ({ break_start: br.break_start, break_end: br.break_end }));

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    setSubmitError("");

    if (!isAlwaysOpen && !runValidation(schedule)) return;

    if (!businessId) {
      onNext({ is_always_open: isAlwaysOpen, schedule });
      return;
    }

    setLoading(true);
    try {
      const scheduleInputs: ScheduleInput[] = isAlwaysOpen
        ? []
        : schedule.map((day) => ({
            day_of_week: uiDowToBackendDow(day.day_of_week),
            opening_time: day.is_open && day.opening_time ? day.opening_time : null,
            closing_time: day.is_open && day.closing_time ? day.closing_time : null,
            is_open: day.is_open,
            break_times: day.is_open ? buildBreaksPayload(day.break_times) : [],
          }));

      await businessService.createBusinessSchedules(
        businessId,
        scheduleInputs,
        isAlwaysOpen
      );

      onNext({ is_always_open: isAlwaysOpen, schedule });
    } catch (err: any) {
      let message = t("scheduleCreationFailed");
      if (err?.errorCode === "BUSINESS_NOT_FOUND") {
        message = t("businessNotFound");
      } else if (err?.message) {
        message = err.message;
      } else if (err?.response?.data?.detail?.message) {
        message = err.response.data.detail.message;
      }
      setSubmitError(message);
    } finally {
      setLoading(false);
    }
  };

  const renderBreaks = (day: DaySchedule, dayIndex: number) => {
    const breaks = day.break_times ?? [];
    const errs = dayErrors[day.day_of_week]?.breaks ?? {};
    const canAddBreak = Boolean(day.opening_time && day.closing_time);

    return (
      <div className="breaks-section">
        <div className="breaks-header">
          <span className="breaks-label">{t("breaks")}</span>
          <button
            type="button"
            className="add-break-button"
            onClick={() => handleAddBreak(dayIndex)}
            disabled={!canAddBreak}
            aria-label={t("addBreak")}
            title={!canAddBreak ? t("setOpeningClosingFirst") : undefined}
          >
            + {t("addBreak")}
          </button>
        </div>

        {breaks.length === 0 ? (
          <p className="breaks-empty">{t("noBreaksHelp")}</p>
        ) : (
          <ul className="break-list">
            {breaks.map((br, idx) => (
              <li key={idx} className={`break-item ${errs[idx] ? "has-error" : ""}`}>
                <div className="break-time-inputs">
                  <div className="time-input-group">
                    <label htmlFor={`break-start-${dayIndex}-${idx}`}>
                      {t("breakStart")}
                    </label>
                    <input
                      id={`break-start-${dayIndex}-${idx}`}
                      type="time"
                      value={br.break_start}
                      min={day.opening_time || undefined}
                      max={day.closing_time || undefined}
                      onChange={(e) =>
                        handleBreakChange(dayIndex, idx, "break_start", e.target.value)
                      }
                    />
                  </div>
                  <div className="time-input-group">
                    <label htmlFor={`break-end-${dayIndex}-${idx}`}>
                      {t("breakEnd")}
                    </label>
                    <input
                      id={`break-end-${dayIndex}-${idx}`}
                      type="time"
                      value={br.break_end}
                      min={br.break_start || day.opening_time || undefined}
                      max={day.closing_time || undefined}
                      onChange={(e) =>
                        handleBreakChange(dayIndex, idx, "break_end", e.target.value)
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="remove-break-button"
                    onClick={() => handleRemoveBreak(dayIndex, idx)}
                    aria-label={t("removeBreak")}
                    title={t("removeBreak")}
                  >
                    ×
                  </button>
                </div>
                {errs[idx] && <div className="error-text">{errs[idx]}</div>}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="business-schedule-page">
      <div className="business-schedule-header">
        {onBack && (
          <button
            type="button"
            className="back-button"
            onClick={onBack}
            aria-label={t("back")}
          >
            ←
          </button>
        )}
        <div className="header-content">
          <h1 className="business-schedule-title">{t("businessSchedule")}</h1>
          <p className="business-schedule-subtitle">{t("setBusinessHours")}</p>
        </div>
      </div>

      <form className="business-schedule-form" onSubmit={handleSubmit} noValidate>
        <div className="business-schedule-form-fields">
          <div className="form-field-wrapper">
            <div className="always-open-row">
              <label className="form-label" htmlFor="reg-always-open-toggle">
                {t("alwaysOpen")}
              </label>
              <label className="toggle-switch">
                <input
                  id="reg-always-open-toggle"
                  type="checkbox"
                  checked={isAlwaysOpen}
                  onChange={(e) => handleAlwaysOpenToggle(e.target.checked)}
                />
                <span className="toggle-track" />
              </label>
            </div>
          </div>

          {!isAlwaysOpen && (
            <>
              <div className="form-field-wrapper">
                <label className="form-label">{t("selectDays")} *</label>
                <div
                  className={`day-selection ${touched && globalError ? "error" : ""}`}
                >
                  <div className="day-buttons">
                    {schedule.map((day, index) => (
                      <button
                        key={day.day_of_week}
                        type="button"
                        className={`day-button ${day.is_open ? "selected" : ""}`}
                        onClick={() => handleDayToggle(index)}
                        aria-pressed={day.is_open}
                      >
                        {day.day_name}
                      </button>
                    ))}
                  </div>
                  {touched && globalError && (
                    <div className="error-text">{globalError}</div>
                  )}
                </div>
              </div>

              {schedule.some((day) => day.is_open) && (
                <div className="time-selection-section">
                  <label className="form-label">{t("businessHours")}</label>
                  <div className="time-slots">
                    {schedule.map((day, index) => {
                      if (!day.is_open) return null;
                      const dayErr = dayErrors[day.day_of_week];
                      return (
                        <div key={day.day_of_week} className="time-slot">
                          <div className="day-name">{day.day_name}</div>
                          <div className="time-inputs">
                            <div className="time-input-group">
                              <label htmlFor={`open-${index}`}>{t("openingTime")}</label>
                              <input
                                id={`open-${index}`}
                                type="time"
                                value={day.opening_time}
                                onChange={(e) =>
                                  handleTimeChange(index, "opening_time", e.target.value)
                                }
                                required
                              />
                            </div>
                            <div className="time-input-group">
                              <label htmlFor={`close-${index}`}>{t("closingTime")}</label>
                              <input
                                id={`close-${index}`}
                                type="time"
                                value={day.closing_time}
                                min={day.opening_time || undefined}
                                onChange={(e) =>
                                  handleTimeChange(index, "closing_time", e.target.value)
                                }
                                required
                              />
                            </div>
                          </div>
                          {touched && dayErr?.range && (
                            <div className="error-text">{dayErr.range}</div>
                          )}
                          {renderBreaks(day, index)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {submitError && (
          <div className="submit-error" role="alert">
            {submitError}
          </div>
        )}

        <div className="business-schedule-form-action">
          {onBack && (
            <Button
              type="button"
              text={t("back")}
              color="transparent"
              onClick={onBack}
              className="back-button-action"
              disabled={loading}
            />
          )}
          <Button
            type="submit"
            text={loading ? t("saving") : t("next")}
            color="blue"
            onClick={handleSubmit}
            disabled={loading}
          />
        </div>
      </form>
    </div>
  );
}
