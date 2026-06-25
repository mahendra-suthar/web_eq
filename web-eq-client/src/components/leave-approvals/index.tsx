import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ScheduleService } from "../../services/schedule/schedule.service";
import { ROUTERS_PATH } from "../../routers/routers";
import "./leave-approvals.scss";

interface LeaveApprovalTasksProps {
  businessId: string;
}

/**
 * Dashboard banner: surfaces how many employee leave requests are awaiting
 * approval and links to the Leave page where they're actioned. Renders nothing
 * when there's nothing pending. The full approve/reject UI lives on the Leave page.
 */
export default function LeaveApprovalTasks({ businessId }: LeaveApprovalTasksProps) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!businessId) return;
    try {
      const data = await new ScheduleService().getPendingLeaves(businessId);
      setCount((data ?? []).length);
    } catch {
      // Non-fatal: the banner simply stays hidden if it can't load.
      setCount(0);
    } finally {
      setLoaded(true);
    }
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  if (!loaded || count === 0) return null;

  return (
    <div className="leave-tasks-banner" role="status">
      <span className="leave-tasks-banner__icon" aria-hidden="true">📋</span>
      <div className="leave-tasks-banner__text">
        <strong>{count} {count === 1 ? "task" : "tasks"} waiting for your approval</strong>
        <p>Employee leave {count === 1 ? "request needs" : "requests need"} your review.</p>
      </div>
      <button type="button" className="leave-tasks-banner__btn" onClick={() => navigate(ROUTERS_PATH.LEAVE)}>
        Review leave
      </button>
    </div>
  );
}
