import React, { useCallback, useEffect, useState } from "react";
import {
  SuperAdminService,
  ServiceAdminItem,
  CategoryAdminItem,
  ServicePayload,
} from "../../../services/super-admin/super-admin.service";
import { useAdminList } from "../../../hooks/useAdminList";
import { ConfirmModal } from "../../../components/confirm-modal";
import { ADMIN_LIST_LIMIT } from "../../../utils/constants";

const svc = new SuperAdminService();

interface ModalProps {
  initial?: ServiceAdminItem | null;
  categories: CategoryAdminItem[];
  onSave: (data: ServicePayload) => Promise<void>;
  onClose: () => void;
}

const ServiceModal = ({ initial, categories, onSave, onClose }: ModalProps) => {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onSave({ name: name.trim(), description: description.trim() || null, category_id: categoryId || null });
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to save.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h3>{initial ? "Edit Service" : "Add Service"}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert--error">{error}</div>}
            <div className="form-group">
              <label>Name *</label>
              <input className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Service name" autoFocus required />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-textarea" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select className="form-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">No category</option>
                {categories.map((c) => <option key={c.uuid} value={c.uuid}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              {loading ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const SuperAdminServices = () => {
  const [categories, setCategories] = useState<CategoryAdminItem[]>([]);
  const [filterCategory, setFilterCategory] = useState("");
  const [modalItem, setModalItem] = useState<ServiceAdminItem | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceAdminItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    svc.getCategories({ limit: 200 }).then((r) => setCategories(r.items)).catch(() => {});
  }, []);

  const { items, total, page, pages, search, loading, error, setSearch, setPage, setFilters, refresh, setError } =
    useAdminList<ServiceAdminItem>({
      fetchFn: useCallback(
        (p, s, f) => svc.getServices({ page: p, limit: ADMIN_LIST_LIMIT, search: s || undefined, category_id: f.category_id || undefined }),
        []
      ),
    });

  const handleCategoryFilter = (val: string) => {
    setFilterCategory(val);
    setFilters({ category_id: val });
  };

  const handleSave = async (data: ServicePayload) => {
    if (modalItem && modalItem !== "new") await svc.updateService(modalItem.uuid, data);
    else await svc.createService(data);
    refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await svc.deleteService(deleteTarget.uuid);
      setDeleteTarget(null);
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to delete service.");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Services</h2>
          <p>{total} total services</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalItem("new")}>+ Add Service</button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="page-toolbar">
        <input className="filter-input" placeholder="Search services…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="filter-select" value={filterCategory} onChange={(e) => handleCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.uuid} value={c.uuid}>{c.name}</option>)}
        </select>
      </div>

      <div className="content-card">
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Category</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 4 }).map((__, j) => <td key={j}><div className="skeleton-cell skeleton-cell--med" /></td>)}
                    </tr>
                  ))
                : items.length === 0
                ? <tr><td colSpan={4}><div className="empty-state"><div className="empty-state-icon">🔧</div><div className="empty-state-title">No services found</div></div></td></tr>
                : items.map((item) => (
                  <tr key={item.uuid}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.description || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td>{item.category_name || <span style={{ color: "#94a3b8" }}>Uncategorised</span>}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="action-btn" onClick={() => setModalItem(item)}>✏️</button>
                        <button className="action-btn action-btn--danger" onClick={() => setDeleteTarget(item)}>🗑️</button>
                      </div>
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

      {modalItem !== null && (
        <ServiceModal
          initial={modalItem === "new" ? null : modalItem}
          categories={categories}
          onSave={handleSave}
          onClose={() => setModalItem(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Service"
          message={<>Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.</>}
          confirmLabel="Delete"
          destructive
          loading={deleteLoading}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default SuperAdminServices;
