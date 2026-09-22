import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { masterApi } from '../api/masterApi';
import { getFisUnitHistoryUrl } from '../api/fisApi';
import { Badge, type BadgeVariant } from '../components/common/Badge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { getErrorMessage } from '../lib/errors';
import { useLanguage } from '../i18n/useLanguage';
import {
    History,
    Search,
    RefreshCw,
    RotateCcw,
    Calendar,
    X,
    ExternalLink,
} from 'lucide-react';

export const HistoryView: React.FC = () => {
    const { t } = useLanguage();
    const [unitFilter, setUnitFilter] = useState('');
    const [operationFilter, setOperationFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const [processFilter, setProcessFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    const debouncedUnitFilter = useDebouncedValue(unitFilter);
    const debouncedUserFilter = useDebouncedValue(userFilter);
    const debouncedProcessFilter = useDebouncedValue(processFilter);

    const { data: historyRecords = [], isLoading, isFetching, refetch, error } = useQuery({
        queryKey: ['history', debouncedUnitFilter, operationFilter, debouncedUserFilter, debouncedProcessFilter, statusFilter, dateFrom, dateTo],
        queryFn: () => masterApi.getHistory({
            unit: debouncedUnitFilter,
            operation: operationFilter,
            user: debouncedUserFilter,
            process: debouncedProcessFilter,
            status: statusFilter,
            dateFrom,
            dateTo,
            limit: 250,
        }),
    });

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
        <div className="space-y-6 animate-page-enter">
            <ErrorBanner message={error ? getErrorMessage(error, 'Nie udało się pobrać historii.') : null} />

            {/* Header info banner */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-lg flex items-center justify-between gap-4 flex-wrap hover-lift animate-slide-up stagger-1">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-brand-accent/15 border border-brand-accent/30 text-brand-accent shrink-0">
                        <History size={24} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-brand-text tracking-wide">
                            {t.headerHistoryTitle}
                        </h2>
                        <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                            {t.headerHistorySub}
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text hover:border-brand-text-muted/60 text-xs font-bold uppercase tracking-wider cursor-pointer shrink-0"
                >
                    <RefreshCw size={15} className={isFetching ? 'animate-spin text-brand-accent' : ''} />
                    <span>Odśwież</span>
                </button>
            </div>

            {/* Filter Bar with Date Range, Status & Process */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md space-y-3 animate-slide-up stagger-2">
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
                </div>

                <div className="flex items-center justify-between text-xs text-brand-text-muted font-mono pt-1 border-t border-brand-border/60">
                    <span>
                        Wpisów w audycie: <strong className="text-brand-text">{historyRecords.length}</strong>
                    </span>
                    {hasActiveFilters && (
                        <span className="text-brand-accent font-medium">Aktywne filtry wyszukiwania</span>
                    )}
                </div>
            </div>

            {/* History Table */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden animate-slide-up stagger-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px] border-collapse">
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
                        <tbody className="divide-y divide-brand-border/50 text-brand-text font-mono text-[13px]">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-brand-accent" size={20} />
                                            <span>Ładowanie rejestru audytu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : historyRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                        Brak zarejestrowanych zdarzeń spełniających wybrane kryteria.
                                    </td>
                                </tr>
                            ) : (
                                historyRecords.map((rec, idx) => (
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
                                                className="text-brand-accent hover:text-indigo-300 hover:underline inline-flex items-center gap-1 transition-transform hover:translate-x-0.5"
                                                title="Otwórz historię jednostki w FIS"
                                            >
                                                <span>{rec.unit}</span>
                                                <ExternalLink size={12} className="opacity-70" />
                                            </a>
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge variant={getOperationBadgeVariant(rec.operation)}>
                                                {getOperationLabel(rec.operation)}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-brand-text font-semibold">
                                            {rec.process}
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {rec.status === 'GOOD' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                    GOOD
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                                    BAD
                                                </span>
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
            </div>
        </div>
    );
};
