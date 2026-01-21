import React from 'react';
import "./dashboard.scss";

const Dashboard = () => {
  return (
    <>
      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon blue">👥</div>
            <div className="stat-trend up">↑ 12.5%</div>
          </div>
          <div className="stat-value">1,234</div>
          <div className="stat-label">Total Users</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon green">💰</div>
            <div className="stat-trend up">↑ 23.1%</div>
          </div>
          <div className="stat-value">$45,231</div>
          <div className="stat-label">Monthly Revenue</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon orange">🏢</div>
            <div className="stat-trend up">↑ 5.3%</div>
          </div>
          <div className="stat-value">87</div>
          <div className="stat-label">Organizations</div>
        </div>

        <div className="stat-card">
          <div className="stat-card-header">
            <div className="stat-icon red">🔄</div>
            <div className="stat-trend down">↓ 2.4%</div>
          </div>
          <div className="stat-value">892</div>
          <div className="stat-label">Active Subscriptions</div>
        </div>
      </div>

      {/* Charts Placeholder */}
      <div className="content-card">
        <div className="card-header">
          <h2 className="card-title">User Growth & Revenue</h2>
          <div className="card-actions">
            <button className="btn btn-secondary">Last 30 days</button>
          </div>
        </div>
        <div className="chart-container">
          📊 Revenue & User Growth Chart (Future Integration)
        </div>
      </div>

      {/* Recent Activity */}
      <div className="content-card">
        <div className="card-header">
          <h2 className="card-title">Recent Activity</h2>
          <button className="btn btn-secondary">View All</button>
        </div>
        <div className="activity-item">
          <div className="activity-icon" style={{ backgroundColor: '#dcfce7' }}>👤</div>
          <div className="activity-content">
            <div className="activity-text">
              <span className="activity-user">John Doe</span> upgraded to Pro plan
            </div>
            <div className="activity-time">2 minutes ago</div>
          </div>
        </div>
        <div className="activity-item">
          <div className="activity-icon" style={{ backgroundColor: '#dbeafe' }}>🏢</div>
          <div className="activity-content">
            <div className="activity-text">
              <span className="activity-user">Acme Corp</span> added 15 new users
            </div>
            <div className="activity-time">15 minutes ago</div>
          </div>
        </div>
        <div className="activity-item">
          <div className="activity-icon" style={{ backgroundColor: '#fee2e2' }}>⚠️</div>
          <div className="activity-content">
            <div className="activity-text">
              <span className="activity-user">Sarah Wilson</span> account suspended
            </div>
            <div className="activity-time">1 hour ago</div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Dashboard;
