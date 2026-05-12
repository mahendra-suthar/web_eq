import React, { useState } from "react";
import { useLayoutContext } from "../../../../layouts/general-layout";
import Button from "../../../../components/button";
import AddressSearch from "../../../../components/address-search";
import { AddressData } from "../../../../utils/businessRegistrationStore";
import "./business-location.scss";

import { toast } from "react-toastify";
import { addressService } from "../../../../services/address/address.service";

interface BusinessLocationProps {
  onNext: (data: { address: AddressData }) => void;
  onBack?: () => void;
  initialData?: AddressData;
  businessId: string | null;
}

export default function BusinessLocation({
  onNext,
  onBack,
  initialData,
  businessId,
}: BusinessLocationProps) {
  const { t } = useLayoutContext();
  const [loading, setLoading] = useState(false);

  const [unitNumber, setUnitNumber] = useState<string>(initialData?.unit_number || "");
  const [building, setBuilding] = useState<string>(initialData?.building || "");
  const [floor, setFloor] = useState<string>(initialData?.floor || "");
  const [street1, setStreet1] = useState<string>(initialData?.street_1 || "");
  const [street2, setStreet2] = useState<string>(initialData?.street_2 || "");
  const [city, setCity] = useState<string>(initialData?.city || "");
  const [district, setDistrict] = useState<string>(initialData?.district || "");
  const [state, setState] = useState<string>(initialData?.state || "");
  const [postalCode, setPostalCode] = useState<string>(initialData?.postal_code || "");
  const [country, setCountry] = useState<string>(initialData?.country || "INDIA");
  const [latitude, setLatitude] = useState<string>(initialData?.latitude?.toString() || "");
  const [longitude, setLongitude] = useState<string>(initialData?.longitude?.toString() || "");

  const [errors, setErrors] = useState<{
    street_1?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    latitude?: string;
    longitude?: string;
  }>({});

  const [touched, setTouched] = useState<{
    street_1: boolean;
    city: boolean;
    state: boolean;
    postal_code: boolean;
  }>({
    street_1: false,
    city: false,
    state: false,
    postal_code: false,
  });

  const validateField = (field: string, value: string): boolean => {
    const newErrors = { ...errors };

    switch (field) {
      case "street_1":
        if (!value || !value.trim()) {
          newErrors.street_1 = t("enterStreet1");
        } else {
          delete newErrors.street_1;
        }
        break;

      case "city":
        if (!value || !value.trim()) {
          newErrors.city = t("enterCity");
        } else {
          delete newErrors.city;
        }
        break;

      case "state":
        if (!value || !value.trim()) {
          newErrors.state = t("enterState");
        } else {
          delete newErrors.state;
        }
        break;

      case "postal_code":
        if (!value || !value.trim()) {
          newErrors.postal_code = t("enterPostalCode");
        } else if (!/^\d{6}$/.test(value)) {
          newErrors.postal_code = t("invalidPostalCode");
        } else {
          delete newErrors.postal_code;
        }
        break;

      case "latitude":
        if (value) {
          const lat = parseFloat(value);
          if (isNaN(lat) || lat < -90 || lat > 90) {
            newErrors.latitude = t("invalidLatitude");
          } else {
            delete newErrors.latitude;
          }
        }
        break;

      case "longitude":
        if (value) {
          const lon = parseFloat(value);
          if (isNaN(lon) || lon < -180 || lon > 180) {
            newErrors.longitude = t("invalidLongitude");
          } else {
            delete newErrors.longitude;
          }
        }
        break;
    }

    setErrors(newErrors);
    return !newErrors[field as keyof typeof newErrors];
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const value =
      field === "street_1"
        ? street1
        : field === "city"
          ? city
          : field === "state"
            ? state
            : field === "postal_code"
              ? postalCode
              : field === "latitude"
                ? latitude
                : longitude;
    validateField(field, value);
  };

  const handleAddressSelect = (addressData: {
    street_1: string;
    city: string;
    district?: string;
    state: string;
    postal_code: string;
    country: string;
    latitude?: number;
    longitude?: number;
  }) => {
    setStreet1(addressData.street_1);
    setCity(addressData.city);
    setDistrict(addressData.district || "");
    setState(addressData.state);
    setPostalCode(addressData.postal_code);
    setCountry(addressData.country);

    if (addressData.latitude !== undefined) {
      setLatitude(addressData.latitude.toString());
    }
    if (addressData.longitude !== undefined) {
      setLongitude(addressData.longitude.toString());
    }

    // Mark fields as touched since they now have values
    setTouched({
      street_1: true,
      city: true,
      state: true,
      postal_code: true,
    });

    // Clear any existing errors
    setErrors({});
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Mark required fields as touched
    setTouched({
      street_1: true,
      city: true,
      state: true,
      postal_code: true,
    });

    // Validate required fields
    const isValid =
      validateField("street_1", street1) &&
      validateField("city", city) &&
      validateField("state", state) &&
      validateField("postal_code", postalCode) &&
      (!latitude || validateField("latitude", latitude)) &&
      (!longitude || validateField("longitude", longitude));

    if (!isValid) {
      return;
    }

    const addressData = {
      unit_number: unitNumber.trim() || undefined,
      building: building.trim() || undefined,
      floor: floor.trim() || undefined,
      street_1: street1.trim(),
      street_2: street2.trim() || undefined,
      city: city.trim(),
      district: district.trim() || undefined,
      state: state.trim(),
      postal_code: postalCode.trim(),
      country: country.trim(),
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
    };

    if (businessId) {
      setLoading(true);
      try {
        await addressService.createAddress("BUSINESS", businessId, {
          ...addressData,
          address_type: "WORK"
        });
        toast.success("Address saved successfully");
        onNext({ address: addressData });
      } catch (error) {
        console.error("Error saving address:", error);
        toast.error("Failed to save address. Please try again.");
      } finally {
        setLoading(false);
      }
    } else {
      onNext({ address: addressData });
    }
  };

  return (
    <div className="business-location-page">
      <div className="business-location-header">
        {onBack && (
          <button className="back-button" onClick={onBack}>
            ←
          </button>
        )}
        <div className="header-content">
          <h1 className="business-location-title">{t("businessLocation")}</h1>
          <p className="business-location-subtitle">{t("enterBusinessAddress")}</p>
        </div>
      </div>

      <form className="business-location-form" onSubmit={handleSubmit}>
        <div className="business-location-form-fields">
          {/* Address Search Component */}
          <AddressSearch
            onAddressSelect={handleAddressSelect}
            initialValue={initialData?.street_1 || ""}
          />

          {/* Unit Number */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("unitNumber")}</label>
            <div className="form-field">
              <input
                type="text"
                placeholder={t("enterUnitNumber")}
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
              />
            </div>
          </div>

          {/* Building */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("building")}</label>
            <div className="form-field">
              <input
                type="text"
                placeholder={t("enterBuilding")}
                value={building}
                onChange={(e) => setBuilding(e.target.value)}
              />
            </div>
          </div>

          {/* Floor */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("floor")}</label>
            <div className="form-field">
              <input
                type="text"
                placeholder={t("enterFloor")}
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
              />
            </div>
          </div>

          {/* Street 1 */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("street1")} *</label>
            <div className={`form-field ${touched.street_1 && errors.street_1 ? "error" : ""}`}>
              <input
                type="text"
                placeholder={t("enterStreet1")}
                value={street1}
                onChange={(e) => {
                  setStreet1(e.target.value);
                  if (touched.street_1) {
                    validateField("street_1", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("street_1")}
              />
              {touched.street_1 && errors.street_1 && (
                <div className="error-text">{errors.street_1}</div>
              )}
            </div>
          </div>

          {/* Street 2 */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("street2")}</label>
            <div className="form-field">
              <input
                type="text"
                placeholder={t("enterStreet2")}
                value={street2}
                onChange={(e) => setStreet2(e.target.value)}
              />
            </div>
          </div>

          {/* City */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("city")} *</label>
            <div className={`form-field ${touched.city && errors.city ? "error" : ""}`}>
              <input
                type="text"
                placeholder={t("enterCity")}
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  if (touched.city) {
                    validateField("city", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("city")}
              />
              {touched.city && errors.city && (
                <div className="error-text">{errors.city}</div>
              )}
            </div>
          </div>

          {/* District */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("district")}</label>
            <div className="form-field">
              <input
                type="text"
                placeholder={t("enterDistrict")}
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </div>
          </div>

          {/* State */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("state")} *</label>
            <div className={`form-field ${touched.state && errors.state ? "error" : ""}`}>
              <input
                type="text"
                placeholder={t("enterState")}
                value={state}
                onChange={(e) => {
                  setState(e.target.value);
                  if (touched.state) {
                    validateField("state", e.target.value);
                  }
                }}
                onBlur={() => handleBlur("state")}
              />
              {touched.state && errors.state && (
                <div className="error-text">{errors.state}</div>
              )}
            </div>
          </div>

          {/* Postal Code */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("postalCode")} *</label>
            <div className={`form-field ${touched.postal_code && errors.postal_code ? "error" : ""}`}>
              <input
                type="text"
                placeholder={t("enterPostalCode")}
                value={postalCode}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPostalCode(value);
                  if (touched.postal_code) {
                    validateField("postal_code", value);
                  }
                }}
                onBlur={() => handleBlur("postal_code")}
                maxLength={6}
              />
              {touched.postal_code && errors.postal_code && (
                <div className="error-text">{errors.postal_code}</div>
              )}
            </div>
          </div>

          {/* Country */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("country")}</label>
            <div className="form-field">
              <input
                type="text"
                placeholder={t("enterCountry")}
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>

          {/* Latitude */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("latitude")}</label>
            <div className={`form-field ${errors.latitude ? "error" : ""}`}>
              <input
                type="number"
                step="any"
                placeholder={t("enterLatitude")}
                value={latitude}
                onChange={(e) => {
                  setLatitude(e.target.value);
                  if (e.target.value) {
                    validateField("latitude", e.target.value);
                  }
                }}
                onBlur={() => {
                  if (latitude) {
                    validateField("latitude", latitude);
                  }
                }}
              />
              {errors.latitude && (
                <div className="error-text">{errors.latitude}</div>
              )}
            </div>
          </div>

          {/* Longitude */}
          <div className="form-field-wrapper">
            <label className="form-label">{t("longitude")}</label>
            <div className={`form-field ${errors.longitude ? "error" : ""}`}>
              <input
                type="number"
                step="any"
                placeholder={t("enterLongitude")}
                value={longitude}
                onChange={(e) => {
                  setLongitude(e.target.value);
                  if (e.target.value) {
                    validateField("longitude", e.target.value);
                  }
                }}
                onBlur={() => {
                  if (longitude) {
                    validateField("longitude", longitude);
                  }
                }}
              />
              {errors.longitude && (
                <div className="error-text">{errors.longitude}</div>
              )}
            </div>
          </div>
        </div>

        <div className="business-location-form-action">
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
            color="blue"
            onClick={handleSubmit}
            disabled={loading}
          />
        </div>
      </form>
    </div>
  );
}
