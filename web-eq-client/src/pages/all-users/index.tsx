import React from 'react';
import "./all-users.scss";

const AllUsers = () => {
    const users = [
        { id: 1, name: "John Doe", email: "john.doe@example.com", initials: "JD", phone: "+1 (555) 001-2345", joined: "Dec 15, 2024", avatarBg: "" },
        { id: 2, name: "Sarah Wilson", email: "sarah.w@techsolutions.com", initials: "SW", phone: "+1 (555) 002-3456", joined: "Nov 28, 2024", avatarBg: "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" },
        { id: 3, name: "Michael Johnson", email: "michael.j@gmail.com", initials: "MJ", phone: "+1 (555) 003-4567", joined: "Dec 20, 2024", avatarBg: "linear-gradient(135deg, #fa709a 0%, #fee140 100%)" },
    ];

    return (
        <div className="all-users-page">
            <div className="content-card">
                <div className="card-header">
                    <h2 className="card-title">User Management</h2>
                    <div className="card-actions">
                        <button className="btn btn-secondary">Export</button>
                        <button className="btn btn-primary">+ Add User</button>
                    </div>
                </div>

                <div className="filter-bar">
                    <input type="text" className="filter-input" placeholder="Search users..." />
                </div>

                <div className="data-table-container">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th>Phone Number</th>
                                <th>Joined</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map((user) => (
                                <tr key={user.id}>
                                    <td>
                                        <div className="user-cell">
                                            <div className="user-avatar" style={user.avatarBg ? { background: user.avatarBg } : {}}>
                                                {user.initials}
                                            </div>
                                            <div className="user-info">
                                                <div className="user-name">{user.name}</div>
                                                <div className="user-email">{user.email}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{user.phone}</td>
                                    <td>{user.joined}</td>
                                    <td>
                                        <div className="action-buttons">
                                            <button className="action-btn" title="View">👁️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="pagination">
                    <button className="page-btn">←</button>
                    <button className="page-btn active">1</button>
                    <button className="page-btn">2</button>
                    <button className="page-btn">3</button>
                    <button className="page-btn">...</button>
                    <button className="page-btn">10</button>
                    <button className="page-btn">→</button>
                </div>
            </div>
        </div>
    );
};

export default AllUsers;
