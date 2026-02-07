import { useEffect, useState, useCallback } from "react";
import { useParams, useLocation } from "react-router-dom";
import BusinessCard from "../../components/business-card";
import { BusinessService } from "../../services/business/business.service";
import { CategoryService, type CategoryWithServicesData, type ServiceData } from "../../services/category/category.service";
import { getCategoryEmoji } from "../../utils/category-emoji";
import type { Business } from "../../mock/businesses";
import "./business-list.scss";

export default function BusinessListPage() {
  const { categoryId } = useParams<{ categoryId: string }>();
  const location = useLocation();
  const passedCategory = (location.state?.category as CategoryWithServicesData) || null;

  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [category, setCategory] = useState<CategoryWithServicesData | null>(passedCategory);
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadCategory = async () => {
      if (category || !categoryId) return;

      try {
        const categoryService = new CategoryService();
        const categories = await categoryService.getCategoriesWithServices();
        const found = categories.find((c) => c.uuid === categoryId);
        if (found) {
          setCategory(found);
        } else {
          setError("Category not found");
        }
      } catch {
        setError("Failed to load category info.");
      }
    };

    loadCategory();
  }, [categoryId, category]);

  const fetchBusinesses = useCallback(async () => {
    if (!categoryId) return;

    try {
      setLoading(true);
      setError(null);

      const businessService = new BusinessService();
      const serviceIds = selectedServiceIds.length > 0 ? selectedServiceIds : undefined;
      const businessList = await businessService.getBusinesses(categoryId, serviceIds);

      const mappedBusinesses: Business[] = businessList.map((b) => ({
        id: b.uuid,
        name: b.name,
        categoryId: b.category_id || "",
        rating: b.rating || 0,
        reviewCount: b.review_count || 0,
        location: b.address || "",
        distance: undefined, // Will be calculated based on user location
        image: b.profile_picture || undefined,
        description: b.about_business || "",
        isOpen: b.is_open,
        isAlwaysOpen: b.is_always_open,
        opensAt: b.opens_at,
        closesAt: b.closes_at,
        serviceNames: b.service_names || [],
        minPrice: b.min_price || null,
        maxPrice: b.max_price || null,
        latitude: b.latitude,
        longitude: b.longitude,
      }));

      setBusinesses(mappedBusinesses);
    } catch {
      setError("Failed to load businesses. Please try again later.");
    } finally {
      setLoading(false);
    }
  }, [categoryId, selectedServiceIds]);

  useEffect(() => {
    fetchBusinesses();
  }, [fetchBusinesses]);

  const handleServiceToggle = (serviceId: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    );
  };

  const handleClearFilters = () => {
    setSelectedServiceIds([]);
  };

  if (!category && !loading && !error) {
    return (
      <div className="business-list-page">
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p>Category not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="business-list-page">
      {/* Header */}
      <div className="business-list-header">
        <h1 className="business-list-title">
          {category ? `${getCategoryEmoji(category.name)} ${category.name}` : "Loading..."}
        </h1>
        {category?.description && (
          <p className="business-list-description">{category.description}</p>
        )}
        <p className="business-list-subtitle">
          {loading
            ? "Searching businesses..."
            : `${businesses.length} ${businesses.length === 1 ? "business" : "businesses"} available`}
        </p>
      </div>

      {/* Service Filters */}
      {category && category.services.length > 0 && (
        <div className="service-filters">
          <div className="service-filters-header">
            <span className="service-filters-label">Filter by service</span>
            {selectedServiceIds.length > 0 && (
              <button className="service-filters-clear" onClick={handleClearFilters}>
                Clear all
              </button>
            )}
          </div>
          <div className="service-filters-list">
            {category.services.map((service: ServiceData) => (
              <button
                key={service.id}
                className={`service-filter-btn ${selectedServiceIds.includes(service.id) ? "active" : ""}`}
                onClick={() => handleServiceToggle(service.id)}
              >
                {service.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="business-list-error">
          <p>{error}</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "2rem" }}>
          <p>Loading businesses...</p>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && businesses.length === 0 && (
        <div className="business-list-empty">
          {selectedServiceIds.length > 0 ? (
            <>
              <p>No businesses found for the selected services.</p>
              <button className="service-filters-clear" onClick={handleClearFilters}>
                Clear filters
              </button>
            </>
          ) : (
            <p>No businesses found in this category.</p>
          )}
        </div>
      )}

      {/* Business Grid */}
      {!loading && !error && businesses.length > 0 && (
        <div className="business-list-grid">
          {businesses.map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
        </div>
      )}
    </div>
  );
}
