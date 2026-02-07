import { useEffect, useState } from "react";
import CategoryCard from "../../components/category-card";
import BusinessCard from "../../components/business-card";
import { mockBusinesses } from "../../mock/businesses";
import Button from "../../components/button";
import { CategoryService, type CategoryWithServicesData } from "../../services/category/category.service";
import "./landing.scss";

export default function LandingPage() {
  const [categories, setCategories] = useState<CategoryWithServicesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const categoryService = new CategoryService();
      const data = await categoryService.getCategoriesWithServices();
      setCategories(data);
    } catch (err: any) {
      console.error("Failed to fetch categories:", err);
      setError("Failed to load categories. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-hero">
        <div className="landing-hero-inner">
          <p className="landing-kicker">Book smarter. Wait less.</p>
          <h1 className="landing-title">
            Find the right place and fix your appointment in minutes.
          </h1>
          <p className="landing-subtitle">
            Choose a category, pick a business, select a date, and confirm your slot/queue — all in a
            clean, fast experience.
          </p>

          <div className="landing-cta-row">
            <Button
              text="Explore categories"
              color="blue"
              size="lg"
              onClick={() => {
                document.querySelector(".landing-section")?.scrollIntoView({ behavior: "smooth" });
              }}
            />
            <Button
              text="How it works"
              color="transparent"
              size="lg"
              onClick={() => {
                // TODO: Add how it works modal/page
              }}
            />
          </div>
        </div>
      </div>

      <div className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Browse by category</h2>
          <p className="landing-section-subtitle">Tap a category to see businesses near you.</p>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <p>Loading categories...</p>
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: "2rem", color: "#d32f2f" }}>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="landing-grid">
            {categories.length > 0 ? (
              categories.map((category) => (
                <CategoryCard key={category.uuid} category={category} />
              ))
            ) : (
              <div style={{ textAlign: "center", padding: "2rem" }}>
                <p>No categories available.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="landing-section">
        <div className="landing-section-header">
          <h2 className="landing-section-title">Popular right now</h2>
          <p className="landing-section-subtitle">
            A few featured places to show how listings will look.
          </p>
        </div>

        <div className="landing-grid">
          {mockBusinesses.slice(0, 3).map((business) => (
            <BusinessCard key={business.id} business={business} />
          ))}
        </div>
      </div>
    </div>
  );
}
