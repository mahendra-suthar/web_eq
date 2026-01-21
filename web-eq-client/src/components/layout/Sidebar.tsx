import React from 'react';
import { NavLink } from 'react-router-dom';
import { RouterConstant } from '../../routers/index';

const Sidebar = () => {
    const { ROUTERS_PATH } = RouterConstant;

    return (
        <div className="sidebar">
            <div className="logo">
                <div className="logo-icon">🛡️</div>
                <div className="logo-text">
                    <div className="logo-title">GNOSTIC</div>
                    <div className="logo-subtitle">Admin Panel</div>
                </div>
            </div>

            <div className="nav-items">
                <div className="nav-section-title">Overview</div>
                <NavLink to={ROUTERS_PATH.DASHBOARD} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <div className="nav-item-icon">📊</div>
                    <span>Dashboard</span>
                </NavLink>

                <div className="nav-section-title">Employee Management</div>
                <NavLink to={ROUTERS_PATH.EMPLOYEES} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <div className="nav-item-icon">👷</div>
                    <span>Employees</span>
                </NavLink>

                <div className="nav-section-title">User Management</div>
                <NavLink to={ROUTERS_PATH.ALLUSERS} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <div className="nav-item-icon">👥</div>
                    <span>All Users</span>
                    <span className="nav-item-badge">1,234</span>
                </NavLink>

                <div className="nav-section-title">Queue Management</div>
                <NavLink to={ROUTERS_PATH.QUEUEUSERS} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                    <div className="nav-item-icon">📋</div>
                    <span>Queue Users</span>
                </NavLink>
            </div>

            <div className="admin-info">
                <div className="admin-avatar">AD</div>
                <div className="admin-details">
                    <div className="admin-name">Admin User</div>
                    <div className="admin-role">Super Admin</div>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;
