import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { SuperAdminService, BusinessAdminItem } from "../../../services/super-admin/super-admin.service";
import { ProfileService } from "../../../services/profile/profile.service";
import { useAdminList } from "../../../hooks/useAdminList";
import { ConfirmModal } from "../../../components/confirm-modal";
import { useUserStore } from "../../../utils/userStore";
import { ADMIN_LIST_LIMIT, BusinessStatus } from "../../../utils/constants";
import { ROUTERS_PATH } from "../../../routers/routers";

const svc = new SuperAdminService();
const profileSvc = new ProfileService();

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: String(BusinessStatus.DRAFT), label: "Draft" },
  { value: String(BusinessStatus.REGISTERED), label: "Registered" },
  { value: String(BusinessStatus.ACTIVE), label: "Active" },
  { value: String(BusinessStatus.SUSPENDED), label: "Suspended" },
  { value: String(BusinessStatus.INACTIVE), label: "Inactive" },
  { value: String(BusinessStatus.TERMINATED), label: "Terminated" },
];

const STATUS_CLASS: Record<number, string> = {
  [BusinessStatus.DRAFT]: "draft",
  [BusinessStatus.REGISTERED]: "registered",
  [BusinessStatus.ACTIVE]: "active",
  [BusinessStatus.SUSPENDED]: "suspended",
  [BusinessStatus.INACTIVE]: "inactive",
  [BusinessStatus.TERMINATED]: "terminated",
};

const SuperAdminBusinesses = () => {
  const navigate = useNavigate();
  const { startImpersonation, setProfile, setNextStep } = useUserStore();

  const [filterStatus, setFilterStatus] = useState("");
  const [statusTarget, setStatusTarget] = useState<{ item: BusinessAdminItem; newStatus: number } | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [impersonatingUuid, setImpersonatingUuid] = useState<string | null>(null);

  const { items, total, page, pages, search, loading, error, setSearch, setPage, setFilters, refresh, setError } =
    useAdminList<BusinessAdminItem>({
      fetchFn: useCallback(
        (p, s, f) =>
          svc.getBusinesses({
            page: p,
            limit: ADMIN_LIST_LIMIT,
            search: s || undefined,
            status: f.status !== "" && f.status !== undefined ? Number(f.status) : undefined,
          }),
        []
      ),
    });

  const handleStatusFilter = (val: string) => {
    setFilterStatus(val);
    setFilters({ status: val });
  };

  const handleStatusChange = async () => {
    if (!statusTarget) return;
    setStatusLoading(true);
    try {
      await svc.updateBusinessStatus(statusTarget.item.uuid, statusTarget.newStatus);
      setStatusTarget(null);
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to update status.");
      setStatusTarget(null);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleLoginAs = async (item: BusinessAdminItem) => {
    setImpersonatingUuid(item.uuid);
    try {
      const result = await svc.impersonateBusiness(item.uuid);
      startImpersonation(result.token, result.business_name);
      const businessProfile = await profileSvc.getProfile();
      setProfile(businessProfile);
      setNextStep("dashboard");
      navigate(ROUTERS_PATH.DASHBOARD);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to enter business session.");
    } finally {
      setImpersonatingUuid(null);
    }
  };

  const newStatusLabel = statusTarget
    ? STATUS_OPTIONS.find((o) => o.value === String(statusTarget.newStatus))?.label ?? ""
    : "";

  const colSpan = 7;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Businesses</h2>
          <p>{total} total businesses</p>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="page-toolbar">
        <input className="filter-input" placeholder="Search businesses…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="filter-select" value={filterStatus} onChange={(e) => handleStatusFilter(e.target.value)}>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="content-card">
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Business</th>
                <th>Owner</th>
                <th>Category</th>
                <th>Status</th>
                <th>Created</th>
                <th>Change Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: colSpan }).map((__, j) => <td key={j}><div className="skeleton-cell skeleton-cell--med" /></td>)}
                    </tr>
                  ))
                : items.length === 0
                ? <tr><td colSpan={colSpan}><div className="empty-state"><div className="empty-state-icon">🏢</div><div className="empty-state-title">No businesses found</div></div></td></tr>
                : items.map((item) => (
                  <tr key={item.uuid}>
                    <td>
                      <div>
                        <strong>{item.name}</strong>
                        <div style={{ fontSize: 12, color: "#64748b" }}>{item.phone_number}</div>
                      </div>
                    </td>
                    <td>
                      <div>{item.owner_name || "—"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{item.owner_phone || ""}</div>
                    </td>
                    <td>{item.category_name || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td>
                      <span className={`status-badge ${STATUS_CLASS[item.status] ?? ""}`}>
                        {item.status_label}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "#64748b" }}>
                      {new Date(item.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <select
                        className="filter-select"
                        value={item.status}
                        style={{ fontSize: 13, padding: "5px 8px" }}
                        onChange={(e) => setStatusTarget({ item, newStatus: Number(e.target.value) })}
                      >
                        {STATUS_OPTIONS.filter((o) => o.value !== "").map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                        disabled={impersonatingUuid === item.uuid}
                        onClick={() => handleLoginAs(item)}
                      >
                        {impersonatingUuid === item.uuid ? "…" : "Login as"}
                      </button>
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

      {statusTarget && (
        <ConfirmModal
          title="Confirm Status Change"
          message={
            <>
              Change <strong>{statusTarget.item.name}</strong> status to{" "}
              <strong>{newStatusLabel}</strong>?
            </>
          }
          confirmLabel="Update"
          loading={statusLoading}
          onConfirm={handleStatusChange}
          onCancel={() => setStatusTarget(null)}
        />
      )}
    </div>
  );
};

export default SuperAdminBusinesses;
