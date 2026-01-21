import React, { useState } from "react";
import { useLayoutContext } from "../../../../layouts/general-layout";
import Button from "../../../../components/button";
import { DaySchedule } from "../../index";
import { BusinessService, ScheduleInput } from "../../../../services/business/business.service";
import { DayOfWeek, DAYS_IN_WEEK, DAYS_OF_WEEK } from "../../../../utils/scheduleConstants";
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

export default function BusinessSchedule({
  onNext,
  onBack,
  businessId,
  initialData,
}: BusinessScheduleProps) {
  const { t } = useLayoutContext();
  const businessService = new BusinessService();
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

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
    }));
  };

  const getInitialSchedule = (): DaySchedule[] => {
    if (initialData?.schedule && initialData.schedule.length === DAYS_IN_WEEK) {
      return initialData.schedule;
    }
    return getDefaultSchedule();
  };

  const [schedule, setSchedule] = useState<DaySchedule[]>(getInitialSchedule());

  const [errors, setErrors] = useState<{ schedule?: string }>({});
  const [touched, setTouched] = useState<boolean>(false);

  const handleDayToggle = (dayIndex: number) => {
    const updatedSchedule = schedule.map((day, index) => {
      if (index === dayIndex) {
        return {
          ...day,
          is_open: !day.is_open,
          opening_time: !day.is_open ? "09:00" : "",
          closing_time: !day.is_open ? "18:00" : "",
        };
      }
      return day;
    });
    setSchedule(updatedSchedule);
    if (touched) {
      validateSchedule(updatedSchedule);
    }
  };

  const handleTimeChange = (
    dayIndex: number,
    field: "opening_time" | "closing_time",
    value: string
  ) => {
    const updatedSchedule = schedule.map((day, index) => {
      if (index === dayIndex) {
        return { ...day, [field]: value };
      }
      return day;
    });
    setSchedule(updatedSchedule);
    if (touched) {
      validateSchedule(updatedSchedule);
    }
  };

  const validateSchedule = (scheduleData: DaySchedule[]): boolean => {
    const hasOpenDays = scheduleData.some((day) => day.is_open);
    
    if (!isAlwaysOpen && !hasOpenDays) {
      setErrors({ schedule: t("selectAtLeastOneDay") });
      return false;
    }

    if (!isAlwaysOpen) {
      const invalidDays = scheduleData.filter(
        (day) =>
          day.is_open &&
          (!day.opening_time || !day.closing_time || day.opening_time >= day.closing_time)
      );

      if (invalidDays.length > 0) {
        setErrors({ schedule: t("invalidTimeRange") });
        return false;
      }
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setTouched(true);

    if (!isAlwaysOpen && !validateSchedule(schedule)) {
      return;
    }

    if (businessId) {
      setLoading(true);
      setError("");

      try {
        const scheduleInputs: ScheduleInput[] = schedule.map((day) => ({
          day_of_week: day.day_of_week,
          opening_time: day.is_open && day.opening_time ? day.opening_time : null,
          closing_time: day.is_open && day.closing_time ? day.closing_time : null,
          is_open: day.is_open,
        }));

        await businessService.createBusinessSchedules(
          businessId,
          scheduleInputs,
          isAlwaysOpen
        );

        onNext({
          is_always_open: isAlwaysOpen,
          schedule: schedule,
        });
      } catch (err: any) {
        let errorMessage = t("scheduleCreationFailed");
        
        if (err?.errorCode === "BUSINESS_NOT_FOUND") {
          errorMessage = t("businessNotFound");
        } else if (err?.message) {
          errorMessage = err.message;
        } else if (err?.response?.data?.detail?.message) {
          errorMessage = err.response.data.detail.message;
        }
        
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    } else {
      onNext({
        is_always_open: isAlwaysOpen,
        schedule: schedule,
      });
    }
  };

  return (
    <div className="business-schedule-page">
      <div className="business-schedule-header">
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ←
          </button>
        )}
        <div className="header-content">
          <h1 className="business-schedule-title">{t("businessSchedule")}</h1>
          <p className="business-schedule-subtitle">{t("setBusinessHours")}</p>
        </div>
      </div>

      <form className="business-schedule-form" onSubmit={handleSubmit}>
        <div className="business-schedule-form-fields">
          {/* Always Open Toggle */}
          <div className="form-field-wrapper">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isAlwaysOpen}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setIsAlwaysOpen(checked);
                  
                  if (checked) {
                    const alwaysOpenSchedule: DaySchedule[] = getDefaultSchedule().map((day) => ({
                      ...day,
                      is_open: true,
                    }));
                    setSchedule(alwaysOpenSchedule);
                    setErrors({});
                  } else {
                    setSchedule(getDefaultSchedule());
                    if (touched) {
                      validateSchedule(getDefaultSchedule());
                    }
                  }
                }}
              />
              <span>{t("alwaysOpen")}</span>
            </label>
          </div>

          {!isAlwaysOpen && (
            <>
              {/* Day Selection */}
              <div className="form-field-wrapper">
                <label className="form-label">{t("selectDays")} *</label>
                <div className={`day-selection ${touched && errors.schedule ? "error" : ""}`}>
                  <div className="day-buttons">
                    {schedule.map((day, index) => (
                      <button
                        key={day.day_of_week}
                        type="button"
                        className={`day-button ${day.is_open ? "selected" : ""}`}
                        onClick={() => handleDayToggle(index)}
                      >
                        {day.day_name}
                      </button>
                    ))}
                  </div>
                  {touched && errors.schedule && (
                    <div className="error-text">{errors.schedule}</div>
                  )}
                </div>
              </div>

              {/* Time Selection for Selected Days */}
              {schedule.some((day) => day.is_open) && (
                <div className="time-selection-section">
                  <label className="form-label">{t("businessHours")}</label>
                  <div className="time-slots">
                    {schedule.map(
                      (day, index) =>
                        day.is_open && (
                          <div key={day.day_of_week} className="time-slot">
                            <div className="day-name">{day.day_name}</div>
                            <div className="time-inputs">
                              <div className="time-input-group">
                                <label>{t("openingTime")}</label>
                                <input
                                  type="time"
                                  value={day.opening_time}
                                  onChange={(e) =>
                                    handleTimeChange(index, "opening_time", e.target.value)
                                  }
                                  required
                                />
                              </div>
                              <div className="time-input-group">
                                <label>{t("closingTime")}</label>
                                <input
                                  type="time"
                                  value={day.closing_time}
                                  onChange={(e) =>
                                    handleTimeChange(index, "closing_time", e.target.value)
                                  }
                                  required
                                />
                              </div>
                            </div>
                          </div>
                        )
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {error && (
          <div className="error-message" style={{ color: "red", marginBottom: "1rem", padding: "0.5rem" }}>
            {error}
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
