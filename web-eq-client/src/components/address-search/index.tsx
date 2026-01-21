import React, { useRef, useState, useEffect, useCallback } from "react";
import { useLayoutContext } from "../../layouts/general-layout";
import { getConfig } from "../../configs/config";
import AddressMap from "../address-map";
import "./address-search.scss";

interface AddressFeature {
  id: string;
  type: string;
  place_type: string[];
  relevance: number;
  properties: {
    accuracy?: string;
    address?: string;
    category?: string;
    maki?: string;
    wikidata?: string;
    short_code?: string;
  };
  text: string;
  place_name: string;
  center: [number, number]; // [longitude, latitude]
  geometry: {
    type: string;
    coordinates: [number, number];
  };
  context?: Array<{
    id: string;
    short_code?: string;
    wikidata?: string;
    text: string;
  }>;
}

interface AddressSearchProps {
  onAddressSelect: (addressData: {
    street_1: string;
    city: string;
    district?: string;
    state: string;
    postal_code: string;
    country: string;
    latitude?: number;
    longitude?: number;
  }) => void;
  initialValue?: string;
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

  const getMapboxToken = (): string => {
    try {
      const configData = getConfig();
      const token = (configData as any).MAPBOX_ACCESS_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || "";
      return token === "YOUR_MAPBOX_ACCESS_TOKEN_HERE" ? "" : token;
    } catch (error) {
      console.error("Error loading Mapbox token:", error);
      return "";
    }
  };

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
      // Mapbox Geocoding API endpoint
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
      const params = new URLSearchParams({
        access_token: token,
        country: "in", // Restrict to India, remove this for worldwide
        types: "address,poi,district,locality,neighborhood,place", // Search for addresses, POIs, and areas
        limit: "5", // Limit to 5 suggestions
        autocomplete: "true",
      });

      const response = await fetch(`${url}?${params.toString()}`);

      if (!response.ok) {
        throw new Error(`Mapbox API error: ${response.status}`);
      }

      const data = await response.json();
      setSuggestions(data.features || []);
      setShowSuggestions(true);
    } catch (err: any) {
      console.error("Error searching addresses:", err);
      setError("Failed to search addresses. Please check your Mapbox token.");
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

    // Debounce the search
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = window.setTimeout(() => {
      searchAddresses(value);
    }, 300); // Wait 300ms after user stops typing
  };

  // Helper function to extract full address from Mapbox feature
  const extractAddressFromFeature = (feature: AddressFeature) => {
    const context = feature.context || [];
    let city = "";
    let district = "";
    let state = "";
    let postalCode = "";
    let country = "INDIA";
    let neighborhood = "";
    let poi = ""; // Point of Interest (building/society name)
    let locality = "";

    // Parse context array to extract all address components
    context.forEach((ctx) => {
      const ctxId = ctx.id;
      if (ctxId.startsWith("place")) {
        city = ctx.text;
      } else if (ctxId.startsWith("neighborhood")) {
        neighborhood = ctx.text;
      } else if (ctxId.startsWith("locality")) {
        locality = ctx.text;
      } else if (ctxId.startsWith("poi")) {
        poi = ctx.text;
      } else if (ctxId.startsWith("district")) {
        district = ctx.text;
      } else if (ctxId.startsWith("region")) {
        state = ctx.text;
      } else if (ctxId.startsWith("postcode")) {
        postalCode = ctx.text;
      } else if (ctxId.startsWith("country")) {
        country = ctx.text.toUpperCase();
      }
    });

    // Parse place_name to extract full street address
    // Mapbox place_name format: "Main Name, Street Address, Area, City, State Postal Code, Country"
    const placeNameParts = feature.place_name.split(",").map((p) => p.trim());

    // Determine street address: combine POI, neighborhood, and street information
    let streetAddress = "";

    // If we have POI (building/society name), include it
    if (poi) {
      streetAddress = poi;
    }

    // Use feature.properties.address if available (more reliable)
    if (feature.properties?.address) {
      if (streetAddress) {
        streetAddress = `${streetAddress}, ${feature.properties.address}`;
      } else {
        streetAddress = feature.properties.address;
      }
    } else if (feature.text) {
      // If no address property, use the main text (usually street name/number or POI name)
      if (streetAddress && !streetAddress.includes(feature.text)) {
        streetAddress = `${streetAddress}, ${feature.text}`;
      } else if (!streetAddress) {
        streetAddress = feature.text;
      }
    }

    // If we have neighborhood or locality but not POI, include it
    const areaName = neighborhood || locality;
    if (areaName && !streetAddress.includes(areaName)) {
      // Check if area is already part of the address
      const parts = placeNameParts.filter(p =>
        p !== city &&
        p !== state &&
        p !== postalCode &&
        p !== country &&
        (!district || p !== district)
      );
      // Add area if not already in the first parts
      if (parts.length > 1 && !parts.slice(0, 2).some(p => p === areaName)) {
        if (streetAddress) {
          streetAddress = `${streetAddress}, ${areaName}`;
        } else {
          streetAddress = areaName;
        }
      }
    }

    // Fallback: if still no street address, use first part of place_name
    if (!streetAddress || streetAddress.trim() === "") {
      // Get all parts before city
      const cityIndex = placeNameParts.findIndex(p =>
        p === city ||
        p.toLowerCase().includes(city.toLowerCase()) ||
        p.toLowerCase().includes(state.toLowerCase())
      );
      if (cityIndex > 0) {
        streetAddress = placeNameParts.slice(0, cityIndex).join(", ");
      } else {
        streetAddress = placeNameParts[0] || feature.text || "";
      }
    }

    return {
      street_1: streetAddress.trim(),
      city: city || "",
      district: district || undefined,
      state: state || "",
      postal_code: postalCode || "",
      country: country,
    };
  };

  const handleSelectSuggestion = (feature: AddressFeature) => {
    setSearchValue(feature.place_name);
    setShowSuggestions(false);
    setSuggestions([]);

    // Extract address components using the helper function
    const addressData = extractAddressFromFeature(feature);

    // Get coordinates (Mapbox returns [longitude, latitude])
    const [longitude, latitude] = feature.center;

    // Update selected location for map
    setSelectedLocation({ lat: latitude, lng: longitude });

    // Call the callback with extracted address data
    onAddressSelect({
      ...addressData,
      latitude: latitude,
      longitude: longitude,
    });
  };

  const handleMapLocationSelect = async (data: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => {
    setSelectedLocation({ lat: data.latitude, lng: data.longitude });

    // Reverse geocode to get detailed address components
    const token = getMapboxToken();
    if (!token) return;

    try {
      // Use multiple types to get better results (don't restrict to just "address")
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${data.longitude},${data.latitude}.json`;
      const params = new URLSearchParams({
        access_token: token,
        country: "in",
        limit: "1",
        // Don't restrict to just "address" - allow POI and other types for better results
      });

      const response = await fetch(`${url}?${params.toString()}`);
      const geocodeData = await response.json();

      if (geocodeData.features && geocodeData.features.length > 0) {
        const feature = geocodeData.features[0];
        setSearchValue(feature.place_name || data.address || "");

        // Use the same helper function to extract address
        const addressData = extractAddressFromFeature(feature);

        onAddressSelect({
          ...addressData,
          latitude: data.latitude,
          longitude: data.longitude,
        });
      } else {
        // Fallback: use coordinates only
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
    } catch (err) {
      console.error("Error reverse geocoding:", err);
      // Fallback: use coordinates only
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

  // Handle click outside to close suggestions
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
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const token = getMapboxToken();

  return (
    <div className="address-search-container">
      <div className="address-search-header">
        <label className="form-label">{t("searchAddress")}</label>
        <button
          type="button"
          className="toggle-map-button"
          onClick={() => setShowMap(!showMap)}
        >
          {showMap ? (t("hideMap") || "Hide Map") : (t("showMap") || "Show Map")}
        </button>
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
          onFocus={() => {
            if (suggestions.length > 0) {
              setShowSuggestions(true);
            }
          }}
          autoComplete="off"
          id="address-autocomplete-input"
        />
        <span className="search-icon">
          {loading ? "⏳" : "🔍"}
        </span>
        {showSuggestions && suggestions.length > 0 && (
          <div ref={suggestionsRef} className="address-suggestions">
            {suggestions.map((feature) => (
              <div
                key={feature.id}
                className="suggestion-item"
                onClick={() => handleSelectSuggestion(feature)}
              >
                <div className="suggestion-text">{feature.place_name}</div>
                {feature.properties.address && (
                  <div className="suggestion-address">{feature.properties.address}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="address-search-hint">
        {t("addressSearchHint")}
      </p>
      {!getMapboxToken() ? (
        <p className="address-search-error">
          Mapbox access token not configured. Please add MAPBOX_ACCESS_TOKEN to config.json
        </p>
      ) : error ? (
        <p className="address-search-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
