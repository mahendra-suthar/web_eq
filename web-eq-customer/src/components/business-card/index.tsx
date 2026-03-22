import { useNavigate } from "react-router-dom";
import type { Business } from "../../mock/businesses";
import "./business-card.scss";

const CARD_GRADIENTS = [
  "linear-gradient(145deg, #0b3d2b, #1a7a56, #b6e8d3)",
  "linear-gradient(145deg, #1a3a2e, #2d6b50, #89d4b0)",
  "linear-gradient(145deg, #0e3028, #155c42, #5bbf95)",
  "linear-gradient(145deg, #163320, #1e5e42, #7bd0ae)",
  "linear-gradient(145deg, #0a2e1e, #187050, #a0dfc4)",
  "linear-gradient(145deg, #112b1e, #1b6347, #70c9a0)",
];

function getGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return CARD_GRADIENTS[Math.abs(hash) % CARD_GRADIENTS.length];
}

type BusinessCardProps = {
  business: Business;
};

export default function BusinessCard({ business }: BusinessCardProps) {
  const navigate = useNavigate();
  const isOpen = business.isOpen || business.isAlwaysOpen;

  const priceText = (() => {
    if (business.minPrice !== null && business.maxPrice !== null && business.minPrice !== business.maxPrice) {
      return { from: `₹${business.minPrice}`, to: `→ ₹${business.maxPrice}` };
    }
    if (business.minPrice !== null) return { from: `₹${business.minPrice}`, to: null };
    if (business.maxPrice !== null) return { from: `₹${business.maxPrice}`, to: null };
    return null;
  })();

  return (
    <div
      className="biz-card"
      onClick={() => navigate(`/business/${business.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && navigate(`/business/${business.id}`)}
    >
      <div className="biz-card-img">
        {business.image ? (
          <img src={business.image} alt={business.name} className="biz-card-img-photo" />
        ) : (
          <div
            className="biz-card-img-bg"
            style={{ background: getGradient(business.name) }}
            aria-hidden="true"
          />
        )}
        <div className="biz-card-img-overlay" aria-hidden="true" />
        {!business.image && (
          <div className="biz-card-img-letter" aria-hidden="true">
            {business.name.charAt(0)}
          </div>
        )}

        <div className={`biz-card-status ${isOpen ? "biz-card-status--open" : "biz-card-status--closed"}`}>
          <span className="biz-card-status-dot" aria-hidden="true" />
          {business.isAlwaysOpen ? "Always open" : isOpen ? "Open now" : "Closed"}
        </div>

        <div className="biz-card-img-bottom">
          <div className="biz-card-name">{business.name}</div>
          {business.rating > 0 && (
            <div className="biz-card-rating-badge" aria-label={`Rating ${business.rating}`}>
              <span className="biz-card-star" aria-hidden="true">★</span>
              {business.rating}
            </div>
          )}
        </div>
      </div>

      <div className="biz-card-body">
        {business.serviceNames && business.serviceNames.length > 0 && (
          <div className="biz-card-service-tag">
            <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            {business.serviceNames.slice(0, 2).join(" · ")}
            {business.serviceNames.length > 2 && ` +${business.serviceNames.length - 2}`}
          </div>
        )}

        {business.location && (
          <div className="biz-card-address">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            {business.location}
          </div>
        )}

        <div className="biz-card-footer">
          {priceText ? (
            <div className="biz-card-price">
              <div className="biz-card-price-label">Starting from</div>
              <div className="biz-card-price-value">
                {priceText.from}
                {priceText.to && <span className="biz-card-price-to"> {priceText.to}</span>}
              </div>
            </div>
          ) : (
            <div className="biz-card-price" />
          )}

          <button
            className={`biz-card-book-btn${!isOpen ? " biz-card-book-btn--disabled" : ""}`}
            onClick={(e) => { e.stopPropagation(); if (isOpen) navigate(`/business/${business.id}`); }}
            tabIndex={-1}
            aria-label={isOpen ? `Book slot at ${business.name}` : `${business.name} is currently closed`}
          >
            {isOpen ? "Book slot" : business.opensAt ? `Opens ${business.opensAt}` : "Closed"}
          </button>
        </div>
      </div>
    </div>
  );
}
