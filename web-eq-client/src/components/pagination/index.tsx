import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './pagination.scss';

export interface PaginationProps {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    maxVisible?: number;
    showFirstLast?: boolean;
    className?: string;
    disabled?: boolean;
}

const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    onPageChange,
    maxVisible = 5,
    showFirstLast = false,
    className = '',
    disabled = false,
}) => {
    const { t } = useTranslation();

    // Don't render if only one page or no pages
    if (totalPages <= 1) {
        return null;
    }

    // Generate page numbers to display
    const pageNumbers = useMemo(() => {
        const pages: (number | string)[] = [];

        if (totalPages <= maxVisible) {
            // Show all pages if total is less than max visible
            for (let i = 1; i <= totalPages; i++) {
                pages.push(i);
            }
        } else {
            // Show first page
            pages.push(1);

            // Calculate start and end of middle section
            let start = Math.max(2, currentPage - 1);
            let end = Math.min(totalPages - 1, currentPage + 1);

            // Adjust if we're near the start
            if (currentPage <= 3) {
                start = 2;
                end = Math.min(4, totalPages - 1);
            }

            // Adjust if we're near the end
            if (currentPage >= totalPages - 2) {
                start = Math.max(2, totalPages - 3);
                end = totalPages - 1;
            }

            // Add ellipsis before middle section if needed
            if (start > 2) {
                pages.push('...');
            }

            // Add middle pages
            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            // Add ellipsis after middle section if needed
            if (end < totalPages - 1) {
                pages.push('...');
            }

            // Show last page
            if (totalPages > 1) {
                pages.push(totalPages);
            }
        }

        return pages;
    }, [currentPage, totalPages, maxVisible]);

    const handlePageChange = (page: number) => {
        if (!disabled && page >= 1 && page <= totalPages && page !== currentPage) {
            onPageChange(page);
        }
    };

    const handlePrevious = () => {
        if (!disabled && currentPage > 1) {
            handlePageChange(currentPage - 1);
        }
    };

    const handleNext = () => {
        if (!disabled && currentPage < totalPages) {
            handlePageChange(currentPage + 1);
        }
    };

    const handleFirst = () => {
        if (!disabled) {
            handlePageChange(1);
        }
    };

    const handleLast = () => {
        if (!disabled) {
            handlePageChange(totalPages);
        }
    };

    return (
        <div className={`pagination ${className}`.trim()}>
            {showFirstLast && (
                <button
                    className="page-btn page-btn-nav"
                    onClick={handleFirst}
                    disabled={disabled || currentPage === 1}
                    aria-label={t("firstPage")}
                    title={t("firstPage")}
                >
                    ««
                </button>
            )}
            <button
                className="page-btn page-btn-nav"
                onClick={handlePrevious}
                disabled={disabled || currentPage === 1}
                aria-label={t("previousPage")}
                title={t("previousPage")}
            >
                ←
            </button>
            {pageNumbers.map((page, index) => {
                if (page === '...') {
                    return (
                        <button
                            key={`ellipsis-${index}`}
                            className="page-btn page-btn-ellipsis"
                            disabled
                            aria-hidden="true"
                        >
                            ...
                        </button>
                    );
                }
                const pageNum = page as number;
                return (
                    <button
                        key={pageNum}
                        className={`page-btn ${currentPage === pageNum ? 'active' : ''}`}
                        onClick={() => handlePageChange(pageNum)}
                        disabled={disabled}
                        aria-label={t("goToPage")?.replace('{page}', pageNum.toString())}
                        aria-current={currentPage === pageNum ? 'page' : undefined}
                    >
                        {pageNum}
                    </button>
                );
            })}
            <button
                className="page-btn page-btn-nav"
                onClick={handleNext}
                disabled={disabled || currentPage === totalPages}
                aria-label={t("nextPage")}
                title={t("nextPage")}
            >
                →
            </button>
            {showFirstLast && (
                <button
                    className="page-btn page-btn-nav"
                    onClick={handleLast}
                    disabled={disabled || currentPage === totalPages}
                    aria-label={t("lastPage")}
                    title={t("lastPage")}
                >
                    »»
                </button>
            )}
        </div>
    );
};

export default Pagination;
