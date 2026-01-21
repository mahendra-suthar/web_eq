import React from 'react';
import { Outlet } from "react-router-dom";
import Sidebar from "../../components/layout/Sidebar";
import Topbar from "../../components/layout/Topbar";
import "./admin-layout.scss";

const AdminLayout = () => {
    return (
        <div className="admin-layout-container">
            <Sidebar />
            <div className="main-content">
                <Topbar />
                <div className="content-area">
                    <Outlet />
                </div>
            </div>
        </div>
    );
};

export default AdminLayout;
