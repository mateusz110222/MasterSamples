import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockedApi } from '../api/blockedApi';
import { BlockedMachine } from '../types';
import { useAuth } from '../auth/AuthContext';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { 
    Cpu, 
    Trash2, 
    RefreshCw, 
    Search, 
    CheckCircle2, 
    ShieldAlert 
} from 'lucide-react';

export const BlockedMachinesView: React.FC = () => {
    const { canEdit } = useAuth();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<BlockedMachine | null>(null);

    const { data: machines = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: ['blockedMachines'],
        queryFn: () => blockedApi.getBlockedMachines(),
        refetchInterval: 30000,
    });

    const deleteMutation = useMutation({
        mutationFn: (filename: string) => blockedApi.deleteBlockedMachine(filename),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['blockedMachines'] });
            setDeleteTarget(null);
        }
    });

    const filteredMachines = useMemo(() => {
        if (!searchTerm) return machines;
        const s = searchTerm.toLowerCase();
        return machines.filter(m => 
            m.machine.toLowerCase().includes(s) || 
            m.prefix.toLowerCase().includes(s) ||
            m.filename.toLowerCase().includes(s)
        );
    }, [machines, searchTerm]);

    return (
        <div className="space-y-6 animate-page-enter">
            {/* Header info banner */}
            <div className="bg-[#0d1322] border border-[#1e293b] rounded-2xl p-5 shadow-lg flex items-start gap-4 hover-lift animate-slide-up stagger-1">
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                    <ShieldAlert size={24} />
                </div>
                <div>
                    <h2 className="text-base font-bold text-white tracking-wide">
                        Zablokowane Maszyny i Prefiksy Linii Produkcyjnych
                    </h2>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Poniższa lista prezentuje aktywne pliki blokad w katalogu <span className="font-mono text-amber-300">/fis/mantis/data/blocked_machines/</span>.
                        Usunięcie rekordu odblokowuje daną maszynę lub prefiks zlecenia w systemie produkcyjnym.
                    </p>
                </div>
            </div>

            {/* Filter and action bar */}
            <div className="bg-[#0d1322] border border-[#1e293b] rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 flex-wrap animate-slide-up stagger-2">
                <div className="relative flex-1 min-w-[240px]">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                    <input
                        type="text"
                        placeholder="Szukaj maszyny lub prefiksu..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-[#161f32] border border-[#1e293b] rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono transition-all duration-200"
                    />
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-mono hidden sm:inline">
                        Znaleziono: <strong className="text-white">{filteredMachines.length}</strong>
                    </span>
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#161f32] border border-[#1e293b] text-slate-300 hover:text-white hover:border-slate-500 text-xs font-bold uppercase tracking-wider shrink-0 cursor-pointer"
                    >
                        <RefreshCw size={15} className={isFetching ? 'animate-spin text-indigo-400' : ''} />
                        <span>Odśwież</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-[#0d1322] border border-[#1e293b] rounded-2xl shadow-xl overflow-hidden animate-slide-up stagger-3">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-[#111827] text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-[#1e293b]">
                                <th className="py-3.5 px-4 font-semibold">Maszyna</th>
                                <th className="py-3.5 px-4 font-semibold">Prefiks / Master</th>
                                <th className="py-3.5 px-4 font-semibold">Nazwa Pliku Systemowego</th>
                                <th className="py-3.5 px-4 font-semibold">Data Zablokowania</th>
                                {canEdit && <th className="py-3.5 px-4 font-semibold text-right">Akcja</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e293b]/60 text-slate-200 font-mono text-xs">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-400">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-indigo-500" size={18} />
                                            <span>Skanowanie katalogu blokad maszyn...</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredMachines.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-12 text-center text-slate-500 font-sans">
                                        <div className="flex flex-col items-center gap-2 animate-scale-in">
                                            <CheckCircle2 className="text-emerald-500" size={28} />
                                            <span className="font-semibold text-slate-300">Brak zablokowanych maszyn</span>
                                            <span className="text-xs text-slate-500">Wszystkie linie produkcyjne pracują bez blokad.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredMachines.map((m, idx) => (
                                    <tr 
                                        key={m.id} 
                                        style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                                        className="animate-row-enter hover:bg-[#161f32] transition-colors duration-150"
                                    >
                                        <td className="py-3.5 px-4 font-bold text-white flex items-center gap-2">
                                            <Cpu className="text-indigo-400" size={16} />
                                            <span>{m.machine}</span>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <Badge variant={m.prefix === 'MASTER' ? 'purple' : 'warning'}>
                                                {m.prefix}
                                            </Badge>
                                        </td>
                                        <td className="py-3.5 px-4 text-slate-400">
                                            {m.filename}
                                        </td>
                                        <td className="py-3.5 px-4 text-slate-300">
                                            {m.blockedAt || '—'}
                                        </td>
                                        {canEdit && (
                                            <td className="py-3.5 px-4 text-right">
                                                <button
                                                    onClick={() => setDeleteTarget(m)}
                                                    className="interactive-button inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-bold cursor-pointer"
                                                >
                                                    <Trash2 size={13} />
                                                    <span>Odblokuj</span>
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title="Odblokuj Maszynę / Usuń Blokadę"
                description={`Potwierdź usunięcie blokady dla: ${deleteTarget?.machine} (${deleteTarget?.prefix})`}
            >
                <div className="space-y-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs font-mono space-y-1">
                        <p><span className="text-slate-400">Maszyna:</span> <strong className="text-white">{deleteTarget?.machine}</strong></p>
                        <p><span className="text-slate-400">Prefiks:</span> <strong className="text-amber-400">{deleteTarget?.prefix}</strong></p>
                        <p><span className="text-slate-400">Plik na serwerze:</span> <span className="text-slate-300">{deleteTarget?.filename}</span></p>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            onClick={() => setDeleteTarget(null)}
                            className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                        >
                            Anuluj
                        </button>
                        <button
                            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.filename)}
                            disabled={deleteMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                        >
                            {deleteMutation.isPending ? 'Odblokowywanie...' : 'Odblokuj Maszynę'}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
