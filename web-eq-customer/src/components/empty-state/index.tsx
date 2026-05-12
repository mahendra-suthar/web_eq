import type { ReactNode } from "react";
import "./empty-state.scss";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
}

export default function EmptyState(props: EmptyStateProps) {
  const { icon, title, hint, action, className = "" } = props;
  return (
    <div className={"empty-state " + className.trim()} role="status">
      {icon != null && (
        <div className="empty-state__icon" aria-hidden>
          {icon}
        </div>
      )}
      <p className="empty-state__title">{title}</p>
      {hint ? <p className="empty-state__hint">{hint}</p> : null}
      {action ? <div className="empty-state__action">{action}</div> : null}
    </div>
  );
}
