import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BusinessService, type BusinessDetailData, type BusinessServiceData } from "../../services/business/business.service";
import Button from "../../components/button";
import "./business-details.scss";

export default function BusinessDetailsPage() {
  const { businessId } = useParams<{ businessId: string }>();
  const navigate = useNavigate();
  const [business, setBusiness] = useState<BusinessDetailData | null>(null);
  const [services, setServices] = useState<BusinessServiceData[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!businessId) {
        setError("Business ID is required");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const businessService = new BusinessService();
        
        const [businessData, servicesData] = await Promise.all([
          businessService.getBusinessDetails(businessId),
          businessService.getBusinessServices(businessId),
        ]);

        setBusiness(businessData);
        setServices(servicesData);
      } catch (err: any) {
        console.error("Failed to fetch data:", err);
        setError(err.response?.data?.detail || "Failed to load business details. Please try again later.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [businessId]);

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleContinue = () => {
    if (selectedServices.length === 0) {
      return;
    }
      // Pass full service data instead of just UUIDs to avoid refetching
    const selectedServicesData = services.filter((s) => selectedServices.includes(s.uuid));
    navigate(`/business/${businessId}/book`, {
      state: { 
        selectedServices: selectedServices.map(id => id), // Keep UUIDs for API calls
        selectedServicesData, // Pass full service data
        businessName: business?.name || "",
      },
    });
  };

  const selectedServicesData = services.filter((s) => selectedServices.includes(s.uuid));
  const totalPrice = selectedServicesData.reduce((sum, s) => sum + (s.price || 0), 0);

  const formatAddress = (address: BusinessDetailData["address"]): string => {
    if (!address) return "";
    const parts: string[] = [];
    if (address.street_1) parts.push(address.street_1);
    if (address.street_2) parts.push(address.street_2);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.postal_code) parts.push(address.postal_code);
    return parts.join(", ");
  };

  if (loading) {
    return (
      <div className="business-details-page">
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p>Loading business details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="business-details-page">
        <div style={{ textAlign: "center", padding: "2rem", color: "#d32f2f" }}>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="business-details-page">
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p>Business not found</p>
        </div>
      </div>
    );
  }

  const location = formatAddress(business.address);

  return (
    <div className="business-details-page">
      <div className="business-details-header">
        <div className="business-details-header-content">
          <h1 className="business-details-title">{business.name}</h1>
          <div className="business-details-meta">
            {location && <p>📍 {location}</p>}
            {business.phone_number && (
              <p>📞 {business.country_code ? `${business.country_code} ` : ""}{business.phone_number}</p>
            )}
            {business.email && <p>✉️ {business.email}</p>}
          </div>
          {business.is_open && <span className="business-status-badge">Open Now</span>}
        </div>
      </div>

      {business.about_business && (
        <div className="business-details-section">
          <h2 className="section-title">About</h2>
          <p className="section-description">{business.about_business}</p>
        </div>
      )}

      <div className="business-details-section">
        <h2 className="section-title">Available Services</h2>
        <p className="section-subtitle">Select one or more services to book</p>
        {services.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2rem", color: "#666" }}>
            <p>No services available at this time.</p>
          </div>
        ) : (
          <div className="services-grid">
            {services.map((service) => (
              <div
                key={service.uuid}
                className={`service-card ${selectedServices.includes(service.uuid) ? "selected" : ""}`}
                onClick={() => handleServiceToggle(service.uuid)}
              >
                <h3 className="service-name">{service.name}</h3>
                {service.description && (
                  <p className="service-description">{service.description}</p>
                )}
                <div className="service-meta">
                  {service.duration && <span>⏱️ {service.duration} min</span>}
                  {service.price !== null && service.price !== undefined && (
                    <span className="service-price">₹{service.price}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedServices.length > 0 && (
        <div className="business-details-sticky-bar">
          <div className="sticky-bar-content">
            <div>
              <p className="sticky-bar-text">
                {selectedServices.length} {selectedServices.length === 1 ? "service" : "services"} selected
              </p>
              <p className="sticky-bar-total">Total: ₹{totalPrice}</p>
            </div>
            <Button
              text="Continue to Booking"
              color="blue"
              size="lg"
              onClick={handleContinue}
            />
          </div>
        </div>
      )}
    </div>
  );
}
