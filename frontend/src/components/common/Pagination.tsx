import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../i18n/useLanguage';

export interface PaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems?: number;
    pageSize?: number;
    onPageChange: (page: number) => void;
    className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
    currentPage,
    totalPages,
    totalItems,
    pageSize = 25,
    onPageChange,
    className = '',
}) => {
    const { language } = useLanguage();
    const pl = language === 'PL';

    if (totalPages <= 0) return null;
    if (totalPages <= 1 && (totalItems === undefined || totalItems <= pageSize)) return null;

    const fromItem = totalItems !== undefined ? Math.min((currentPage - 1) * pageSize + 1, totalItems) : null;
    const toItem = totalItems !== undefined ? Math.min(currentPage * pageSize, totalItems) : null;

    const getPageNumbers = () => {
        const pages: (number | 'ellipsis')[] = [];
        if (totalPages <= 7) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            pages.push(1);
            if (currentPage > 3) {
                pages.push('ellipsis');
            }

            const start = Math.max(2, currentPage - 1);
            const end = Math.min(totalPages - 1, currentPage + 1);

            for (let i = start; i <= end; i++) {
                if (!pages.includes(i)) pages.push(i);
            }

            if (currentPage < totalPages - 2) {
                pages.push('ellipsis');
            }
            if (!pages.includes(totalPages)) {
                pages.push(totalPages);
            }
        }
        return pages;
    };

    const pages = getPageNumbers();

    return (
        <nav
            className={`flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-brand-border bg-brand-surface/40 ${className}`}
            aria-label="Pagination"
        >
            {totalItems !== undefined && fromItem !== null && toItem !== null ? (
                <div className="text-xs text-brand-text-muted font-medium">
                    {pl
                        ? `Wyświetlono ${fromItem}–${toItem} z ${totalItems}`
                        : `Showing ${fromItem}–${toItem} of ${totalItems}`}
                </div>
            ) : (
                <div className="text-xs text-brand-text-muted font-medium">
                    {pl ? 'Strona' : 'Page'} {currentPage} {pl ? 'z' : 'of'} {totalPages}
                </div>
            )}

            {totalPages > 1 && (
                <div className="flex flex-wrap justify-center items-center gap-1.5">
                    <button
                        type="button"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                        title={pl ? 'Poprzednia' : 'Previous'}
                        aria-label={pl ? 'Poprzednia' : 'Previous'}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border bg-brand-bg text-brand-text-muted hover:border-brand-accent/40 hover:bg-brand-surface-high hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-95 cursor-pointer"
                    >
                        <ChevronLeft size={16} />
                    </button>

                    {pages.map((p, idx) => {
                        if (p === 'ellipsis') {
                            return (
                                <span
                                    key={idx === 1 ? 'ellipsis-start' : 'ellipsis-end'}
                                    className="px-1 text-xs text-brand-text-muted font-mono select-none"
                                >
                                    ..
                                </span>
                            );
                        }

                        const isActive = p === currentPage;
                        return (
                            <button
                                key={p}
                                type="button"
                                onClick={() => onPageChange(p)}
                                aria-current={isActive ? 'page' : undefined}
                                aria-label={`${pl ? 'Strona' : 'Page'} ${p}`}
                                className={`flex h-8 min-w-8 px-2 items-center justify-center rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                                    isActive
                                        ? 'border border-indigo-500 bg-indigo-500/30 text-indigo-200 shadow-sm'
                                        : 'border border-brand-border bg-brand-bg text-brand-text-muted hover:border-brand-accent/40 hover:bg-brand-surface-high hover:text-brand-text'
                                }`}
                            >
                                {p}
                            </button>
                        );
                    })}

                    <button
                        type="button"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                        title={pl ? 'Następna' : 'Next'}
                        aria-label={pl ? 'Następna' : 'Next'}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-brand-border bg-brand-bg text-brand-text-muted hover:border-brand-accent/40 hover:bg-brand-surface-high hover:text-brand-text disabled:cursor-not-allowed disabled:opacity-40 transition-all active:scale-95 cursor-pointer"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </nav>
    );
};
