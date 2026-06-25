import type { LeaveBatchResult } from "../../services/schedule/schedule.service";

/* ── date helpers ────────────────────────────────────────────────────────────── */
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysFromToday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function relativeLabel(iso: string): string {
  const n = daysFromToday(iso);
  if (Number.isNaN(n)) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`;
}

export function formatLeaveDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

/* ── leave helpers ───────────────────────────────────────────────────────────── */
export type LeaveLike = { is_closed: boolean; special_opening_time?: string | null; special_closing_time?: string | null };

export function leaveTypeLabel(l: LeaveLike): string {
  if (l.is_closed) return "Full-day leave";
  if (l.special_opening_time || l.special_closing_time) {
    return `Custom hours ${l.special_opening_time ?? ""}${l.special_closing_time ? `–${l.special_closing_time}` : ""}`.trim();
  }
  return "Schedule change";
}

export function getInitials(name?: string | null): string {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

/* ── grouping (multi-day leave shares a leave_group_id) ──────────────────────── */
export type GroupableLeave = {
  uuid: string;
  schedule_id: string;
  exception_date: string;
  status: string;
  is_closed: boolean;
  special_opening_time?: string | null;
  special_closing_time?: string | null;
  reason?: string | null;
  created_by_role?: string | null;
  leave_group_id?: string | null;
};

export interface LeaveGroup<T extends GroupableLeave> {
  key: string;
  groupId: string | null;
  rows: T[];
  first: T;
  startDate: string;
  endDate: string;
  count: number;
  status: string;
}

export function groupLeaves<T extends GroupableLeave>(rows: T[]): LeaveGroup<T>[] {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const key = r.leave_group_id ? `g:${r.leave_group_id}` : `s:${r.uuid}`;
    const arr = map.get(key);
    if (arr) arr.push(r);
    else map.set(key, [r]);
  }
  return [...map.entries()].map(([key, group]) => {
    const sorted = [...group].sort((a, b) => (a.exception_date < b.exception_date ? -1 : 1));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const statuses = new Set(sorted.map((r) => r.status));
    return {
      key,
      groupId: first.leave_group_id ?? null,
      rows: sorted,
      first,
      startDate: first.exception_date,
      endDate: last.exception_date,
      count: sorted.length,
      status: statuses.size === 1 ? first.status : "MIXED",
    };
  });
}

export function spanLabel(g: LeaveGroup<GroupableLeave>): string {
  return g.count === 1 ? formatLeaveDate(g.startDate) : `${formatLeaveDate(g.startDate)} – ${formatLeaveDate(g.endDate)}`;
}

export function dayCountLabel(count: number): string {
  return `${count} ${count === 1 ? "day" : "days"}`;
}

export function summarize(r: LeaveBatchResult, verb: string): string {
  const n = r.created.length;
  let msg = `${verb} ${n} ${n === 1 ? "day" : "days"}`;
  const skips: string[] = [];
  if (r.skipped_non_working.length) skips.push(`${r.skipped_non_working.length} non-working`);
  if (r.skipped_existing.length) skips.push(`${r.skipped_existing.length} already had leave`);
  if (r.skipped_booked.length) skips.push(`${r.skipped_booked.length} already booked`);
  if (skips.length) msg += ` · skipped ${skips.join(", ")}`;
  return msg;
}
