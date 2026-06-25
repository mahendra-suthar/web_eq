import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const GA_MEASUREMENT_ID = "G-0W9F9CW3P9";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

let gaLoaded = false;

/**
 * GA4 runs in production builds only.
 *
 * `npm run dev` (local) and any non-production build send nothing, so test
 * clicks never pollute the real analytics. A production deploy loads gtag and
 * reports a `page_view` on every client-side route change (the SPA never does
 * a full reload, so each navigation must be reported manually).
 */
function loadGA() {
  if (gaLoaded) return;
  gaLoaded = true;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer!.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

export default function Analytics() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    if (!import.meta.env.PROD) return; // prod only — no tracking in local/dev
    loadGA();
    window.gtag?.("event", "page_view", {
      page_path: pathname + search,
      page_location: window.location.href,
      page_title: document.title,
      send_to: GA_MEASUREMENT_ID,
    });
  }, [pathname, search]);

  return null;
}
