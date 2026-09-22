import { useRef } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Check, CheckCircle2, Ban, Trash2, ExternalLink } from 'lucide-react';
import { getFisUnitHistoryUrl } from '../../api/fisApi';
import type { TranslationsType } from '../../i18n/LanguageContext';
import type { HistoryRecord, MasterUnit, ResetType } from '../../types';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';

interface MutationControl<T> {
    mutate: (variables: T) => void;
    isPending: boolean;
}

interface DashboardModalsProps {
    t: TranslationsType;
    resetTarget: { units: string[]; unitNames: string } | null;
    resetType: ResetType;
    setResetType: (type: ResetType) => void;
    closeReset: () => void;
    resetMutation: MutationControl<{ units: string[]; type: ResetType }>;
    blockTarget: { units: string[]; block: boolean } | null;
    closeBlock: () => void;
    blockMutation: MutationControl<{ units: string[]; block: boolean }>;
    deleteTarget: MasterUnit | null;
    closeDelete: () => void;
    deleteMutation: MutationControl<string>;
    historyTarget: MasterUnit | null;
    closeHistory: () => void;
    history: HistoryRecord[];
    historyLoading: boolean;
}

const ModalActions = ({
    cancelLabel,
    confirmLabel,
    pending,
    onCancel,
    onConfirm,
    destructive = false,
    icon,
}: {
    cancelLabel: string;
    confirmLabel: string;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    destructive?: boolean;
    icon?: React.ReactNode;
}) => (
    <div className="flex justify-end gap-3 pt-3">
        <button
            type="button"
            onClick={onCancel}
            className="interactive-button rounded-xl border border-brand-border/80 bg-brand-surface-high px-4 py-2 text-sm font-semibold text-brand-text hover:bg-slate-700/60 hover:border-slate-400 hover:text-white hover:-translate-y-0.5 active:scale-95 active:translate-y-0 cursor-pointer transition-all duration-200 shadow-xs"
        >
            {cancelLabel}
        </button>
        <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`interactive-button flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold text-white shadow-lg disabled:cursor-wait disabled:opacity-60 hover:-translate-y-0.5 active:scale-95 active:translate-y-0 cursor-pointer transition-all duration-200 ${
                destructive
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/35 hover:shadow-rose-600/50'
                    : 'bg-brand-accent hover:bg-brand-accent-hover shadow-brand-accent/35 hover:shadow-brand-accent/50'
            }`}
        >
            {pending ? (
                <RefreshCw size={15} className="animate-spin" />
            ) : (
                icon
            )}
            <span>{confirmLabel}</span>
        </button>
    </div>
);

export const DashboardModals = ({
    t,
    resetTarget,
    resetType,
    setResetType,
    closeReset,
    resetMutation,
    blockTarget,
    closeBlock,
    blockMutation,
    deleteTarget,
    closeDelete,
    deleteMutation,
    historyTarget,
    closeHistory,
    history,
    historyLoading,
}: DashboardModalsProps) => {
    const resetOptions = [
        {
            value: 'all' as const,
            label: t.resetOptBoth,
            description: t.resetOptBothSub,
            recommended: true,
            selectedClass: 'border-indigo-500 bg-gradient-to-r from-indigo-500/25 via-indigo-600/20 to-purple-600/15 ring-2 ring-indigo-500/60 shadow-[0_0_22px_rgba(99,102,241,0.3)] hover:-translate-y-1',
            unselectedClass: 'border-slate-700/90 bg-slate-900/70 hover:border-indigo-400 hover:bg-indigo-950/30 hover:shadow-[0_0_16px_rgba(99,102,241,0.2)] hover:-translate-y-1',
            radioBorder: 'border-indigo-400 bg-indigo-500/20',
            dotColor: 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.9)]',
        },
        {
            value: 'cycles' as const,
            label: t.resetOptCycles,
            description: t.resetOptCyclesSub,
            recommended: false,
            selectedClass: 'border-amber-500 bg-gradient-to-r from-amber-500/25 via-amber-600/20 to-orange-600/15 ring-2 ring-amber-500/60 shadow-[0_0_22px_rgba(245,158,11,0.3)] hover:-translate-y-1',
            unselectedClass: 'border-slate-700/90 bg-slate-900/70 hover:border-amber-400 hover:bg-amber-950/30 hover:shadow-[0_0_16px_rgba(245,158,11,0.2)] hover:-translate-y-1',
            radioBorder: 'border-amber-400 bg-amber-500/20',
            dotColor: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]',
        },
        {
            value: 'errors' as const,
            label: t.resetOptErrors,
            description: t.resetOptErrorsSub,
            recommended: false,
            selectedClass: 'border-rose-500 bg-gradient-to-r from-rose-500/25 via-rose-600/20 to-pink-600/15 ring-2 ring-rose-500/60 shadow-[0_0_22px_rgba(244,63,94,0.3)] hover:-translate-y-1',
            unselectedClass: 'border-slate-700/90 bg-slate-900/70 hover:border-rose-400 hover:bg-rose-950/30 hover:shadow-[0_0_16px_rgba(244,63,94,0.2)] hover:-translate-y-1',
            radioBorder: 'border-rose-400 bg-rose-500/20',
            dotColor: 'bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]',
        },
    ];

    const lastBlockMode = useRef(true);
    if (blockTarget !== null) {
        lastBlockMode.current = blockTarget.block;
    }
    const isBlock = blockTarget !== null ? blockTarget.block : lastBlockMode.current;

    return (
        <>
            <Modal
                isOpen={Boolean(resetTarget)}
                onClose={closeReset}
                title={t.resetModalTitle}
                description={
                    <span className="flex flex-col gap-2">
                        <span>{t.resetModalDesc}</span>
                        {resetTarget?.unitNames && (
                            <span className="inline-block self-start font-mono text-base bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-lg border border-indigo-500/40">
                                {resetTarget.unitNames}
                            </span>
                        )}
                    </span>
                }
            >
                <div className="space-y-4">
                    <div className="space-y-2.5 pt-2.5 px-1 pb-1">
                        {resetOptions.map(opt => {
                            const isSelected = resetType === opt.value;
                            return (
                                <label
                                    key={opt.value}
                                    className={`relative flex cursor-pointer items-start gap-3.5 rounded-xl border p-3.5 transition-all duration-200 select-none ${
                                        isSelected ? opt.selectedClass : opt.unselectedClass
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="resetOption"
                                        value={opt.value}
                                        checked={isSelected}
                                        onChange={() => setResetType(opt.value)}
                                        className="sr-only"
                                    />
                                    {/* Custom Animated Radio Indicator */}
                                    <div
                                        className={`mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
                                            isSelected ? opt.radioBorder : 'border-slate-500/80 bg-slate-800/80'
                                        }`}
                                    >
                                        {isSelected && (
                                            <span className={`size-2 rounded-full animate-scale-in ${opt.dotColor}`} />
                                        )}
                                    </div>
                                    <div className="flex-1 pr-2">
                                        <div className="flex items-center gap-2">
                                            <strong className="block text-sm font-bold text-white tracking-tight">{opt.label}</strong>
                                            {opt.recommended && (
                                                <span className="rounded-md border border-indigo-500/40 bg-indigo-500/25 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-indigo-200">
                                                    ZALECANE
                                                </span>
                                            )}
                                        </div>
                                        <span className="mt-0.5 block text-xs leading-relaxed text-brand-text-muted/90">{opt.description}</span>
                                    </div>
                                </label>
                            );
                        })}
                    </div>
                    <ModalActions
                        cancelLabel={t.cancel}
                        confirmLabel={resetMutation.isPending ? t.resetting : t.confirmReset}
                        pending={resetMutation.isPending}
                        onCancel={closeReset}
                        onConfirm={() => resetTarget && resetMutation.mutate({ units: resetTarget.units, type: resetType })}
                        icon={<RotateCcw size={15} />}
                    />
                </div>
            </Modal>

            <Modal
                isOpen={Boolean(blockTarget)}
                onClose={closeBlock}
                title={isBlock ? t.blockModalTitle : t.activateModalTitle}
                description={`Zmiana stanu aktywności dla: ${blockTarget?.units.join(', ') ?? ''}`}
            >
                <div className="space-y-5">
                    {isBlock ? (
                        <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/15 p-3.5 text-rose-200 shadow-xs">
                            <Ban className="mt-0.5 shrink-0 text-rose-400" size={20} />
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-rose-300 tracking-tight">{t.blockModalWarningHeader}</p>
                                <p className="text-[13px] leading-relaxed text-rose-100/90 font-medium">
                                    {t.blockModalWarn}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 p-3.5 text-emerald-200 shadow-xs">
                            <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={20} />
                            <div className="space-y-1">
                                <p className="text-sm font-bold text-emerald-300 tracking-tight">{t.activateModalHeader}</p>
                                <p className="text-[13px] leading-relaxed text-emerald-100/90 font-medium">
                                    {t.activateModalWarn}
                                </p>
                            </div>
                        </div>
                    )}
                    <ModalActions
                        cancelLabel={t.cancel}
                        confirmLabel={blockMutation.isPending ? t.saving : t.confirm}
                        pending={blockMutation.isPending}
                        onCancel={closeBlock}
                        onConfirm={() => blockTarget && blockMutation.mutate(blockTarget)}
                        destructive={isBlock}
                        icon={isBlock ? <Ban size={16} /> : <Check size={16} />}
                    />
                </div>
            </Modal>

            <Modal isOpen={Boolean(deleteTarget)} onClose={closeDelete} title={t.deleteModalTitle} description={`Fizyczne usunięcie rekordu: ${deleteTarget?.unit ?? ''}`}>
                <div className="space-y-5">
                    <div className="flex items-start gap-3 rounded-xl border border-rose-500/40 bg-rose-500/15 p-3.5 text-rose-200 shadow-xs">
                        <AlertTriangle className="mt-0.5 shrink-0 text-rose-400" size={20} />
                        <div className="space-y-1">
                            <p className="text-sm font-bold text-rose-300 tracking-tight">{t.deleteModalWarning}</p>
                            <p className="text-[13px] leading-relaxed text-rose-100/90 font-medium">
                                Rekord <strong className="font-mono text-white underline font-bold">{deleteTarget?.unit}</strong> {t.deleteModalText}
                            </p>
                        </div>
                    </div>
                    <ModalActions
                        cancelLabel={t.cancel}
                        confirmLabel={deleteMutation.isPending ? t.deleting : t.confirmDelete}
                        pending={deleteMutation.isPending}
                        onCancel={closeDelete}
                        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.unit)}
                        destructive
                        icon={<Trash2 size={16} />}
                    />
                </div>
            </Modal>

            <Modal isOpen={Boolean(historyTarget)} onClose={closeHistory} title={`${t.historyModalTitle} ${historyTarget?.unit ?? ''}`} description={t.historyModalSub} maxWidth="2xl">
                <div className="space-y-4">
                    {historyLoading ? (
                        <div className="py-8 text-center font-mono text-xs text-brand-text-muted"><RefreshCw className="mr-2 inline-block animate-spin text-brand-accent" size={18} />Ładowanie historii zdarzeń...</div>
                    ) : history.length === 0 ? (
                        <p className="py-8 text-center text-sm text-brand-text-muted/70">{t.historyNoRecords} {historyTarget?.unit}.</p>
                    ) : (
                        <div className="max-h-[50vh] overflow-x-auto rounded-xl border border-brand-border/60">
                            <table className="w-full border-collapse text-left font-mono text-xs">
                                <thead><tr className="border-b border-brand-border bg-brand-surface text-brand-text-muted">
                                    <th className="px-3 py-2.5">{t.thDate}</th><th className="px-3 py-2.5">{t.thOperation}</th><th className="px-3 py-2.5">{t.thStatus}</th><th className="px-3 py-2.5">{t.thCycles}</th><th className="px-3 py-2.5">{t.thErrors}</th><th className="px-3 py-2.5">{t.thOperator}</th>
                                </tr></thead>
                                <tbody className="divide-y divide-brand-border/50 text-brand-text">
                                    {history.map(record => (
                                        <tr key={record.id} className="hover:bg-brand-surface-high transition-colors duration-150">
                                            <td className="px-3 py-2 text-brand-text-muted">{record.date}</td>
                                            <td className="px-3 py-2"><Badge variant={record.operation === 'Create' ? 'success' : record.operation.includes('Reset') ? 'warning' : ['Block', 'Delete'].includes(record.operation) ? 'danger' : 'info'}>{record.operation}</Badge></td>
                                            <td className="px-3 py-2">{record.status}</td><td className="px-3 py-2">{record.currentCounter} / {record.maxCounter}</td><td className="px-3 py-2">{record.errorCounter} / {record.errorMaxCounter}</td><td className="px-3 py-2 text-brand-text-muted">{record.user}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t border-brand-border/60">
                        {historyTarget && (
                            <a
                                href={getFisUnitHistoryUrl(historyTarget.unit, historyTarget.FIS)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="interactive-button flex items-center gap-1.5 rounded-xl border border-brand-accent/40 bg-brand-accent/20 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-brand-accent/35 hover:text-white hover:-translate-y-0.5 active:scale-95 transition-all duration-200"
                            >
                                <span>Otwórz w FIS ({String(historyTarget.FIS).includes('2') ? 'FIS 2' : 'FIS 1'})</span>
                                <ExternalLink size={13} />
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={closeHistory}
                            className="interactive-button rounded-xl border border-brand-border/80 bg-brand-surface-high px-4 py-2 text-sm font-semibold text-brand-text hover:bg-slate-700/60 hover:border-slate-400 hover:text-white hover:-translate-y-0.5 active:scale-95 active:translate-y-0 cursor-pointer transition-all duration-200 shadow-xs"
                        >
                            {t.close}
                        </button>
                    </div>
                </div>
            </Modal>
        </>
    );
};
