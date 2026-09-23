import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { masterApi } from '../api/masterApi';
import { getFisUnitHistoryUrl } from '../api/fisApi';
import { Badge, type BadgeVariant } from '../components/common/Badge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { getErrorMessage } from '../lib/errors';
import { useLanguage } from '../i18n/useLanguage';
import { Pagination } from '../components/common/Pagination';
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
    const [unitFilter, setUnitFilter] = useState('');
    const [operationFilter, setOperationFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [processFilter, setProcessFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [pageSize, setPageSize] = useState(50);

    const debouncedUnitFilter = useDebouncedValue(unitFilter);
    const debouncedUserFilter = useDebouncedValue(userFilter);
    const debouncedProcessFilter = useDebouncedValue(processFilter);

    const filtersKey = JSON.stringify([debouncedUnitFilter, operationFilter, debouncedUserFilter, debouncedProcessFilter, statusFilter, dateFrom, dateTo, pageSize]);
    const [pagination, setPagination] = useState({ filtersKey, page: 1 });
    const page = pagination.filtersKey === filtersKey ? pagination.page : 1;
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
        setPagination({ filtersKey, page: nextPage });
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
                return t.opCreate || 'Utworzenie';
            case 'update':
                return t.opUpdate || 'Aktualizacja';
            case 'reset':
                return t.opReset || 'Reset Liczników';
            case 'resetcycles':
                return t.opResetCycles || 'Reset Cykli';
            case 'reseterrors':
                return t.opResetErrors || 'Reset Błędów';
            case 'block':
                return t.opBlock || 'Zablokowanie';
            case 'activate':
                return t.opActivate || 'Aktywacja';
            case 'delete':
                return t.opDelete || 'Usunięcie';
            default:
                return op;
        }
    };

    const clearFilters = () => {
        setUnitFilter('');
        setOperationFilter('');
        setUserFilter('');
        setProcessFilter('');
        setStatusFilter('');
        setDateFrom('');
        setDateTo('');
    };

    const hasActiveFilters = Boolean(unitFilter || operationFilter || userFilter || processFilter || statusFilter || dateFrom || dateTo);

    return (
        <div className="space-y-6">
            <ErrorBanner message={error ? getErrorMessage(error, 'Nie udało się pobrać historii.') : null} />

            {/* Filter Bar with Date Range, Status & Process */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    {/* SN Search */}
                    <div className="space-y-1 flex-1 min-w-[170px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            Numer SN
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={15} />
                            <input
                                type="text"
                                placeholder="Szukaj SN..."
                                value={unitFilter}
                                onChange={(e) => setUnitFilter(e.target.value)}
                                className="w-full h-9 pl-9 pr-7 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {unitFilter && (
                                <button
                                    type="button"
                                    onClick={() => setUnitFilter('')}
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
                            Proces
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="np. SMT, AOI..."
                                value={processFilter}
                                onChange={(e) => setProcessFilter(e.target.value)}
                                className="w-full h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {processFilter && (
                                <button
                                    type="button"
                                    onClick={() => setProcessFilter('')}
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
                            Operacja
                        </label>
                        <select
                            value={operationFilter}
                            onChange={(e) => setOperationFilter(e.target.value)}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent font-mono transition-colors hover:border-brand-text-muted/60 cursor-pointer"
                        >
                            <option value="">{t.allOperations}</option>
                            <option value="Create">Create (Utworzenie)</option>
                            <option value="Update">Update (Aktualizacja)</option>
                            <option value="Reset">Reset (Wszystkie Liczniki)</option>
                            <option value="ResetCycles">ResetCycles (Tylko Cykle)</option>
                            <option value="ResetErrors">ResetErrors (Tylko Błędy)</option>
                            <option value="Block">Block (Zablokowanie)</option>
                            <option value="Activate">Activate (Aktywacja)</option>
                            <option value="Delete">Delete (Usunięcie)</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-1 min-w-[110px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            Status
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent font-mono transition-colors hover:border-brand-text-muted/60 cursor-pointer"
                        >
                            <option value="">{t.allStatuses}</option>
                            <option value="GOOD">GOOD</option>
                            <option value="BAD">BAD</option>
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
                            onChange={(e) => setDateFrom(e.target.value)}
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
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-9 px-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer"
                        />
                    </div>

                    {/* User Search */}
                    <div className="space-y-1 min-w-[140px]">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            Użytkownik
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Operator..."
                                value={userFilter}
                                onChange={(e) => setUserFilter(e.target.value)}
                                className="w-full h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {userFilter && (
                                <button
                                    type="button"
                                    onClick={() => setUserFilter('')}
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
                            onChange={(event) => {
                                setPageSize(Number(event.target.value));
                                setPagination({ filtersKey: '', page: 1 });
                            }}
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
                        title="Wyczyść wszystkie filtry"
                    >
                        <RotateCcw size={13} />
                        <span>Wyczyść</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="interactive-button h-9 px-3.5 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:border-brand-text-muted/60 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={isFetching ? 'animate-spin text-brand-accent' : ''} />
                        <span>Odśwież</span>
                    </button>
                </div>

                <div className="flex items-center justify-between text-xs text-brand-text-muted font-mono pt-1 border-t border-brand-border/60">
                    <span>
                        {error ? 'Nie udało się ustalić liczby wpisów' : isLoading ? 'Ładowanie wpisów…' : `Wpisów w audycie: ${totalItems}`}
                    </span>
                    {hasActiveFilters && (
                        <span className="text-brand-accent font-medium">Aktywne filtry wyszukiwania</span>
                    )}
                </div>
            </div>

            {/* History Table */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table ref={tableRef} className="split-scroll-table text-left text-[13px] border-collapse">
                        <thead>
                            <tr className="bg-brand-surface text-brand-text-muted font-mono text-xs uppercase tracking-wider border-b border-brand-border">
                                <th className="py-3 px-4 font-semibold">Data i Czas</th>
                                <th className="py-3 px-4 font-semibold">Numer Seryjny (Unit)</th>
                                <th className="py-3 px-4 font-semibold">Operacja</th>
                                <th className="py-3 px-4 font-semibold">Proces</th>
                                <th className="py-3 px-4 font-semibold text-center">Status</th>
                                <th className="py-3 px-4 font-semibold">Licznik Użyć</th>
                                <th className="py-3 px-4 font-semibold">Błędy</th>
                                <th className="py-3 px-4 font-semibold">Globalny</th>
                                <th className="py-3 px-4 font-semibold">Użytkownik</th>
                            </tr>
                        </thead>
                        <tbody ref={tableScrollRef} className="divide-y divide-brand-border/50 text-brand-text font-mono text-[13px]">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-brand-accent" size={20} />
                                            <span>Ładowanie rejestru audytu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : error ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted font-sans">
                                        Nie udało się pobrać historii. Spróbuj odświeżyć dane.
                                    </td>
                                </tr>
                            ) : visibleRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                        Brak zarejestrowanych zdarzeń spełniających wybrane kryteria.
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
                                            <a
                                                href={getFisUnitHistoryUrl(rec.unit)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block w-max whitespace-nowrap text-brand-accent hover:text-indigo-300 hover:underline"
                                                title="Otwórz historię jednostki w FIS"
                                            >
                                                <span>{rec.unit}</span>
                                                <ExternalLink size={12} className="ml-1 inline-block align-baseline opacity-70" />
                                            </a>
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
