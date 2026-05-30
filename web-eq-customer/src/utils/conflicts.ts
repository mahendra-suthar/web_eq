// Appointment time-conflict detection — TS mirror of the backend's
// app/core/utils.py `appointment_window` / `windows_overlap`. Used to flag when a
// customer holds two overlapping appointments on the same day (any business).

export interface ApptLike {
  queue_user_id: string;
  queue_date?: string | null;
  status: number; // 1=waiting, 2=in_progress, 3=completed, 5=cancelled, 7=expired, 8=scheduled
  appointment_type?: string | null;
  scheduled_start?: string | null; // "HH:MM" (24h)
  estimated_appointment_time?: string | null; // "HH:MM" or "H:MM AM/PM"
  turn_time?: number | null;
  service_duration_minutes?: number | null; // turn_time alias on some payloads
}

const ACTIVE_STATUSES = new Set([1, 2]);

/** Parse "HH:MM" (24h) or "H:MM AM/PM" (12h) → minutes since midnight, or null. */
function parseToMinutes(s?: string | null): number | null {
  if (!s) return null;
  const str = s.trim();
  const ampm = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(str);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2], 10);
    const period = ampm[3].toUpperCase();
    if (period === "AM" && h === 12) h = 0;
    if (period === "PM" && h !== 12) h += 12;
    return h * 60 + m;
  }
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(str);
  if (h24) return parseInt(h24[1], 10) * 60 + parseInt(h24[2], 10);
  return null;
}

/** [startMin, endMin] window for an appointment, or null when no time resolves. */
function windowOf(a: ApptLike): [number, number] | null {
  const turn = Math.max(a.turn_time ?? a.service_duration_minutes ?? 15, 5);
  const isFixed =
    (a.appointment_type === "FIXED" || a.appointment_type === "APPROXIMATE") && !!a.scheduled_start;
  const anchor = isFixed
    ? parseToMinutes(a.scheduled_start)
    : parseToMinutes(a.estimated_appointment_time);
  if (anchor == null) return null;
  if (isFixed) return [anchor, anchor + turn];
  const half = turn / 2;
  return [anchor - half, anchor + half];
}

function overlap(x: [number, number] | null, y: [number, number] | null): boolean {
  return !!x && !!y && x[0] < y[1] && y[0] < x[1];
}

/**
 * Return the set of queue_user_ids that overlap at least one other active
 * appointment on the same date. Only active statuses (waiting/in_progress) count.
 */
export function computeConflicts(appts: ApptLike[]): Set<string> {
  const conflicting = new Set<string>();
  const byDate = new Map<string, ApptLike[]>();
  for (const a of appts) {
    if (!ACTIVE_STATUSES.has(a.status)) continue;
    const key = a.queue_date ?? "";
    (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(a);
  }
  for (const group of byDate.values()) {
    if (group.length < 2) continue;
    const windows = group.map(windowOf);
    for (let i = 0; i < group.length; i++) {
      if (!windows[i]) continue;
      for (let j = i + 1; j < group.length; j++) {
        if (overlap(windows[i], windows[j])) {
          conflicting.add(group[i].queue_user_id);
          conflicting.add(group[j].queue_user_id);
        }
      }
    }
  }
  return conflicting;
}
