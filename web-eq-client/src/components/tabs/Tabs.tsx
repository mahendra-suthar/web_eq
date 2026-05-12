import React from "react";
import "./tabs.scss";

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode | null;
}

interface TabsProps {
  tabs: TabItem[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
  children: React.ReactNode;
}

/**
 * Reusable tab bar + panel container.
 * Active tab: dark text + thick underline. Inactive: lighter grey, no underline.
 * Scalable: add tabs via config; render panel content via children (by convention, child can switch on activeTabId).
 */
export function Tabs({ tabs, activeTabId, onTabChange, children }: TabsProps) {
  return (
    <div className="tabs-container">
      <div className="tabs-bar" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTabId === tab.id}
            aria-controls={`tabpanel-${tab.id}`}
            id={`tab-${tab.id}`}
            className={`tabs-tab ${activeTabId === tab.id ? "tabs-tab--active" : ""}`}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon != null && (
              <span className="tabs-tab-icon" aria-hidden>
                {tab.icon}
              </span>
            )}
            <span className="tabs-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
      <div
        id={`tabpanel-${activeTabId}`}
        role="tabpanel"
        aria-labelledby={`tab-${activeTabId}`}
        className="tabs-panel"
      >
        {children}
      </div>
    </div>
  );
}
