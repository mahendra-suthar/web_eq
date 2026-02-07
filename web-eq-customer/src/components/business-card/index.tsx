import { useNavigate } from "react-router-dom";
import type { Business } from "../../mock/businesses";
import "./business-card.scss";

type BusinessCardProps = {
  business: Business;
};

export default function BusinessCard({ business }: BusinessCardProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/business/${business.id}`);
  };

  const getStatusText = () => {
    if (business.isAlwaysOpen) return "Open 24/7";
    if (business.isOpen) {
      return business.closesAt ? `Closes at ${business.closesAt}` : "Open";
    }
    return business.opensAt ? `Opens at ${business.opensAt}` : "Closed";
  };

  return (
    <div className="business-card" onClick={handleClick}>
      <div className="business-card-image">
        {business.image ? (
          <img src={business.image} alt={business.name} />
        ) : (
          <div className="business-card-placeholder">
            <span>{business.name.charAt(0)}</span>
          </div>
        )}
        {/* Gradient overlay for text readability */}
        <div className="business-card-image-overlay"></div>
        
        {/* Business name at bottom left */}
        <div className="business-card-name-overlay">
          {business.name}
        </div>
        
        {/* Rating at bottom right */}
        {(business.rating > 0 || business.reviewCount > 0) && (
          <div className="business-card-rating-overlay">
            <span className="business-card-star">⭐</span>
            <span>{business.rating > 0 ? business.rating : "New"}</span>
            {business.reviewCount > 0 && (
              <span className="business-card-review-count">({business.reviewCount})</span>
            )}
          </div>
        )}
      </div>
      <div className="business-card-content">
        {/* Open/Closed Status */}
        <div className="business-card-status-row">
          <span className={`business-card-status-badge ${business.isOpen ? "open" : "closed"}`}>
            {business.isOpen ? "Open" : "Closed"}
          </span>
          <span className="business-card-status-time">
            {getStatusText()}
          </span>
        </div>

        {/* Services and Price Range */}
        {business.serviceNames && business.serviceNames.length > 0 && (
          <div className="business-card-services-row">
            <span className="business-card-services">
              {business.serviceNames.slice(0, 2).join(" • ")}
              {business.serviceNames.length > 2 && " • ..."}
            </span>
            {(business.minPrice !== null || business.maxPrice !== null) && (
              <span className="business-card-price">
                {business.minPrice !== null && business.maxPrice !== null && business.minPrice !== business.maxPrice
                  ? `₹${business.minPrice} - ₹${business.maxPrice}`
                  : business.minPrice !== null
                  ? `₹${business.minPrice}`
                  : business.maxPrice !== null
                  ? `₹${business.maxPrice}`
                  : ""}
              </span>
            )}
          </div>
        )}
        
        {/* Location and Distance */}
        {business.location && (
          <div className="business-card-location-row">
            <span className="business-card-location">{business.location}</span>
            {business.distance && (
              <span className="business-card-distance">{business.distance}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
