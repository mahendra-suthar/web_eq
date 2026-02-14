import React from 'react';
import { useTranslation } from 'react-i18next';
import '../pagination/pagination.scss';

export interface CommonPaginationProps {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
    onLimitChange?: (limit: number) => void;
    limitOptions?: number[];
    disabled?: boolean;
    className?: string;
}

/**
 * Reusable pagination: Previous/Next, current page, optional limit dropdown.
 * totalPages = ceil(total / limit). Use for users list, appointments, employees, queue users.
 */
const Pagination: React.FC<CommonPaginationProps> = ({
    page,
    limit,
    total,
    onPageChange,
    onLimitChange,
    limitOptions = [10, 20, 50, 100],
    disabled = false,
    className = '',
}) => {
    const { t } = useTranslation();
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const hasMultiplePages = totalPages > 1;
    const start = total === 0 ? 0 : (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);

    const handlePrevious = () => {
        if (!disabled && page > 1) onPageChange(page - 1);
    };

    const handleNext = () => {
        if (!disabled && page < totalPages) onPageChange(page + 1);
    };

    if (total === 0 && !onLimitChange) return null;

    return (
        <div className={`pagination common-pagination ${className}`.trim()}>
            {onLimitChange && (
                <div className="pagination-limit">
                    <label className="pagination-limit-label" htmlFor="pagination-limit">
                        {t('perPage') || 'Per page'}
                    </label>
                    <select
                        id="pagination-limit"
                        className="pagination-limit-select"
                        value={limit}
                        onChange={(e) => onLimitChange(Number(e.target.value))}
                        disabled={disabled}
                        aria-label={t('perPage') || 'Per page'}
                    >
                        {limitOptions.map((n) => (
                            <option key={n} value={n}>
                                {n}
                            </option>
                        ))}
                    </select>
                </div>
            )}
            <span className="pagination-info">
                {total === 0
                    ? t('noResults') || 'No results'
                    : `${start}–${end} ${t('of') || 'of'} ${total}`}
            </span>
            {hasMultiplePages && (
                <>
                    <button
                        type="button"
                        className="page-btn page-btn-nav"
                        onClick={handlePrevious}
                        disabled={disabled || page <= 1}
                        aria-label={t('previousPage')}
                        title={t('previousPage')}
                    >
                        ←
                    </button>
                    <span className="pagination-current" aria-current="page">
                        {t('page') || 'Page'} {page} {t('of') || 'of'} {totalPages}
                    </span>
                    <button
                        type="button"
                        className="page-btn page-btn-nav"
                        onClick={handleNext}
                        disabled={disabled || page >= totalPages}
                        aria-label={t('nextPage')}
                        title={t('nextPage')}
                    >
                        →
                    </button>
                </>
            )}
        </div>
    );
};

export default Pagination;
