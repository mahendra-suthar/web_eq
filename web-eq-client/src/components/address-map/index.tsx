import React, { useEffect, useRef, useState } from "react";
import { useLayoutContext } from "../../layouts/general-layout";
import "./address-map.scss";

interface AddressMapProps {
  onLocationSelect: (data: {
    latitude: number;
    longitude: number;
    address?: string;
  }) => void;
  initialLatitude?: number;
  initialLongitude?: number;
  accessToken: string;
}

declare global {
  interface Window {
    mapboxgl: any;
  }
}

export default function AddressMap({
  onLocationSelect,
  initialLatitude,
  initialLongitude,
  accessToken,
}: AddressMapProps) {
  const { t } = useLayoutContext();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!mapContainer.current || !accessToken) return;

    // Load Mapbox GL JS script
    if (window.mapboxgl) {
      initializeMap();
      return;
    }

    // Check if script is already being loaded
    if (document.querySelector('script[src*="mapbox-gl"]')) {
      const checkMapbox = setInterval(() => {
        if (window.mapboxgl) {
          clearInterval(checkMapbox);
          initializeMap();
        }
      }, 100);
      return () => clearInterval(checkMapbox);
    }

    // Load Mapbox GL JS CSS
    const cssLink = document.createElement("link");
    cssLink.href = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.css";
    cssLink.rel = "stylesheet";
    document.head.appendChild(cssLink);

    // Load Mapbox GL JS script
    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v2.15.0/mapbox-gl.js";
    script.async = true;

    script.onload = () => {
      initializeMap();
    };

    script.onerror = () => {
      setError("Failed to load Mapbox GL JS");
      setIsLoaded(false);
    };

    document.head.appendChild(script);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [accessToken]);

  // Update map and marker when props change
  useEffect(() => {
    if (!mapRef.current || !isLoaded || !initialLatitude || !initialLongitude) return;

    // Fly to new location
    mapRef.current.flyTo({
      center: [initialLongitude, initialLatitude],
      zoom: 15,
      essential: true
    });

    // Update or create marker
    if (markerRef.current) {
      markerRef.current.setLngLat([initialLongitude, initialLatitude]);
    } else {
      markerRef.current = new window.mapboxgl.Marker({
        draggable: true,
        color: "#2196F3",
      })
        .setLngLat([initialLongitude, initialLatitude])
        .addTo(mapRef.current);

      markerRef.current.on("dragend", () => {
        const lngLat = markerRef.current.getLngLat();
        handleLocationSelect(lngLat.lat, lngLat.lng);
      });
    }
  }, [isLoaded, initialLatitude, initialLongitude]);

  const initializeMap = () => {
    if (!mapContainer.current || !window.mapboxgl) return;

    try {
      window.mapboxgl.accessToken = accessToken;

      // Initialize map
      const map = new window.mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: initialLongitude && initialLatitude
          ? [initialLongitude, initialLatitude]
          : [77.5946, 12.9716], // Default to Bangalore, India
        zoom: initialLatitude && initialLongitude ? 15 : 12,
      });

      map.on("load", () => {
        setIsLoaded(true);
        setError("");
      });

      // Add marker if initial location is provided
      if (initialLatitude && initialLongitude) {
        markerRef.current = new window.mapboxgl.Marker({
          draggable: true,
          color: "#2196F3",
        })
          .setLngLat([initialLongitude, initialLatitude])
          .addTo(map);

        markerRef.current.on("dragend", () => {
          const lngLat = markerRef.current.getLngLat();
          handleLocationSelect(lngLat.lat, lngLat.lng);
        });
      }

      // Handle map click
      map.on("click", (e: any) => {
        const { lng, lat } = e.lngLat;

        // Remove existing marker
        if (markerRef.current) {
          markerRef.current.remove();
        }

        // Add new marker at clicked location
        markerRef.current = new window.mapboxgl.Marker({
          draggable: true,
          color: "#2196F3",
        })
          .setLngLat([lng, lat])
          .addTo(map);

        // Handle location select
        handleLocationSelect(lat, lng);

        // Handle marker drag
        markerRef.current.on("dragend", () => {
          const lngLat = markerRef.current.getLngLat();
          handleLocationSelect(lngLat.lat, lngLat.lng);
        });
      });

      mapRef.current = map;
    } catch (err: any) {
      console.error("Error initializing map:", err);
      setError("Failed to initialize map");
      setIsLoaded(false);
    }
  };

  const handleLocationSelect = async (latitude: number, longitude: number) => {
    try {
      // Reverse geocode to get address
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;
      const params = new URLSearchParams({
        access_token: accessToken,
        limit: "1",
      });

      const response = await fetch(`${url}?${params.toString()}`);
      const data = await response.json();

      const address = data.features?.[0]?.place_name || "";

      onLocationSelect({
        latitude,
        longitude,
        address,
      });
    } catch (err) {
      console.error("Error reverse geocoding:", err);
      // Still call onLocationSelect even if reverse geocoding fails
      onLocationSelect({
        latitude,
        longitude,
      });
    }
  };

  return (
    <div className="address-map-container">
      <label className="form-label">{t("selectLocationOnMap") || "Select Location on Map"}</label>
      <div className="map-wrapper">
        <div ref={mapContainer} className="map-container" />
        {!isLoaded && !error && (
          <div className="map-loading">
            {t("loadingMap") || "Loading map..."}
          </div>
        )}
        {error && (
          <div className="map-error">
            {error}
          </div>
        )}
      </div>
      <p className="map-hint">
        {t("mapHint") || "Click on the map to select a location. You can drag the marker to adjust the position."}
      </p>
    </div>
  );
}

