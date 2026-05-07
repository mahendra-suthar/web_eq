import React, { useRef, useState, useEffect, useCallback } from "react";
import { useLayoutContext } from "../../layouts/general-layout";
import { getMapboxToken } from "../../configs/config";
import AddressMap from "../address-map";
import "./address-search.scss";

interface AddressFeature {
  id: string;
  type: string;
  place_type: string[];
  relevance: number;
  address?: string; // house number for address-type results (top-level field)
  text: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  properties: {
    accuracy?: string;
    address?: string; // street address for POI-type results
    category?: string;
    maki?: string;
    wikidata?: string;
    short_code?: string;
  };
  context?: Array<{
    id: string;
    short_code?: string;
    wikidata?: string;
    text: string;
  }>;
}

interface ParsedAddress {
  street_1: string;
  city: string;
  district?: string;
  state: string;
  postal_code: string;
  country: string;
}

interface AddressSearchProps {
  onAddressSelect: (addressData: ParsedAddress & {
    latitude?: number;
    longitude?: number;
  }) => void;
  initialValue?: string;
}

function parseContext(feature: AddressFeature) {
  let city = "";
  let district = "";
  let state = "";
  let postalCode = "";
  let country = "INDIA";
  let neighborhood = "";
  let locality = "";

  (feature.context || []).forEach((ctx) => {
    const id = ctx.id;
    if (id.startsWith("neighborhood")) neighborhood = ctx.text;
    else if (id.startsWith("locality")) locality = ctx.text;
    else if (id.startsWith("place")) city = ctx.text;
    else if (id.startsWith("district")) district = ctx.text;
    else if (id.startsWith("region")) state = ctx.text;
    else if (id.startsWith("postcode")) postalCode = ctx.text;
    else if (id.startsWith("country")) country = ctx.text.toUpperCase();
  });

  return { city, district, state, postalCode, country, neighborhood, locality };
}

function extractAddressFromFeature(feature: AddressFeature): ParsedAddress {
  const { city, district, state, postalCode, country, neighborhood, locality } =
    parseContext(feature);
  const placeType = feature.place_type[0];
  const area = locality || neighborhood;

  let street_1 = "";

  if (placeType === "poi") {
    // Society / POI: feature.text is the name, properties.address is the street it's on
    street_1 = feature.text;
    if (feature.properties?.address) {
      street_1 = `${street_1}, ${feature.properties.address}`;
    }
    if (area && !street_1.toLowerCase().includes(area.toLowerCase())) {
      street_1 = `${street_1}, ${area}`;
    }
  } else if (placeType === "address") {
    // Street address: top-level feature.address = house number, feature.text = street name
    street_1 = feature.address
      ? `${feature.address} ${feature.text}`
      : feature.text;
    if (area && !street_1.toLowerCase().includes(area.toLowerCase())) {
      street_1 = `${street_1}, ${area}`;
    }
  } else if (placeType === "neighborhood" || placeType === "locality") {
    // Area-level result — use the name as street_1
    street_1 = feature.text;
  } else {
    // place / district / region — derive street from the first part(s) of place_name
    const parts = feature.place_name.split(",").map((p) => p.trim());
    const known = new Set([city, state, district, postalCode, country].filter(Boolean));
    const firstUnknown = parts.find((p) => !known.has(p));
    street_1 = firstUnknown || feature.text;
  }

  return {
    street_1: street_1.trim(),
    city,
    district: district || undefined,
    state,
    postal_code: postalCode,
    country,
  };
}

// Split place_name into a bold primary and a muted secondary line
function splitPlaceName(feature: AddressFeature): { primary: string; secondary: string } {
  const name = feature.text;
  const rest = feature.place_name.startsWith(name)
    ? feature.place_name.slice(name.length).replace(/^,\s*/, "")
    : feature.place_name;
  return { primary: name, secondary: rest };
}

export default function AddressSearch({ onAddressSelect, initialValue = "" }: AddressSearchProps) {
  const { t } = useLayoutContext();
  const [searchValue, setSearchValue] = useState(initialValue);
  const [suggestions, setSuggestions] = useState<AddressFeature[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [showMap, setShowMap] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const searchAddresses = useCallback(async (query: string) => {
    const token = getMapboxToken();
    if (!token || !query.trim() || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
      const params = new URLSearchParams({
        access_token: token,
        country: "in",
        language: "en",
        types: "address,poi,district,locality,neighborhood,place",
        limit: "8",
        autocomplete: "true",
      });

      const response = await fetch(`${url}?${params.toString()}`);
      if (!response.ok) throw new Error(`Mapbox API error: ${response.status}`);

      const data = await response.json();
      setSuggestions(data.features || []);
      setShowSuggestions(true);
    } catch (err: any) {
      console.error("Error searching addresses:", err);
      setError(t("addressSearchFailed"));
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchValue(value);
    setError("");

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => searchAddresses(value), 300);
  };

  const handleSelectSuggestion = (feature: AddressFeature) => {
    setSearchValue(feature.place_name);
    setShowSuggestions(false);
    setSuggestions([]);

    const addressData = extractAddressFromFeature(feature);
    const [longitude, latitude] = feature.center;
    setSelectedLocation({ lat: latitude, lng: longitude });
    onAddressSelect({ ...addressData, latitude, longitude });
  };

  const handleMapLocationSelect = async (data: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => {
    setSelectedLocation({ lat: data.latitude, lng: data.longitude });

    const token = getMapboxToken();
    if (!token) return;

    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${data.longitude},${data.latitude}.json`;
      const params = new URLSearchParams({
        access_token: token,
        country: "in",
        language: "en",
        types: "address,poi,neighborhood,locality,place",
        limit: "1",
      });

      const response = await fetch(`${url}?${params.toString()}`);
      const geocodeData = await response.json();

      if (geocodeData.features?.length > 0) {
        const feature = geocodeData.features[0];
        setSearchValue(feature.place_name || data.address || "");
        const addressData = extractAddressFromFeature(feature);
        onAddressSelect({ ...addressData, latitude: data.latitude, longitude: data.longitude });
      } else {
        onAddressSelect({
          street_1: data.address || "",
          city: "",
          state: "",
          postal_code: "",
          country: "INDIA",
          latitude: data.latitude,
          longitude: data.longitude,
        });
      }
    } catch {
      onAddressSelect({
        street_1: data.address || "",
        city: "",
        state: "",
        postal_code: "",
        country: "INDIA",
        latitude: data.latitude,
        longitude: data.longitude,
      });
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const token = getMapboxToken();

  return (
    <div className="address-search-container">
      <div className="address-search-header">
        <label className="form-label">{t("searchAddress")}</label>
        <div className="address-map-toggle-row">
          <span className="address-map-toggle-label">{t("showMap")}</span>
          <label className="toggle-switch">
            <input
              type="checkbox"
              checked={showMap}
              onChange={() => setShowMap((v) => !v)}
            />
            <span className="toggle-track" />
          </label>
        </div>
      </div>

      {showMap && token && (
        <AddressMap
          onLocationSelect={handleMapLocationSelect}
          initialLatitude={selectedLocation?.lat}
          initialLongitude={selectedLocation?.lng}
          accessToken={token}
        />
      )}

      <div className="address-search-input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="address-search-input"
          placeholder={t("enterAddressToSearch")}
          value={searchValue}
          onChange={handleInputChange}
          onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
          autoComplete="off"
          id="address-autocomplete-input"
        />
        <span className="search-icon">
          {loading ? (
            <svg className="search-spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
          )}
        </span>

        {showSuggestions && suggestions.length > 0 && (
          <div ref={suggestionsRef} className="address-suggestions">
            {suggestions.map((feature) => {
              const { primary, secondary } = splitPlaceName(feature);
              const placeType = feature.place_type[0];
              return (
                <div
                  key={feature.id}
                  className="suggestion-item"
                  onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(feature); }}
                >
                  <span className={`suggestion-type-badge suggestion-type-badge--${placeType}`}>
                    {placeType === "poi" ? "Place" : placeType === "address" ? "Address" : placeType === "neighborhood" || placeType === "locality" ? "Area" : "City"}
                  </span>
                  <div className="suggestion-content">
                    <div className="suggestion-primary">{primary}</div>
                    {secondary && <div className="suggestion-secondary">{secondary}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="address-search-hint">{t("addressSearchHint")}</p>

      {!token ? (
        <p className="address-search-error">{t("addressSearchUnavailable")}</p>
      ) : error ? (
        <p className="address-search-error">{error}</p>
      ) : null}
    </div>
  );
}
