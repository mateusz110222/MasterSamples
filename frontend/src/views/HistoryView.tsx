import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { masterApi } from '../api/masterApi';
import { Badge, type BadgeVariant } from '../components/common/Badge';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { getErrorMessage } from '../lib/errors';
import {
    History,
    Search,
    RefreshCw,
} from 'lucide-react';

export const HistoryView: React.FC = () => {
    const [unitFilter, setUnitFilter] = useState('');
    const [operationFilter, setOperationFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');
    const debouncedUnitFilter = useDebouncedValue(unitFilter);
    const debouncedUserFilter = useDebouncedValue(userFilter);

    const { data: historyRecords = [], isLoading, isFetching, refetch, error } = useQuery({
        queryKey: ['history', debouncedUnitFilter, operationFilter, debouncedUserFilter],
        queryFn: () => masterApi.getHistory({
            unit: debouncedUnitFilter,
            operation: operationFilter,
            user: debouncedUserFilter,
            limit: 200
        }),
    });

    const getOperationBadgeVariant = (op: string): BadgeVariant => {
        switch (op.toLowerCase()) {
            case 'create':
                return 'success';
            case 'update':
                return 'info';
            case 'reset':
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
                            Dziennik Zdarzeń i Audyt Produkcyjny (Tabela history)
                        </h2>
                        <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                            Niezmienny rejestr wszystkich operacji przeprowadzonych na masterach produkcyjnych: rejestracja nowej sztuki, edycja limitów, zerowanie liczników, blokady i usunięcia.
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text hover:border-brand-text-muted/60 text-sm font-semibold cursor-pointer shrink-0"
                >
                    <RefreshCw size={16} className={isFetching ? 'animate-spin text-brand-accent' : ''} />
                    <span>Odśwież</span>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 flex-wrap animate-slide-up stagger-2">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    {/* SN Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted" size={17} />
                        <input
                            type="text"
                            placeholder="Filtruj po numerze SN..."
                            value={unitFilter}
                            onChange={(e) => setUnitFilter(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-brand-surface-high border border-brand-border rounded-xl text-sm text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 font-mono transition-all duration-200"
                        />
                    </div>

                    {/* Operation Filter */}
                    <select
                        value={operationFilter}
                        onChange={(e) => setOperationFilter(e.target.value)}
                        className="px-3.5 py-2 bg-brand-surface-high border border-brand-border rounded-xl text-sm text-brand-text focus:outline-none focus:border-brand-accent font-mono transition-colors hover:border-brand-text-muted/60 cursor-pointer"
                    >
                        <option value="">Wszystkie Operacje</option>
                        <option value="Create">Create (Utworzenie)</option>
                        <option value="Update">Update (Aktualizacja)</option>
                        <option value="Reset">Reset (Reset Liczników)</option>
                        <option value="Block">Block (Zablokowanie)</option>
                        <option value="Activate">Activate (Aktywacja)</option>
                        <option value="Delete">Delete (Usunięcie)</option>
                    </select>

                    {/* User Search */}
                    <div className="relative min-w-[180px]">
                        <input
                            type="text"
                            placeholder="Filtruj po użytkowniku..."
                            value={userFilter}
                            onChange={(e) => setUserFilter(e.target.value)}
                            className="w-full px-3.5 py-2 bg-brand-surface-high border border-brand-border rounded-xl text-sm text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 font-mono transition-all duration-200"
                        />
                    </div>
                </div>

                <span className="text-xs text-brand-text-muted font-mono">
                    Wpisów w audycie: <strong className="text-brand-text">{historyRecords.length}</strong>
                </span>
            </div>

            {/* History Table */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden animate-slide-up stagger-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="bg-brand-surface-high/90 text-brand-text-muted font-mono text-[11px] uppercase tracking-wider border-b border-brand-border">
                                <th className="py-3.5 px-4 font-semibold">Data i Czas</th>
                                <th className="py-3.5 px-4 font-semibold">Numer Seryjny (Unit)</th>
                                <th className="py-3.5 px-4 font-semibold">Operacja</th>
                                <th className="py-3.5 px-4 font-semibold">Proces</th>
                                <th className="py-3.5 px-4 font-semibold">Status</th>
                                <th className="py-3.5 px-4 font-semibold">Licznik Użyć</th>
                                <th className="py-3.5 px-4 font-semibold">Błędy</th>
                                <th className="py-3.5 px-4 font-semibold">Globalny</th>
                                <th className="py-3.5 px-4 font-semibold">Użytkownik</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/50 text-brand-text font-mono text-xs">
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
                                            {rec.unit}
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge variant={getOperationBadgeVariant(rec.operation)}>
                                                {rec.operation}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-brand-text">
                                            {rec.process}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={rec.status === 'GOOD' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                                {rec.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-brand-text">
                                            {rec.currentCounter} <span className="text-brand-text-muted/70">/ {rec.maxCounter}</span>
                                        </td>
                                        <td className="py-3 px-4 text-brand-text">
                                            {rec.errorCounter} <span className="text-brand-text-muted/70">/ {rec.errorMaxCounter}</span>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-brand-text">
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
