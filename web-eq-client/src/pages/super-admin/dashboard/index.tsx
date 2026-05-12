import React, { useEffect, useState } from "react";
import { SuperAdminService, AdminStats } from "../../../services/super-admin/super-admin.service";
import "./dashboard.scss";

const svc = new SuperAdminService();

interface StatCard {
  label: string;
  value: number;
  icon: string;
  color: string;
}

const SuperAdminDashboard = () => {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    svc.getStats()
      .then(setStats)
      .catch(() => setError("Failed to load stats."))
      .finally(() => setLoading(false));
  }, []);

  const cards: StatCard[] = stats
    ? [
        { label: "Total Users", value: stats.total_users, icon: "👥", color: "#6366f1" },
        { label: "Total Businesses", value: stats.total_businesses, icon: "🏢", color: "#0ea5e9" },
        { label: "Active Businesses", value: stats.active_businesses, icon: "✅", color: "#10b981" },
        { label: "Categories", value: stats.total_categories, icon: "🗂️", color: "#f59e0b" },
        { label: "Services", value: stats.total_services, icon: "🔧", color: "#8b5cf6" },
        { label: "Queues", value: stats.total_queues, icon: "📑", color: "#ec4899" },
        { label: "Appointments", value: stats.total_appointments, icon: "📋", color: "#14b8a6" },
      ]
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Platform Overview</h2>
          <p>Real-time platform statistics</p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="sa-stats-grid">
        {loading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="sa-stat-card sa-stat-card--skeleton" />
            ))
          : cards.map((c) => (
              <div key={c.label} className="sa-stat-card">
                <div className="sa-stat-icon" style={{ background: c.color + "20", color: c.color }}>
                  {c.icon}
                </div>
                <div className="sa-stat-value">{c.value.toLocaleString()}</div>
                <div className="sa-stat-label">{c.label}</div>
              </div>
            ))}
      </div>
    </div>
  );
};

export default SuperAdminDashboard;
