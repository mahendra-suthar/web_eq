import type { ReactNode } from "react";
import "./tabs.scss";

export interface TabItem {
  id: string;
  label: string;
  panel: ReactNode;
}

export interface TabsProps {
  activeId: string;
  items: TabItem[];
  onTabChange: (id: string) => void;
  className?: string;
}

export default function Tabs({ activeId, items, onTabChange, className = "" }: TabsProps) {
  return (
    <div className={`tabs ${className}`.trim()}>
      <div className="tabs__list" role="tablist" aria-label="Profile sections">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={activeId === item.id}
            aria-controls={`panel-${item.id}`}
            tabIndex={activeId === item.id ? 0 : -1}
            className={`tabs__tab ${activeId === item.id ? "tabs__tab--active" : ""}`}
            onClick={() => onTabChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        key={activeId}
        className="tabs__panel-wrap"
        role="tabpanel"
        id={`panel-${activeId}`}
        aria-labelledby={`tab-${activeId}`}
      >
        {items.find((t) => t.id === activeId)?.panel}
      </div>
    </div>
  );
}
