import React from 'react';

interface PageToolbarProps {
    filters?: React.ReactNode;
    actions?: React.ReactNode;
}

const PageToolbar: React.FC<PageToolbarProps> = ({ filters, actions }) => {
    if (!filters && !actions) return null;
    return (
        <div className="page-toolbar">
            {filters && <div className="toolbar-filters">{filters}</div>}
            {actions && <div className="toolbar-actions">{actions}</div>}
        </div>
    );
};

export default PageToolbar;
