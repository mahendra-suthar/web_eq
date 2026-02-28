import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import Tabs, { type TabItem } from "../../components/tabs/Tabs";
import { AuthService } from "../../services/auth/auth.service";
import type {
  CustomerProfileResponse,
  CustomerProfileUpdateInput,
} from "../../services/auth/auth.service";
import { AppointmentService } from "../../services/appointment/appointment.service";
import type { CustomerAppointmentListItem } from "../../services/appointment/appointment.service";
import "./profile.scss";

const VALID_TABS = ["profile", "appointments", "settings"] as const;
type TabId = (typeof VALID_TABS)[number];

function isValidTab(t: string): t is TabId {
  return VALID_TABS.includes(t as TabId);
}

// --- Profile Info section ---
function ProfileInfoSection() {
  const [data, setData] = useState<CustomerProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerProfileUpdateInput>({});
  const [success, setSuccess] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const svc = new AuthService();
      const res = await svc.getCustomerProfile();
      setData(res);
      setForm({
        full_name: res.user.full_name ?? undefined,
        email: res.user.email ?? undefined,
        date_of_birth: res.user.date_of_birth ?? undefined,
        gender: res.user.gender ?? undefined,
      });
    } catch (e: any) {
      setError(e?.customMessage || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSaving(true);
    setSuccess(false);
    setError(null);
    try {
      const svc = new AuthService();
      const updated = await svc.updateCustomerProfile(form);
      setData(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      setError(e?.customMessage || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-section profile-section--loading">
        <p>Loading profile…</p>
      </div>
    );
  }

  const user = data?.user;
  return (
    <section className="profile-section profile-section--info">
      <h2 className="profile-section__title">Profile Info</h2>
      {error && <div className="profile-section__error" role="alert">{error}</div>}
      {success && <div className="profile-section__success" role="status">Profile updated.</div>}
      <form onSubmit={handleSubmit} className="profile-form">
        <div className="profile-form__row">
          <label htmlFor="profile-full_name">Name</label>
          <input
            id="profile-full_name"
            type="text"
            value={form.full_name ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value || undefined }))}
            placeholder="Full name"
            autoComplete="name"
          />
        </div>
        <div className="profile-form__row">
          <label htmlFor="profile-email">Email</label>
          <input
            id="profile-email"
            type="email"
            value={form.email ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value || undefined }))}
            placeholder="Email"
            autoComplete="email"
          />
        </div>
        <div className="profile-form__row profile-form__row--readonly">
          <label>Phone</label>
          <span>
            {user?.country_code} {user?.phone_number}
          </span>
        </div>
        <div className="profile-form__row">
          <label htmlFor="profile-dob">Date of birth</label>
          <input
            id="profile-dob"
            type="date"
            value={form.date_of_birth ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value || undefined }))}
          />
        </div>
        <div className="profile-form__row">
          <label htmlFor="profile-gender">Gender</label>
          <select
            id="profile-gender"
            value={form.gender ?? ""}
            onChange={(e) =>
              setForm((f) => ({ ...f, gender: e.target.value === "" ? undefined : Number(e.target.value) }))
            }
          >
            <option value="">Prefer not to say</option>
            <option value="1">Male</option>
            <option value="2">Female</option>
            <option value="3">Other</option>
          </select>
        </div>
        <div className="profile-form__actions">
          <button type="submit" className="profile-form__submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </section>
  );
}

// --- Appointments section ---
const PAGE_SIZE = 5;

function AppointmentsSection() {
  const [list, setList] = useState<CustomerAppointmentListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (offset: number, append: boolean) => {
    if (offset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      const svc = new AppointmentService();
      const res = await svc.getAppointments(PAGE_SIZE, offset);
      setList((prev) => (append ? [...prev, ...res.items] : res.items));
      setTotal(res.total);
      setHasMore(res.has_more);
    } catch (e: any) {
      setError(e?.customMessage || "Failed to load appointments");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    loadPage(0, false);
  }, [loadPage]);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore) return;
    loadPage(list.length, true);
  };

  const statusLabel = (status: number): string => {
    const map: Record<number, string> = {
      1: "Waiting",
      2: "In progress",
      3: "Completed",
      4: "Failed",
      5: "Cancelled",
      7: "Expired",
    };
    return map[status] ?? "Unknown";
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString(undefined, { dateStyle: "medium" });
    } catch {
      return d;
    }
  };

  return (
    <section className="profile-section profile-section--appointments">
      <h2 className="profile-section__title">Appointments</h2>
      {error && <div className="profile-section__error" role="alert">{error}</div>}
      {loading ? (
        <p className="profile-section__loading">Loading appointments…</p>
      ) : list.length === 0 ? (
        <p className="profile-section__empty">You have no appointments yet.</p>
      ) : (
        <>
          <ul className="appointment-list">
            {list.map((item) => (
              <li key={item.queue_user_id} className="appointment-list__item">
                <article className="appointment-card">
                  <div className="appointment-card__header">
                    <span className="appointment-card__business">{item.business_name}</span>
                    <span className={`appointment-card__status appointment-card__status--${item.status}`}>
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <div className="appointment-card__meta">
                    <span>{formatDate(item.queue_date)}</span>
                    <span>{item.queue_name}</span>
                    {item.service_summary && <span className="appointment-card__services">{item.service_summary}</span>}
                  </div>
                  {(item.token_number != null || item.position != null || item.estimated_wait_minutes != null || item.estimated_appointment_time != null) && (
                    <div className="appointment-card__details">
                      {item.token_number != null && (
                        <span className="appointment-card__detail">Token: {item.token_number}</span>
                      )}
                      {item.position != null && (
                        <span className="appointment-card__detail">Position: {item.position}</span>
                      )}
                      {item.estimated_wait_minutes != null && (
                        <span className="appointment-card__detail">Est. wait: {item.estimated_wait_minutes} min</span>
                      )}
                      {item.estimated_wait_range && (
                        <span className="appointment-card__detail">{item.estimated_wait_range}</span>
                      )}
                      {item.estimated_appointment_time && (
                        <span className="appointment-card__detail">Est. time: {item.estimated_appointment_time}</span>
                      )}
                    </div>
                  )}
                </article>
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="appointment-list__load-more">
              <button
                type="button"
                className="appointment-list__load-more-btn"
                onClick={handleLoadMore}
                disabled={loadingMore}
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
          {total > 0 && (
            <p className="appointment-list__count">
              Showing {list.length} of {total} appointment{total !== 1 ? "s" : ""}
            </p>
          )}
        </>
      )}
    </section>
  );
}

// --- Settings section (placeholder) ---
function SettingsSection() {
  return (
    <section className="profile-section profile-section--settings">
      <h2 className="profile-section__title">Settings</h2>
      <p className="profile-section__empty">Settings will be available here soon.</p>
    </section>
  );
}

export default function ProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "profile";
  const activeTab = isValidTab(tabParam) ? tabParam : "profile";

  const setTab = useCallback(
    (id: string) => {
      if (isValidTab(id)) {
        setSearchParams({ tab: id }, { replace: true });
      }
    },
    [setSearchParams]
  );

  const tabItems: TabItem[] = [
    { id: "profile", label: "Profile Info", panel: <ProfileInfoSection /> },
    { id: "appointments", label: "Appointments", panel: <AppointmentsSection /> },
    { id: "settings", label: "Settings", panel: <SettingsSection /> },
  ];

  return (
    <div className="profile-page">
      <div className="profile-page__inner">
        <h1 className="profile-page__heading">My account</h1>
        <Tabs activeId={activeTab} items={tabItems} onTabChange={setTab} className="profile-page__tabs" />
      </div>
    </div>
  );
}
