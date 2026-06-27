import { Helmet } from "react-helmet-async";

/** Canonical origin for the customer app — used to build absolute URLs. */
export const SEO_BASE_URL = "https://app.easequeue.com";

type JsonLd = Record<string, unknown>;

interface SeoProps {
  title: string;
  description: string;
  /** Absolute canonical URL (e.g. `${SEO_BASE_URL}/business/123`). */
  canonical: string;
  /** Absolute image URL for OG/Twitter cards. Falls back to the site card. */
  image?: string;
  /** Keep a page out of the index (error/not-found states). */
  noindex?: boolean;
  /** One or more JSON-LD objects rendered as ld+json scripts. */
  jsonLd?: JsonLd | JsonLd[];
}

/**
 * Per-page document head. Googlebot renders JS, so these runtime-injected tags
 * drive organic search/ranking. (Social scrapers don't run JS — rich link
 * previews would need server-side meta; see SEO Phase 3.)
 */
export default function Seo({ title, description, canonical, image, noindex, jsonLd }: SeoProps) {
  const ogImage = image ?? `${SEO_BASE_URL}/og-image.png`;
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet prioritizeSeoTags>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      {noindex && <meta name="robots" content="noindex, nofollow" />}

      {/* Open Graph */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={ogImage} />

      {/* Twitter / X */}
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />

      {blocks.map((block, i) => (
        // Values come from our own API; JSON.stringify is XSS-safe for ld+json.
        <script key={i} type="application/ld+json">{JSON.stringify(block)}</script>
      ))}
    </Helmet>
  );
}
