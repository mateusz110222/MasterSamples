import { AlertTriangle, RefreshCw } from 'lucide-react';
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
}: {
    cancelLabel: string;
    confirmLabel: string;
    pending: boolean;
    onCancel: () => void;
    onConfirm: () => void;
    destructive?: boolean;
}) => (
    <div className="flex justify-end gap-3 pt-2">
        <button type="button" onClick={onCancel} className="rounded-xl border border-brand-border bg-brand-surface-high px-4 py-2 text-sm font-semibold text-brand-text">
            {cancelLabel}
        </button>
        <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`rounded-xl px-4 py-2 text-sm font-bold text-brand-text shadow-lg disabled:cursor-wait disabled:opacity-60 ${destructive ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30' : 'bg-brand-accent hover:bg-brand-accent/90 shadow-brand-accent/30'}`}
        >
            {confirmLabel}
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
}: DashboardModalsProps) => (
    <>
        <Modal isOpen={Boolean(resetTarget)} onClose={closeReset} title={t.resetModalTitle} description={`${t.resetModalDesc} ${resetTarget?.unitNames ?? ''}`}>
            <div className="space-y-5">
                <div className="space-y-3 rounded-xl border border-brand-border bg-brand-bg p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-brand-text">Wybierz rodzaj resetu:</p>
                    {([
                        ['all', t.resetOptBoth, t.resetOptBothSub, 'border-brand-accent bg-brand-accent/15'],
                        ['cycles', t.resetOptCycles, t.resetOptCyclesSub, 'border-amber-500 bg-amber-500/15'],
                        ['errors', t.resetOptErrors, t.resetOptErrorsSub, 'border-rose-500 bg-rose-500/15'],
                    ] as const).map(([value, label, description, activeClass]) => (
                        <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${resetType === value ? activeClass : 'border-brand-border bg-brand-surface hover:bg-brand-surface-high'}`}>
                            <input type="radio" name="resetOption" value={value} checked={resetType === value} onChange={() => setResetType(value)} className="mt-0.5" />
                            <span>
                                <strong className="block text-sm">{label}</strong>
                                <span className="text-xs text-brand-text-muted">{description}</span>
                            </span>
                        </label>
                    ))}
                </div>
                <ModalActions
                    cancelLabel={t.cancel}
                    confirmLabel={resetMutation.isPending ? t.resetting : t.confirmReset}
                    pending={resetMutation.isPending}
                    onCancel={closeReset}
                    onConfirm={() => resetTarget && resetMutation.mutate({ units: resetTarget.units, type: resetType })}
                />
            </div>
        </Modal>

        <Modal
            isOpen={Boolean(blockTarget)}
            onClose={closeBlock}
            title={blockTarget?.block ? t.blockModalTitle : t.activateModalTitle}
            description={`Zmiana stanu aktywności dla: ${blockTarget?.units.join(', ') ?? ''}`}
        >
            <div className="space-y-4">
                <p className="text-sm text-brand-text">{blockTarget?.block ? t.blockModalWarn : t.activateModalWarn}</p>
                <ModalActions
                    cancelLabel={t.cancel}
                    confirmLabel={blockMutation.isPending ? t.saving : t.confirm}
                    pending={blockMutation.isPending}
                    onCancel={closeBlock}
                    onConfirm={() => blockTarget && blockMutation.mutate(blockTarget)}
                    destructive={Boolean(blockTarget?.block)}
                />
            </div>
        </Modal>

        <Modal isOpen={Boolean(deleteTarget)} onClose={closeDelete} title={t.deleteModalTitle} description={`Fizyczne usunięcie rekordu: ${deleteTarget?.unit ?? ''}`}>
            <div className="space-y-4">
                <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
                    <AlertTriangle className="mt-0.5 shrink-0 text-rose-400" size={18} />
                    <div>
                        <p className="font-bold">{t.deleteModalWarning}</p>
                        <p className="mt-1">Rekord <strong className="font-mono text-brand-text">{deleteTarget?.unit}</strong> {t.deleteModalText}</p>
                    </div>
                </div>
                <ModalActions
                    cancelLabel={t.cancel}
                    confirmLabel={deleteMutation.isPending ? t.deleting : t.confirmDelete}
                    pending={deleteMutation.isPending}
                    onCancel={closeDelete}
                    onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.unit)}
                    destructive
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
                    <div className="max-h-[50vh] overflow-x-auto">
                        <table className="w-full border-collapse text-left font-mono text-xs">
                            <thead><tr className="border-b border-brand-border bg-brand-surface text-brand-text-muted">
                                <th className="px-3 py-2.5">{t.thDate}</th><th className="px-3 py-2.5">{t.thOperation}</th><th className="px-3 py-2.5">{t.thStatus}</th><th className="px-3 py-2.5">{t.thCycles}</th><th className="px-3 py-2.5">{t.thErrors}</th><th className="px-3 py-2.5">{t.thOperator}</th>
                            </tr></thead>
                            <tbody className="divide-y divide-brand-border/50 text-brand-text">
                                {history.map(record => (
                                    <tr key={record.id} className="hover:bg-brand-surface-high">
                                        <td className="px-3 py-2 text-brand-text-muted">{record.date}</td>
                                        <td className="px-3 py-2"><Badge variant={record.operation === 'Create' ? 'success' : record.operation.includes('Reset') ? 'warning' : ['Block', 'Delete'].includes(record.operation) ? 'danger' : 'info'}>{record.operation}</Badge></td>
                                        <td className="px-3 py-2">{record.status}</td><td className="px-3 py-2">{record.currentCounter} / {record.maxCounter}</td><td className="px-3 py-2">{record.errorCounter} / {record.errorMaxCounter}</td><td className="px-3 py-2 text-brand-text-muted">{record.user}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="flex items-center justify-between pt-2">
                    {historyTarget && <a href={getFisUnitHistoryUrl(historyTarget.unit, historyTarget.FIS)} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-brand-accent/30 bg-brand-accent/20 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-brand-accent/30 hover:text-brand-text">Otwórz w FIS ({String(historyTarget.FIS).includes('2') ? 'FIS 2' : 'FIS 1'}) ↗</a>}
                    <button type="button" onClick={closeHistory} className="rounded-xl border border-brand-border bg-brand-surface-high px-4 py-2 text-sm font-semibold text-brand-text">{t.close}</button>
                </div>
            </div>
        </Modal>
    </>
);
