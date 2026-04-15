import { useCallback, useState } from "react";
import { SuperAdminService, UserAdminItem } from "../../../services/super-admin/super-admin.service";
import { useAdminList } from "../../../hooks/useAdminList";
import { ConfirmModal } from "../../../components/confirm-modal";
import { ADMIN_LIST_LIMIT, ProfileType } from "../../../utils/constants";

const svc = new SuperAdminService();
const ALL_ROLES = Object.values(ProfileType);

const SuperAdminUsers = () => {
  const [selectedUser, setSelectedUser] = useState<UserAdminItem | null>(null);
  const [roleTarget, setRoleTarget] = useState<{ user: UserAdminItem; action: "assign" | "revoke"; role: string } | null>(null);
  const [roleLoading, setRoleLoading] = useState(false);

  const { items, total, page, pages, search, loading, error, success, setSearch, setPage, refresh, setSuccess, setError } =
    useAdminList<UserAdminItem>({
      fetchFn: useCallback(
        (p, s) => svc.getUsers({ page: p, limit: ADMIN_LIST_LIMIT, search: s || undefined }),
        []
      ),
    });

  const handleRoleConfirm = async () => {
    if (!roleTarget) return;
    setRoleLoading(true);
    setError("");
    try {
      if (roleTarget.action === "assign") {
        await svc.assignRole(roleTarget.user.uuid, roleTarget.role);
      } else {
        await svc.revokeRole(roleTarget.user.uuid, roleTarget.role);
      }
      setSuccess(`Role ${roleTarget.action === "assign" ? "assigned" : "revoked"} successfully.`);
      setRoleTarget(null);
      setSelectedUser(null);
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to update role.");
      setRoleTarget(null);
    } finally {
      setRoleLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Users</h2>
          <p>{total} total users</p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {success && <div className="alert alert--success">{success}</div>}

      <div className="page-toolbar">
        <input className="filter-input" placeholder="Search by name, phone, or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="content-card">
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Phone</th>
                <th>Roles</th>
                <th>Joined</th>
                <th>Manage Roles</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 5 }).map((__, j) => <td key={j}><div className="skeleton-cell skeleton-cell--med" /></td>)}
                    </tr>
                  ))
                : items.length === 0
                ? <tr><td colSpan={5}><div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-title">No users found</div></div></td></tr>
                : items.map((user) => (
                  <tr key={user.uuid}>
                    <td>
                      <div>
                        <strong>{user.full_name || "—"}</strong>
                        {user.email && <div style={{ fontSize: 12, color: "#64748b" }}>{user.email}</div>}
                      </div>
                    </td>
                    <td style={{ fontSize: 13 }}>{user.phone_number}</td>
                    <td>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {user.roles.length === 0
                          ? <span style={{ color: "#94a3b8", fontSize: 13 }}>No roles</span>
                          : user.roles.map((r) => (
                              <span key={r} className="status-badge registered" style={{ fontSize: 11 }}>{r}</span>
                            ))}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: "#64748b" }}>
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button className="action-btn" onClick={() => setSelectedUser(user)} title="Manage roles">⚙️</button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="pagination-row">
          <span>Showing {items.length} of {total}</span>
          <div className="pagination-actions">
            <button className="page-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</button>
            <span className="page-btn active">{page}</span>
            <button className="page-btn" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>→</button>
          </div>
        </div>
      </div>

      {/* Role management modal */}
      {selectedUser && (
        <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && setSelectedUser(null)}>
          <div className="modal">
            <div className="modal-header">
              <h3>Manage Roles — {selectedUser.full_name || selectedUser.phone_number}</h3>
              <button className="modal-close" onClick={() => setSelectedUser(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: "0 0 16px", fontSize: 14, color: "#64748b" }}>
                Current roles: {selectedUser.roles.length ? selectedUser.roles.join(", ") : "None"}
              </p>
              {ALL_ROLES.map((role) => {
                const hasRole = selectedUser.roles.includes(role);
                return (
                  <div key={role} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{role}</span>
                    {hasRole ? (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => setRoleTarget({ user: selectedUser, action: "revoke", role })}
                      >
                        Revoke
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setRoleTarget({ user: selectedUser, action: "assign", role })}
                      >
                        Assign
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedUser(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {roleTarget && (
        <ConfirmModal
          title={`Confirm Role ${roleTarget.action === "assign" ? "Assignment" : "Revocation"}`}
          message={
            roleTarget.action === "assign"
              ? <>Assign <strong>{roleTarget.role}</strong> role to <strong>{roleTarget.user.full_name || roleTarget.user.phone_number}</strong>?</>
              : <>Revoke <strong>{roleTarget.role}</strong> role from <strong>{roleTarget.user.full_name || roleTarget.user.phone_number}</strong>?</>
          }
          confirmLabel={roleTarget.action === "assign" ? "Assign" : "Revoke"}
          destructive={roleTarget.action === "revoke"}
          loading={roleLoading}
          onConfirm={handleRoleConfirm}
          onCancel={() => setRoleTarget(null)}
        />
      )}
    </div>
  );
};

export default SuperAdminUsers;
