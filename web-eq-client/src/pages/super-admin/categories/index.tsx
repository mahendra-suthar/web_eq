import React, { useCallback, useMemo, useState } from "react";
import {
  SuperAdminService,
  CategoryAdminItem,
  CategoryPayload,
} from "../../../services/super-admin/super-admin.service";
import { useAdminList } from "../../../hooks/useAdminList";
import { ConfirmModal } from "../../../components/confirm-modal";
import { ADMIN_LIST_LIMIT } from "../../../utils/constants";

const svc = new SuperAdminService();

interface ModalProps {
  initial?: CategoryAdminItem | null;
  parentOptions: { uuid: string; name: string }[];
  onSave: (data: CategoryPayload) => Promise<void>;
  onClose: () => void;
}

const CategoryModal = ({ initial, parentOptions, onSave, onClose }: ModalProps) => {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [parentId, setParentId] = useState(initial?.parent_category_id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        parent_category_id: parentId || null,
      });
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
          <h3>{initial ? "Edit Category" : "Add Category"}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="alert alert--error">{error}</div>}
            <div className="form-group">
              <label>Name *</label>
              <input
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Category name"
                autoFocus
                required
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
            <div className="form-group">
              <label>Parent Category</label>
              <select
                className="form-select"
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">None (top-level)</option>
                {parentOptions
                  .filter((o) => o.uuid !== initial?.uuid)
                  .map((o) => (
                    <option key={o.uuid} value={o.uuid}>{o.name}</option>
                  ))}
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

const SuperAdminCategories = () => {
  const [modalItem, setModalItem] = useState<CategoryAdminItem | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryAdminItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const { items, total, page, pages, search, loading, error, setSearch, setPage, refresh, setError } =
    useAdminList<CategoryAdminItem>({
      fetchFn: useCallback(
        (p, s) => svc.getCategories({ page: p, limit: ADMIN_LIST_LIMIT, search: s || undefined }),
        []
      ),
    });

  const parentOptions = useMemo(
    () => items.filter((i) => !i.parent_category_id).map((i) => ({ uuid: i.uuid, name: i.name })),
    [items]
  );

  const handleSave = async (data: CategoryPayload) => {
    if (modalItem && modalItem !== "new") {
      await svc.updateCategory(modalItem.uuid, data);
    } else {
      await svc.createCategory(data);
    }
    refresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await svc.deleteCategory(deleteTarget.uuid);
      setDeleteTarget(null);
      refresh();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to delete category.");
      setDeleteTarget(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Categories</h2>
          <p>{total} total categories</p>
        </div>
        <button className="btn btn-primary" onClick={() => setModalItem("new")}>+ Add Category</button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="page-toolbar">
        <input
          className="filter-input"
          placeholder="Search categories…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="content-card">
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Parent</th>
                <th>Subcategories</th>
                <th>Services</th>
                <th>Businesses</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i} className="skeleton-row">
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton-cell skeleton-cell--med" /></td>
                      ))}
                    </tr>
                  ))
                : items.length === 0
                ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="empty-state">
                        <div className="empty-state-icon">🗂️</div>
                        <div className="empty-state-title">No categories found</div>
                        <div className="empty-state-sub">Add your first category to get started.</div>
                      </div>
                    </td>
                  </tr>
                )
                : items.map((item) => (
                  <tr key={item.uuid}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.description || <span style={{ color: "#94a3b8" }}>—</span>}</td>
                    <td>
                      {item.parent_category_id
                        ? items.find((i) => i.uuid === item.parent_category_id)?.name ?? "—"
                        : <span className="status-badge active">Root</span>
                      }
                    </td>
                    <td>{item.subcategories_count}</td>
                    <td>{item.services_count}</td>
                    <td>{item.businesses_count}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="action-btn" title="Edit" onClick={() => setModalItem(item)}>✏️</button>
                        <button
                          className="action-btn action-btn--danger"
                          title="Delete"
                          onClick={() => setDeleteTarget(item)}
                        >🗑️</button>
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
        <CategoryModal
          initial={modalItem === "new" ? null : modalItem}
          parentOptions={parentOptions}
          onSave={handleSave}
          onClose={() => setModalItem(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Category"
          message={
            <>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
              This cannot be undone. Categories with subcategories or services cannot be deleted.
            </>
          }
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

export default SuperAdminCategories;
