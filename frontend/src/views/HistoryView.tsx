import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { masterApi } from '../api/masterApi';
import { getFisUnitHistoryUrl } from '../api/fisApi';
import { Badge, type BadgeVariant } from '../components/common/Badge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { getErrorMessage } from '../lib/errors';
import { useLanguage } from '../i18n/useLanguage';
import { Pagination } from '../components/common/Pagination';
import { parsePaginationParams } from '../lib/masterUtils';
import { useAdaptiveTableColumns } from '../hooks/useAdaptiveTableColumns';
import {
    Search,
    RefreshCw,
    RotateCcw,
    Calendar,
    X,
    ExternalLink,
} from 'lucide-react';

export const HistoryView: React.FC = () => {
    const { language, t } = useLanguage();
    const [searchParams, setSearchParams] = useSearchParams();

    // Filters derived from searchParams as single source of truth
    const urlUnit = searchParams.get('unit') ?? '';
    const urlProcess = searchParams.get('process') ?? '';
    const urlUser = searchParams.get('user') ?? '';

    const [unitFilter, setUnitFilter] = useState(urlUnit);
    const [processFilter, setProcessFilter] = useState(urlProcess);
    const [userFilter, setUserFilter] = useState(urlUser);

    const operationFilter = searchParams.get('operation') ?? '';
    const statusFilter = searchParams.get('status') ?? '';
    const dateFrom = searchParams.get('dateFrom') ?? '';
    const dateTo = searchParams.get('dateTo') ?? '';
    const { page, pageSize } = parsePaginationParams(searchParams);

    // Synchronize local input filters when searchParams changes externally
    useEffect(() => {
        if (urlUnit !== unitFilter) setUnitFilter(urlUnit);
    }, [urlUnit]);
    useEffect(() => {
        if (urlProcess !== processFilter) setProcessFilter(urlProcess);
    }, [urlProcess]);
    useEffect(() => {
        if (urlUser !== userFilter) setUserFilter(urlUser);
    }, [urlUser]);

    const updateFilters = (updates: Record<string, string | number | null | undefined>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, val]) => {
                if (
                    val === undefined ||
                    val === null ||
                    val === '' ||
                    (key === 'page' && Number(val) <= 1) ||
                    (key === 'pageSize' && Number(val) === 50)
                ) {
                    next.delete(key);
                } else {
                    next.set(key, String(val));
                }
            });
            return next;
        }, { replace: true });
    };

    const debouncedUnitFilter = useDebouncedValue(unitFilter);
    const debouncedUserFilter = useDebouncedValue(userFilter);
    const debouncedProcessFilter = useDebouncedValue(processFilter);

    // Debounce text inputs sync to searchParams
    useEffect(() => {
        if (debouncedUnitFilter !== (searchParams.get('unit') ?? '')) {
            updateFilters({ unit: debouncedUnitFilter, page: 1 });
        }
    }, [debouncedUnitFilter]);

    useEffect(() => {
        if (debouncedProcessFilter !== (searchParams.get('process') ?? '')) {
            updateFilters({ process: debouncedProcessFilter, page: 1 });
        }
    }, [debouncedProcessFilter]);

    useEffect(() => {
        if (debouncedUserFilter !== (searchParams.get('user') ?? '')) {
            updateFilters({ user: debouncedUserFilter, page: 1 });
        }
    }, [debouncedUserFilter]);

    const filtersKey = JSON.stringify([debouncedUnitFilter, operationFilter, debouncedUserFilter, debouncedProcessFilter, statusFilter, dateFrom, dateTo, pageSize]);
    const tableScrollRef = useRef<HTMLTableSectionElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const paginationRef = useRef<HTMLDivElement>(null);
    const pendingPageRef = useRef<number | null>(null);

    useEffect(() => {
        tableScrollRef.current?.scrollTo({ top: 0 });
    }, [filtersKey]);

    const { data: historyPage, isLoading, isFetching, refetch, error } = useQuery({
        queryKey: ['history', filtersKey, page],
        placeholderData: (previousData, previousQuery) =>
            previousQuery?.queryKey[1] === filtersKey ? previousData : undefined,
        queryFn: () => masterApi.getHistory({
            unit: debouncedUnitFilter,
            operation: operationFilter,
            user: debouncedUserFilter,
            process: debouncedProcessFilter,
            status: statusFilter,
            dateFrom,
            dateTo,
            limit: Math.min(pageSize + 1, 500),
            offset: (page - 1) * pageSize,
        }),
    });

    const historyRecords = historyPage?.records ?? [];
    const visibleRecords = historyRecords.slice(0, pageSize);
    const totalItems = historyPage?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useAdaptiveTableColumns(tableRef, historyRecords, 9, 3, language);
    useLayoutEffect(() => {
        if (!isFetching && pendingPageRef.current === page) {
            paginationRef.current?.scrollIntoView({ block: 'nearest' });
            pendingPageRef.current = null;
        }
    }, [page, isFetching, historyPage]);
    const handlePageChange = (nextPage: number) => {
        pendingPageRef.current = nextPage;
        updateFilters({ page: nextPage });
        tableScrollRef.current?.scrollTo({ top: 0 });
    };

    const getOperationBadgeVariant = (op: string): BadgeVariant => {
        switch (op.toLowerCase()) {
            case 'create':
                return 'success';
            case 'update':
                return 'info';
            case 'reset':
            case 'resetcycles':
            case 'reseterrors':
                return 'warning';
            case 'block':
            case 'delete':
                return 'danger';
            case 'activate':
                return 'purple';
            default:
                return 'neutral';
        }
    };

    const getOperationLabel = (op: string): string => {
        switch (op.toLowerCase()) {
            case 'create':
                return t.opCreate;
            case 'update':
                return t.opUpdate;
            case 'reset':
                return t.opReset;
            case 'resetcycles':
                return t.opResetCycles;
            case 'reseterrors':
                return t.opResetErrors;
            case 'block':
                return t.opBlock;
            case 'activate':
                return t.opActivate;
            case 'delete':
                return t.opDelete;
            default:
                return op;
        }
    };

    const clearFilters = () => {
        setUnitFilter('');
        setProcessFilter('');
        setUserFilter('');
        setSearchParams({}, { replace: true });
    };

    const hasActiveFilters = Boolean(unitFilter || operationFilter || userFilter || processFilter || statusFilter || dateFrom || dateTo);

    return (
        <div className="space-y-6">
            <ErrorBanner message={error ? (language === 'PL' ? getErrorMessage(error, t.historyLoadError) : t.historyLoadError) : null} />

            {/* Filter Bar with Date Range, Status & Process */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    {/* SN Search */}
                    <div className="space-y-1 flex-1 min-w-[170px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.historySnLabel}
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={15} />
                            <input
                                type="text"
                                placeholder={t.historySnPlaceholder}
                                value={unitFilter}
                                onChange={(e) => setUnitFilter(e.target.value)}
                                className="w-full h-9 pl-9 pr-7 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {unitFilter && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUnitFilter('');
                                        updateFilters({ unit: '', page: 1 });
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-text-muted hover:text-white"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Process Search */}
                    <div className="space-y-1 min-w-[150px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.processLabel}
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={t.historyProcessPlaceholder}
                                value={processFilter}
                                onChange={(e) => setProcessFilter(e.target.value)}
                                className="w-full h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {processFilter && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setProcessFilter('');
                                        updateFilters({ process: '', page: 1 });
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-text-muted hover:text-white"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Operation Filter */}
                    <div className="space-y-1 min-w-[160px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.thOperation}
                        </label>
                        <select
                            value={operationFilter}
                            onChange={(e) => updateFilters({ operation: e.target.value, page: 1 })}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent font-mono transition-colors hover:border-brand-text-muted/60 cursor-pointer"
                        >
                            <option value="">{t.allOperations}</option>
                            <option value="Create">{t.opCreate}</option>
                            <option value="Update">{t.opUpdate}</option>
                            <option value="Reset">{t.opReset}</option>
                            <option value="ResetCycles">{t.opResetCycles}</option>
                            <option value="ResetErrors">{t.opResetErrors}</option>
                            <option value="Block">{t.opBlock}</option>
                            <option value="Activate">{t.opActivate}</option>
                            <option value="Delete">{t.opDelete}</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-1 min-w-[110px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.thStatus}
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => updateFilters({ status: e.target.value, page: 1 })}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent font-mono transition-colors hover:border-brand-text-muted/60 cursor-pointer"
                        >
                            <option value="">{t.allStatuses}</option>
                            <option value="GOOD">{t.goodStatusLabel}</option>
                            <option value="BAD">{t.badStatusLabel}</option>
                        </select>
                    </div>

                    {/* Date From */}
                    <div className="space-y-1 min-w-[135px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted flex items-center gap-1">
                            <Calendar size={11} className="text-brand-accent" />
                            <span>{t.filterDateFrom}</span>
                        </label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => updateFilters({ dateFrom: e.target.value, page: 1 })}
                            className="h-9 px-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer"
                        />
                    </div>

                    {/* Date To */}
                    <div className="space-y-1 min-w-[135px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted flex items-center gap-1">
                            <Calendar size={11} className="text-brand-accent" />
                            <span>{t.filterDateTo}</span>
                        </label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => updateFilters({ dateTo: e.target.value, page: 1 })}
                            className="h-9 px-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer"
                        />
                    </div>

                    {/* User Search */}
                    <div className="space-y-1 min-w-[140px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.historyUser}
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={t.historyOperatorPlaceholder}
                                value={userFilter}
                                onChange={(e) => setUserFilter(e.target.value)}
                                className="w-full h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {userFilter && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setUserFilter('');
                                        updateFilters({ user: '', page: 1 });
                                    }}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-text-muted hover:text-white"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Rows per page */}
                    <div className="space-y-1">
                        <label htmlFor="history-page-size" className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.rowsPerPage}
                        </label>
                        <select
                            id="history-page-size"
                            value={pageSize}
                            onChange={(event) => updateFilters({ pageSize: Number(event.target.value), page: 1 })}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer"
                        >
                            {[15, 25, 50, 100, 250, 500].map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                    </div>

                    {/* Clear Filters Button */}
                    <button
                        type="button"
                        onClick={clearFilters}
                        disabled={!hasActiveFilters}
                        className={`interactive-button h-9 px-3.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                            hasActiveFilters
                                ? 'bg-indigo-500/20 border-brand-accent text-indigo-300 hover:bg-indigo-500/30'
                                : 'opacity-40 cursor-not-allowed bg-brand-surface-high border-brand-border text-brand-text-muted'
                        }`}
                        title={t.historyClearAll}
                    >
                        <RotateCcw size={13} />
                        <span>{t.historyClear}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="interactive-button h-9 px-3.5 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:border-brand-text-muted/60 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={isFetching ? 'animate-spin text-brand-accent' : ''} />
                        <span>{t.refresh}</span>
                    </button>
                </div>

                <div className="flex items-center justify-between text-xs text-brand-text-muted font-mono pt-1 border-t border-brand-border/60">
                    <span>
                        {error ? t.historyCountError : isLoading ? t.historyLoadingCount : t.historyCount.replace('{count}', String(totalItems))}
                    </span>
                    {hasActiveFilters && (
                        <span className="text-brand-accent font-medium">{t.historyActiveFilters}</span>
                    )}
                </div>
            </div>

            {/* History Table */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table ref={tableRef} className="split-scroll-table text-left text-[13px] border-collapse">
                        <thead>
                            <tr className="bg-brand-surface text-brand-text-muted font-mono text-xs uppercase tracking-wider border-b border-brand-border">
                                <th className="py-3 px-4 font-semibold">{t.historyDateTime}</th>
                                <th className="py-3 px-4 font-semibold">{t.historySerialUnit}</th>
                                <th className="py-3 px-4 font-semibold">{t.thOperation}</th>
                                <th className="py-3 px-4 font-semibold">{t.processLabel}</th>
                                <th className="py-3 px-4 font-semibold text-center">{t.thStatus}</th>
                                <th className="py-3 px-4 font-semibold">{t.historyCycles}</th>
                                <th className="py-3 px-4 font-semibold">{t.historyErrors}</th>
                                <th className="py-3 px-4 font-semibold">{t.thGlobal}</th>
                                <th className="py-3 px-4 font-semibold">{t.historyUser}</th>
                            </tr>
                        </thead>
                        <tbody ref={tableScrollRef} className="divide-y divide-brand-border/50 text-brand-text font-mono text-[13px]">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-brand-accent" size={20} />
                                            <span>{t.historyLoading}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted font-sans">
                                        {t.historyLoadError}
                                    </td>
                                </tr>
                            ) : visibleRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                        {t.historyNoMatches}
                                    </td>
                                </tr>
                            ) : (
                                visibleRecords.map((rec, idx) => (
                                    <tr
                                        key={rec.id}
                                        style={{ animationDelay: `${Math.min(idx * 15, 300)}ms` }}
                                        className="animate-row-enter hover:bg-brand-surface-high/50 transition-colors duration-150"
                                    >
                                        <td className="py-3 px-4 text-brand-text-muted whitespace-nowrap">
                                            {rec.date}
                                        </td>
                                        <td className="py-3 px-4 font-bold text-brand-text tracking-wide">
                                            <div className="flex items-center gap-1.5 w-max">
                                                <Link
                                                    to={`/?search=${encodeURIComponent(rec.unit)}`}
                                                    className="whitespace-nowrap font-mono text-brand-accent hover:text-indigo-300 hover:underline"
                                                    title={t.historyDashboardLink.replace('{unit}', rec.unit)}
                                                >
                                                    <span>{rec.unit}</span>
                                                </Link>
                                                {rec.FIS && ['FIS1', 'FIS2', '1', '2'].includes(rec.FIS.trim().toUpperCase()) && <a
                                                    href={getFisUnitHistoryUrl(rec.unit, rec.FIS)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-0.5 text-brand-text-muted/40 hover:text-brand-accent transition-colors"
                                                    title={t.historyFisLink}
                                                >
                                                    <ExternalLink size={11} className="opacity-70" />
                                                </a>}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge variant={getOperationBadgeVariant(rec.operation)}>
                                                {getOperationLabel(rec.operation)}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-brand-text font-semibold">
                                            <span className="block w-max max-w-[17rem] [overflow-wrap:anywhere]">{rec.process}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {rec.status === 'GOOD' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                    GOOD
                                                </span>
                                            ) : rec.status === 'BAD' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                                    BAD
                                                </span>
                                            ) : (
                                                <span className="text-brand-text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-slate-200">
                                            {rec.currentCounter} <span className="text-brand-text-muted/60">/ {rec.maxCounter}</span>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={rec.errorCounter > 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                                                {rec.errorCounter}
                                            </span>
                                            <span className="text-brand-text-muted/60"> / {rec.errorMaxCounter}</span>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-200">
                                            {rec.globalCounter?.toLocaleString() ?? 0}
                                        </td>
                                        <td className="py-3 px-4 text-brand-text-muted font-sans">
                                            {rec.user || '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div ref={paginationRef}>
                    {!error && !isLoading && (
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            pageSize={pageSize}
                            onPageChange={handlePageChange}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
