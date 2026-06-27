import type { BusinessDetailData } from "../../services/business/business.service";
import type { BusinessReviewSummary } from "../../services/review/review.service";
import { SEO_BASE_URL } from "../../components/Seo";

// schema.org dayOfWeek names, indexed by day_of_week (0=Sunday … 6=Saturday —
// the app's stored convention, matching JS Date.getDay()).
const SCHEMA_DAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
] as const;

/** Normalise a schedule time ("09:00" or "09:00 AM") to 24h "HH:MM"; null if unparseable. */
function to24h(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  const ampm = v.match(/^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$/);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = ampm[2];
    const pm = ampm[3].toLowerCase() === "pm";
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
    return `${String(h).padStart(2, "0")}:${m}`;
  }
  const h24 = v.match(/^(\d{1,2}):(\d{2})$/);
  if (h24) return `${h24[1].padStart(2, "0")}:${h24[2]}`;
  return null;
}

export function businessSeoTitle(b: BusinessDetailData): string {
  const city = b.address?.city?.trim();
  return `${b.name}${city ? `, ${city}` : ""} — Book Appointments & Join Queue | EaseQueue`;
}

export function businessSeoDescription(b: BusinessDetailData): string {
  const about = b.about_business?.trim();
  if (about) return about.length > 160 ? `${about.slice(0, 157).trimEnd()}…` : about;
  const city = b.address?.city?.trim();
  return `Book appointments and join the queue at ${b.name}${city ? `, ${city}` : ""} on EaseQueue. No app download needed.`;
}

export function businessCanonical(businessId: string): string {
  return `${SEO_BASE_URL}/business/${businessId}`;
}

/** schema.org LocalBusiness structured data for rich search results. */
export function buildBusinessJsonLd(
  b: BusinessDetailData,
  reviewSummary: BusinessReviewSummary | null,
  canonical: string,
): Record<string, unknown> {
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: b.name,
    url: canonical,
  };

  if (b.profile_picture) ld.image = b.profile_picture;
  if (b.about_business?.trim()) ld.description = b.about_business.trim();
  if (b.phone_number) ld.telephone = `${b.country_code ?? ""}${b.phone_number}`;
  if (b.email) ld.email = b.email;

  if (b.address) {
    const a = b.address;
    const street = [a.unit_number, a.building, a.floor, a.street_1, a.street_2]
      .filter(Boolean)
      .join(", ");
    const postal: Record<string, unknown> = { "@type": "PostalAddress" };
    if (street) postal.streetAddress = street;
    if (a.city) postal.addressLocality = a.city;
    if (a.district) postal.addressSubDivision = a.district;
    if (a.state) postal.addressRegion = a.state;
    if (a.postal_code) postal.postalCode = a.postal_code;
    if (a.country) postal.addressCountry = a.country;
    if (Object.keys(postal).length > 1) ld.address = postal;

    if (a.latitude != null && a.longitude != null && !isNaN(a.latitude) && !isNaN(a.longitude)) {
      ld.geo = { "@type": "GeoCoordinates", latitude: a.latitude, longitude: a.longitude };
    }
  }

  // Opening hours: skip when always-open (no fixed spec) or unparseable times.
  if (b.schedule && !b.is_always_open && b.schedule.schedules?.length) {
    const specs = b.schedule.schedules
      .filter((d) => d.is_open && d.opening_time && d.closing_time)
      .map((d) => {
        const opens = to24h(d.opening_time);
        const closes = to24h(d.closing_time);
        const day = SCHEMA_DAYS[d.day_of_week];
        if (!opens || !closes || !day) return null;
        return {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: `https://schema.org/${day}`,
          opens,
          closes,
        };
      })
      .filter(Boolean);
    if (specs.length) ld.openingHoursSpecification = specs;
  }

  // Only advertise a rating when real reviews exist (Google flags empty ratings).
  if (reviewSummary && reviewSummary.review_count > 0) {
    ld.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: reviewSummary.average_rating,
      reviewCount: reviewSummary.review_count,
    };
  }

  return ld;
}
