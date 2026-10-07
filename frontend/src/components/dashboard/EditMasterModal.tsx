import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Edit, RefreshCw, Search } from 'lucide-react';
import { fisApi } from '../../api/fisApi';
import { masterApi, normalizeFisTarget } from '../../api/masterApi';
import { useLanguage } from '../../i18n/useLanguage';
import { getLocalizedErrorMessage } from '../../lib/errors';
import { refreshMasterData } from '../../lib/queryCache';
import { splitProcesses } from '../../lib/masterUtils';
import type { MasterUnit } from '../../types';
import { Modal } from '../common/Modal';
import { ErrorBanner } from '../common/ErrorBanner';

export const EditMasterModal = ({ master, onClose }: { master: MasterUnit; onClose: () => void }) => {
    const { t, language } = useLanguage();
    const queryClient = useQueryClient();
    const fis = normalizeFisTarget(master.FIS);
    const [processes, setProcesses] = useState(() => splitProcesses(master.process));
    const [maxCounter, setMaxCounter] = useState(String(master.maxCounter));
    const [maxErrors, setMaxErrors] = useState(String(master.errorMaxCounter));
    const [search, setSearch] = useState('');
    const [validation, setValidation] = useState<string | null>(null);
    const [confirming, setConfirming] = useState(false);
    const focusReview = useCallback((node: HTMLHeadingElement | null) => { node?.focus(); }, []);
    const currentProcesses = splitProcesses(master.process);
    const processChanged = currentProcesses.length !== processes.length || currentProcesses.some(process => !processes.includes(process));
    const changes = [
        ...(processChanged ? [{ label: t.multiProcessLabel, before: currentProcesses.join(', '), after: processes.join(', ') }] : []),
        ...(Number(maxCounter) !== master.maxCounter ? [{ label: t.maxCounterLabel, before: String(master.maxCounter), after: maxCounter }] : []),
        ...(Number(maxErrors) !== master.errorMaxCounter ? [{ label: t.maxErrorsLabel, before: String(master.errorMaxCounter), after: maxErrors }] : []),
    ];
    const tags = useQuery({ queryKey: ['processTags', fis], queryFn: () => fisApi.getProcessTags(fis), staleTime: 300000 });
    const choices = useMemo(() => Array.from(new Set([
        ...splitProcesses(master.process), ...(tags.data ?? []).map(tag => tag.key),
    ])).sort().filter(process => process.toLowerCase().includes(search.trim().toLowerCase())), [master.process, tags.data, search]);
    const save = useMutation({
        mutationFn: () => masterApi.updateMaster({ unit: master.unit, fis, process: processes.join(','),
            maxCounter: Number(maxCounter), maxErrors: Number(maxErrors) }),
        onSuccess: async () => { await refreshMasterData(queryClient); onClose(); },
    });
    const close = () => { if (!save.isPending) onClose(); };
    const inputClass = 'w-full min-h-11 rounded-xl border border-brand-border bg-brand-bg px-3 py-2.5 font-mono text-sm text-brand-text transition-[border-color,box-shadow] duration-200 focus:outline-none focus:border-brand-accent focus:ring-3 focus:ring-brand-accent/15 motion-reduce:transition-none';
    const buttonClass = 'group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-extrabold uppercase tracking-wide cursor-pointer transition-[transform,background-color,border-color,box-shadow] duration-200 ease-out enabled:hover:-translate-y-0.5 enabled:active:translate-y-0 enabled:active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-surface disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:transform-none';

    return <Modal isOpen onClose={close} maxWidth="lg" appearance="panel" headerIcon={<Edit size={16} aria-hidden="true" />} title={`${t.editMasterTitle} – ${master.unit}`}>
        <form className="space-y-6" onSubmit={event => {
            event.preventDefault();
            if (save.isPending) return;
            if (!processes.length) { setValidation(t.processRequired); return; }
            if (Array.from(processes.join(',')).length > 100) { setValidation(t.editMasterProcessesError); return; }
            const validLimit = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 2147483647;
            if (!validLimit(maxCounter) || !validLimit(maxErrors)) { setValidation(t.editMasterLimitsError); return; }
            setValidation(null);
            if (!changes.length) return;
            if (confirming) save.mutate();
            else { save.reset(); setConfirming(true); }
        }}>
            <div className="grid grid-cols-3 items-start gap-3 rounded-xl border border-brand-border bg-brand-bg px-3 py-4 text-center">
                <div>
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-brand-text-muted">SN</span>
                    <span className="break-all font-mono text-sm font-bold leading-6 text-brand-accent">{master.unit}</span>
                </div>
                <div>
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-brand-text-muted">FIS</span>
                    <span className="text-sm font-semibold leading-6 text-brand-text">{fis}</span>
                </div>
                <div className="min-w-0">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-wide text-brand-text-muted">{t.editMasterCurrentProcesses}</span>
                    <span className="break-words font-mono text-sm font-semibold leading-6 text-brand-text">{currentProcesses.join(', ') || '—'}</span>
                </div>
            </div>
            <ErrorBanner message={validation || (save.error ? getLocalizedErrorMessage(save.error, language, t.actionError) : null)} />
            {confirming ? <section aria-label={t.editMasterReview} className="space-y-4">
                <h4 className="text-base font-semibold text-brand-text outline-none" tabIndex={-1} ref={focusReview}>{t.editMasterReview}</h4>
                <div className="overflow-hidden rounded-xl border border-brand-border bg-brand-bg">
                    {changes.map(change => <div key={change.label} className="border-b border-brand-border/60 p-4 last:border-b-0">
                        <p className="mb-4 text-sm font-bold text-brand-text">{change.label}</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-brand-text-muted">{t.editMasterBefore}</span><p className="break-words font-mono text-base leading-6 text-brand-text-muted">{change.before}</p></div>
                            <div><span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-brand-accent">{t.editMasterAfter}</span><p className="break-words font-mono text-base font-semibold leading-6 text-brand-text">{change.after}</p></div>
                        </div>
                    </div>)}
                </div>
            </section> : <fieldset disabled={save.isPending} className="space-y-4">
                <div>
                    <label htmlFor="edit-master-search" className="mb-2 block text-xs font-bold uppercase text-brand-text-muted">{t.multiProcessLabel}</label>
                    <div className="relative"><Search size={15} className="absolute left-3 top-3 text-brand-text-muted" />
                        <input id="edit-master-search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t.searchProcessesPlaceholder} className={`${inputClass} pl-9`} />
                    </div>
                    {tags.error && <div className="mt-2 flex items-center justify-between gap-2"><ErrorBanner message={getLocalizedErrorMessage(tags.error, language, t.processLoadError)} />
                        <button type="button" onClick={() => void tags.refetch()} aria-label={t.btnRefreshMasters}><RefreshCw size={16} /></button></div>}
                    {tags.isLoading && <p className="mt-2 text-xs text-brand-text-muted">{t.loadingProcesses}</p>}
                    <div className="mt-2 max-h-44 overflow-auto rounded-xl border border-brand-border bg-brand-bg p-2">
                        {choices.map(process => <label key={process} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors duration-150 motion-reduce:transition-none ${processes.includes(process) ? 'border-brand-accent/25 bg-brand-accent/10' : 'border-transparent hover:bg-brand-surface-high'}`}>
                            <input type="checkbox" checked={processes.includes(process)} onChange={e => setProcesses(previous => e.target.checked ? [...previous, process] : previous.filter(item => item !== process))} className="h-4 w-4 accent-brand-accent" />
                            <span className={`font-mono text-xs ${processes.includes(process) ? 'text-brand-accent' : 'text-brand-text'}`}>{process}</span>
                        </label>)}
                        {!choices.length && <p className="p-2 text-sm text-brand-text-muted">{t.processNoMatches}</p>}
                    </div>
                    <p className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-text-muted">{t.editMasterSelectedProcesses}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5" aria-live="polite">
                        {processes.map(process => <span key={process} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-accent/20 bg-brand-accent/10 px-2 py-1 font-mono text-xs text-brand-accent"><Check size={12} aria-hidden="true" />{process}</span>)}
                        {!processes.length && <span className="text-xs text-brand-text-muted">—</span>}
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-xs font-extrabold uppercase tracking-wide text-brand-text-muted"><span>{t.maxCounterLabel} *</span>
                        <input type="number" min="1" max="2147483647" step="1" required value={maxCounter} onChange={e => setMaxCounter(e.target.value)} className={inputClass} />
                    </label>
                    <label className="space-y-2 text-xs font-extrabold uppercase tracking-wide text-brand-text-muted"><span>{t.maxErrorsLabel} *</span>
                        <input type="number" min="1" max="2147483647" step="1" required value={maxErrors} onChange={e => setMaxErrors(e.target.value)} className={inputClass} />
                    </label>
                </div>
            </fieldset>}
            <div className="grid grid-cols-2 gap-3 border-t border-brand-border/70 pt-4">
                <button type="button" onClick={confirming ? () => { setConfirming(false); save.reset(); } : close} disabled={save.isPending} className={`${buttonClass} border border-brand-border bg-brand-bg text-brand-text enabled:hover:border-brand-text-muted/50 enabled:hover:bg-brand-surface-high`}>{confirming ? t.editMasterBack : t.cancel}</button>
                <button type="submit" disabled={save.isPending || !changes.length} className={`${buttonClass} border border-brand-accent bg-brand-accent text-white shadow-md shadow-brand-accent/15 enabled:hover:border-brand-accent-hover enabled:hover:bg-brand-accent-hover enabled:hover:shadow-lg enabled:hover:shadow-brand-accent/25`}>
                    {save.isPending && <RefreshCw size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}{save.isPending ? t.saving : confirming ? t.confirmUpdate : t.saveChanges}
                </button>
            </div>
        </form>
    </Modal>;
};
