import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { masterApi } from '../api/masterApi';
import { HistoryRecord } from '../types';
import { Badge } from '../components/common/Badge';
import { 
    History, 
    Search, 
    RefreshCw, 
    Filter
} from 'lucide-react';

export const HistoryView: React.FC = () => {
    const [unitFilter, setUnitFilter] = useState('');
    const [operationFilter, setOperationFilter] = useState('');
    const [userFilter, setUserFilter] = useState('');

    const { data: historyRecords = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: ['history', unitFilter, operationFilter, userFilter],
        queryFn: () => masterApi.getHistory({
            unit: unitFilter,
            operation: operationFilter,
            user: userFilter,
            limit: 200
        }),
    });

    const getOperationBadgeVariant = (op: string) => {
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
            {/* Header info banner */}
            <div className="bg-[#111827] border border-[#374151] rounded-2xl p-5 shadow-lg flex items-center justify-between gap-4 flex-wrap hover-lift animate-slide-up stagger-1">
                <div className="flex items-center gap-4">
                    <div className="p-2.5 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 shrink-0">
                        <History size={24} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-white tracking-wide">
                            Dziennik Zdarzeń i Audyt Produkcyjny (Tabela history)
                        </h2>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            Niezmienny rejestr wszystkich operacji przeprowadzonych na masterach produkcyjnych: rejestracja nowej sztuki, edycja limitów, zerowanie liczników, blokady i usunięcia.
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#1f2937] border border-[#374151] text-slate-300 hover:text-white hover:border-slate-500 text-sm font-semibold cursor-pointer shrink-0"
                >
                    <RefreshCw size={16} className={isFetching ? 'animate-spin text-indigo-400' : ''} />
                    <span>Odśwież</span>
                </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-[#111827] border border-[#374151] rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 flex-wrap animate-slide-up stagger-2">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                    {/* SN Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                        <input
                            type="text"
                            placeholder="Filtruj po numerze SN..."
                            value={unitFilter}
                            onChange={(e) => setUnitFilter(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-[#1f2937] border border-[#374151] rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono transition-all duration-200"
                        />
                    </div>

                    {/* Operation Filter */}
                    <select
                        value={operationFilter}
                        onChange={(e) => setOperationFilter(e.target.value)}
                        className="px-3.5 py-2 bg-[#1f2937] border border-[#374151] rounded-xl text-sm text-slate-200 focus:outline-none focus:border-indigo-500 font-mono transition-colors hover:border-slate-500 cursor-pointer"
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
                            className="w-full px-3.5 py-2 bg-[#1f2937] border border-[#374151] rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono transition-all duration-200"
                        />
                    </div>
                </div>

                <span className="text-xs text-slate-400 font-mono">
                    Wpisów w audycie: <strong className="text-white">{historyRecords.length}</strong>
                </span>
            </div>

            {/* History Table */}
            <div className="bg-[#111827] border border-[#374151] rounded-2xl shadow-xl overflow-hidden animate-slide-up stagger-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="bg-[#1f2937]/90 text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-[#374151]">
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
                        <tbody className="divide-y divide-[#374151]/50 text-slate-200 font-mono text-xs">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-slate-400">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-indigo-500" size={20} />
                                            <span>Ładowanie rejestru audytu...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : historyRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-slate-500 font-sans">
                                        Brak zarejestrowanych zdarzeń spełniających wybrane kryteria.
                                    </td>
                                </tr>
                            ) : (
                                historyRecords.map((rec, idx) => (
                                    <tr 
                                        key={rec.id} 
                                        style={{ animationDelay: `${Math.min(idx * 15, 300)}ms` }}
                                        className="animate-row-enter hover:bg-[#1f2937]/50 transition-colors duration-150"
                                    >
                                        <td className="py-3 px-4 text-slate-400 whitespace-nowrap">
                                            {rec.date}
                                        </td>
                                        <td className="py-3 px-4 font-bold text-white tracking-wide">
                                            {rec.unit}
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge variant={getOperationBadgeVariant(rec.operation) as any}>
                                                {rec.operation}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-slate-300">
                                            {rec.process}
                                        </td>
                                        <td className="py-3 px-4">
                                            <span className={rec.status === 'GOOD' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                                                {rec.status}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-300">
                                            {rec.currentCounter} <span className="text-slate-500">/ {rec.maxCounter}</span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-300">
                                            {rec.errorCounter} <span className="text-slate-500">/ {rec.errorMaxCounter}</span>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-300">
                                            {rec.globalCounter?.toLocaleString() ?? 0}
                                        </td>
                                        <td className="py-3 px-4 text-slate-400 font-sans">
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
