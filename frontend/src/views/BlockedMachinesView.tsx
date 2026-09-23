import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockedApi } from '../api/blockedApi';
import { BlockedMachine } from '../types';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { getErrorMessage } from '../lib/errors';
import {
    Trash2,
    RefreshCw,
    Search,
    X,
    CheckCircle2,
    ShieldAlert
} from 'lucide-react';

export const BlockedMachinesView: React.FC = () => {
    const { canEdit } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<BlockedMachine | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    const { data: machines = [], isLoading, isFetching, refetch, error: machinesError } = useQuery({
        queryKey: ['blockedMachines'],
        queryFn: () => blockedApi.getBlockedMachines(),
        refetchInterval: 30000,
    });

    const deleteMutation = useMutation({
        mutationFn: (filename: string) => blockedApi.deleteBlockedMachine(filename),
        onMutate: () => setActionError(null),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: ['blockedMachines'] });
            setDeleteTarget(null);
        },
        onError: (error: unknown) => setActionError(getErrorMessage(error)),
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
        <div className="space-y-6">
            <ErrorBanner
                message={actionError ?? (machinesError ? getErrorMessage(machinesError, 'Nie udało się pobrać blokad.') : null)}
                onDismiss={actionError ? () => setActionError(null) : undefined}
            />
            {/* Header info banner */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-lg flex items-start gap-4 hover-lift">
                <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0">
                    <ShieldAlert size={24} />
                </div>
                <div>
                    <h2 className="text-base font-bold text-brand-text tracking-wide">
                        {t.blockedPageTitle}
                    </h2>
                    <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                        {t.blockedPageDesc}
                    </p>
                </div>
            </div>

            {/* Filter and action bar */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 flex-wrap">
                <div className="relative flex-1 min-w-60">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted" size={17} />
                    <input
                        type="text"
                        placeholder={t.blockedSearchPlaceholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 font-mono transition-all duration-200"
                    />
                    {searchTerm && <button type="button" onClick={() => setSearchTerm('')} aria-label={t.clearFilters} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-brand-text-muted hover:text-brand-text"><X size={15} /></button>}
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs text-brand-text-muted font-mono hidden sm:inline">
                        {t.blockedFoundCount} <strong className="text-brand-text">{filteredMachines.length}</strong>
                    </span>
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text hover:border-brand-text-muted/60 text-xs font-bold uppercase tracking-wider shrink-0 cursor-pointer"
                    >
                        <RefreshCw size={15} className={isFetching ? 'animate-spin text-brand-accent' : ''} />
                        <span>{t.blockedRefresh}</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden">
                <div className="max-h-[65dvh] overflow-auto">
                    <table className="sticky-header-table w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="bg-brand-surface text-brand-text-muted font-mono text-[11px] uppercase tracking-wider border-b border-brand-border">
                                <th className="py-3.5 px-4 font-semibold">{t.blockedColMachine}</th>
                                <th className="py-3.5 px-4 font-semibold">{t.blockedColPrefix}</th>
                                <th className="py-3.5 px-4 font-semibold">{t.blockedColDate}</th>
                                {canEdit && <th className="py-3.5 px-4 font-semibold text-right">{t.blockedColAction}</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/60 text-brand-text font-mono text-xs">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={canEdit ? 4 : 3} className="py-12 text-center text-brand-text-muted">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-brand-accent" size={18} />
                                            <span>{t.blockedLoadingText}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : machinesError && machines.length === 0 ? (
                                <tr><td colSpan={canEdit ? 4 : 3} className="py-12 text-center text-brand-text-muted">{t.blockedLoadError}</td></tr>
                            ) : filteredMachines.length === 0 && machines.length > 0 ? (
                                <tr><td colSpan={canEdit ? 4 : 3} className="py-12 text-center text-brand-text-muted">{t.blockedNoMatches}</td></tr>
                            ) : filteredMachines.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 4 : 3} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                        <div className="flex flex-col items-center gap-2 animate-scale-in">
                                            <CheckCircle2 className="text-emerald-500" size={28} />
                                            <span className="font-semibold text-brand-text">{t.blockedNoneTitle}</span>
                                            <span className="text-xs text-brand-text-muted/70">{t.blockedNoneDesc}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredMachines.map((m, idx) => (
                                    <tr
                                        key={m.id}
                                        style={{ animationDelay: `${Math.min(idx * 30, 300)}ms` }}
                                        className="animate-row-enter hover:bg-brand-surface-high transition-colors duration-150"
                                    >
                                        <td className="py-3.5 px-4 font-bold text-brand-text flex items-center gap-2">
                                            <span>{m.machine}</span>
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <Badge variant={m.prefix === 'MASTER' ? 'purple' : 'warning'}>
                                                {m.prefix}
                                            </Badge>
                                        </td>
                                        <td className="py-3.5 px-4 text-brand-text">
                                            {m.blockedAt || '—'}
                                        </td>
                                        {canEdit && (
                                            <td className="py-3.5 px-4 text-right">
                                                <button
                                                    onClick={() => setDeleteTarget(m)}
                                                    className="interactive-button inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 text-xs font-bold cursor-pointer"
                                                >
                                                    <Trash2 size={13} />
                                                    <span>{t.blockedUnlockBtn}</span>
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

            {/* Unblock Confirmation Modal */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title={t.blockedModalTitle}
                description={t.blockedModalDesc}
            >
                <div className="space-y-5">
                    <div className="bg-brand-surface-high border border-brand-border/80 rounded-xl p-5 flex flex-col gap-3">
                        <div className="flex justify-between items-center pb-2 border-b border-brand-border/50">
                            <span className="text-xs font-bold text-brand-text-muted uppercase tracking-wider">{t.blockedModalMachine}</span>
                            <span className="text-sm font-bold text-brand-text">{deleteTarget?.machine}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-xs font-bold text-brand-text-muted uppercase tracking-wider">{t.blockedModalPrefix}</span>
                            <span className="text-sm font-mono font-bold text-brand-accent">{deleteTarget?.prefix}</span>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-1">
                        <button
                            onClick={() => setDeleteTarget(null)}
                            className="px-4 py-2.5 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:bg-brand-border/50 text-sm font-bold transition-all cursor-pointer"
                        >
                            {t.blockedModalCancel}
                        </button>
                        <button
                            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.filename)}
                            disabled={deleteMutation.isPending}
                            className="px-5 py-2.5 rounded-xl bg-brand-accent hover:bg-brand-accent/90 text-brand-text text-sm font-bold shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all cursor-pointer"
                        >
                            {deleteMutation.isPending ? t.blockedModalPending : t.blockedModalConfirm}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
