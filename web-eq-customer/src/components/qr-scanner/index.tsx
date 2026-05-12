import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import "./qr-scanner.scss";

interface QRScannerProps {
  onClose: () => void;
  onNavigate: (path: string) => void;
}

/** Only accept URLs that point to this same origin (prevents open-redirect). */
function resolveInternalPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.origin === window.location.origin) {
      return url.pathname + url.search + url.hash;
    }
    return null;
  } catch {
    if (/^\/(business|categories|search|profile)/.test(raw)) return raw;
    return null;
  }
}

/** Force the injected html5-qrcode elements to fill the container. */
function patchScannerStyles(containerId: string) {
  const root = document.getElementById(containerId);
  if (!root) return;

  const fill = (el: HTMLElement) => {
    el.style.setProperty("width", "100%", "important");
    el.style.setProperty("height", "100%", "important");
    el.style.setProperty("border", "none", "important");
    el.style.setProperty("padding", "0", "important");
    el.style.setProperty("margin", "0", "important");
    el.style.setProperty("background", "transparent", "important");
  };

  fill(root);
  root.querySelectorAll<HTMLElement>("div").forEach(fill);

  const video = root.querySelector<HTMLVideoElement>("video");
  if (video) {
    video.style.setProperty("position", "absolute", "important");
    video.style.setProperty("inset", "0", "important");
    video.style.setProperty("width", "100%", "important");
    video.style.setProperty("height", "100%", "important");
    video.style.setProperty("object-fit", "cover", "important");
    video.style.setProperty("border-radius", "0", "important");
  }
}

/** Stop a scanner instance exactly once, swallowing both sync throws and async rejections. */
async function safeStop(scanner: Html5Qrcode): Promise<void> {
  try {
    await scanner.stop();
  } catch {
    // scanner was never started, already stopped, or DOM was removed — all safe to ignore
  }
}

/**
 * Try back camera first, then fall back to any available camera.
 * Only retries on OverconstrainedError (constraint can't be satisfied) —
 * permission denial, missing device, busy camera etc. are thrown immediately.
 */
async function startWithFallback(
  scanner: Html5Qrcode,
  onSuccess: (text: string) => void
): Promise<void> {
  const constraints: MediaTrackConstraints[] = [
    { facingMode: "environment" }, // back camera (preferred for QR)
    {},                             // any available camera
  ];

  let lastErr: unknown;
  for (const constraint of constraints) {
    try {
      await scanner.start(
        constraint,
        { fps: 10, qrbox: { width: 240, height: 240 } },
        onSuccess,
        () => { /* per-frame decode failures are normal — ignore */ }
      );
      return; // started successfully
    } catch (err) {
      lastErr = err;
      const name = (err as any)?.name ?? "";
      // Only fall back on constraint errors — anything else is a hard failure
      if (name !== "OverconstrainedError" && name !== "ConstraintNotSatisfiedError") {
        throw err;
      }
    }
  }
  throw lastErr; // all constraints exhausted
}

/** Map browser/device camera errors to clear, actionable messages. */
function cameraErrorMessage(err: unknown): string {
  const name = (err as any)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Camera access denied. Go to Chrome Settings → Site Settings → Camera and allow this site.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera found on this device.";
    case "NotReadableError":
    case "TrackStartError":
      return "Camera is in use by another app. Close other apps using the camera and try again.";
    case "SecurityError":
      return "Camera requires a secure (HTTPS) connection.";
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      return "No suitable camera found on this device.";
    default:
      return "Could not start camera. Please try again.";
  }
}

export default function QRScanner({ onClose, onNavigate }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [error, setError] = useState<string>("");
  const [cameraReady, setCameraReady] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const scannedRef = useRef(false);
  const mountedRef = useRef(true);
  const stoppedRef = useRef(false);

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    stoppedRef.current = false;
    scannedRef.current = false;
    setCameraReady(false);

    const SCANNER_ID = "qr-fs-region";
    const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
    scannerRef.current = scanner;

    let rafId: number | null = null;

    const stopOnce = async () => {
      if (stoppedRef.current) return;
      stoppedRef.current = true;
      await safeStop(scanner);
    };

    const onSuccess = (decodedText: string) => {
      if (scannedRef.current) return;
      scannedRef.current = true;

      const path = resolveInternalPath(decodedText);
      if (!path) {
        scannedRef.current = false;
        if (mountedRef.current) setError("Not an EaseQueue QR code. Please try again.");
        return;
      }

      stopOnce().finally(() => {
        onNavigate(path);
        onClose();
      });
    };

    startWithFallback(scanner, onSuccess)
      .then(() => {
        if (!mountedRef.current) return;
        patchScannerStyles(SCANNER_ID);
        rafId = requestAnimationFrame(() => {
          if (mountedRef.current) patchScannerStyles(SCANNER_ID);
          rafId = null;
        });
        setCameraReady(true);
      })
      .catch((err) => {
        if (mountedRef.current) setError(cameraErrorMessage(err));
      });

    return () => {
      mountedRef.current = false;
      if (rafId !== null) cancelAnimationFrame(rafId);
      stopOnce();
    };
  }, [retryKey]); // retryKey re-runs the whole start sequence

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleRetry = () => {
    setError("");
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="qr-fs-overlay" role="dialog" aria-modal aria-label="Scan QR Code">

      {/* Camera feed — html5-qrcode mounts video inside here */}
      <div id="qr-fs-region" className="qr-fs-camera" />

      {/* Top bar — overlaid above the feed */}
      <div className="qr-fs-top-bar">
        <button className="qr-fs-close" onClick={onClose} aria-label="Close scanner">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <span className="qr-fs-title">Scan QR Code</span>
      </div>

      {/* Viewfinder corners + scan line */}
      {cameraReady && !error && (
        <div className="qr-fs-frame" aria-hidden>
          <span className="qr-fs-frame__corner qr-fs-frame__corner--tl" />
          <span className="qr-fs-frame__corner qr-fs-frame__corner--tr" />
          <span className="qr-fs-frame__corner qr-fs-frame__corner--bl" />
          <span className="qr-fs-frame__corner qr-fs-frame__corner--br" />
          <div className="qr-fs-frame__scan-line" />
        </div>
      )}

      {/* Hint */}
      {!error && (
        <div className="qr-fs-hint" aria-live="polite">
          {cameraReady ? "Point at an EaseQueue QR code" : "Starting camera…"}
        </div>
      )}

      {/* Error banner with retry */}
      {error && (
        <div className="qr-fs-error" role="alert">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span>{error}</span>
          <button className="qr-fs-retry" onClick={handleRetry}>Try again</button>
        </div>
      )}
    </div>
  );
}
