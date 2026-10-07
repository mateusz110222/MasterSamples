import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldOff, ShieldCheck, Trash2, Eye } from 'lucide-react';
import { stationBlockingApi, type StationRuleMode, type StationBlockingRule } from '../api/stationBlockingApi';
import type { FisTarget } from '../types';
import { useLanguage } from '../i18n/useLanguage';
import { getLocalizedErrorMessage } from '../lib/errors';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { RuleMachinesModal } from '../components/dashboard/RuleMachinesModal';
import { TagCombobox } from '../components/common/TagCombobox';
import { fisApi } from '../api/fisApi';
import { matchingStations, stationPrefixes, effectiveStationRule } from '../lib/stationRules';

const targets: FisTarget[] = ['FIS1', 'FIS2'];

export const StationBlockingView = () => {
    const { t, language } = useLanguage();
    const queryClient = useQueryClient();
    const [fis, setFis] = useState<FisTarget>('FIS1');
    const [station, setStation] = useState('');
    const [previewRule, setPreviewRule] = useState<StationBlockingRule | null>(null);
    const [mode, setMode] = useState<StationRuleMode>('single');
    const stationTags = useQuery({ queryKey: ['stationTags', fis], queryFn: () => fisApi.getStationTags(fis), staleTime: 300000 });
    const [validation, setValidation] = useState<string | null>(null);
    const [pending, setPending] = useState<{ station: string; fis: FisTarget; mode: StationRuleMode; action: 'set' | 'delete' } | null>(null);
    const options = useMemo(() => mode === 'single' ? stationTags.data ?? [] : stationPrefixes(stationTags.data ?? []), [mode, stationTags.data]);
    const matches = matchingStations(stationTags.data ?? [], station, mode);
    const previewFis = pending?.fis ?? fis;
    const previewTags = useQuery({ queryKey: ['stationTags', previewFis], queryFn: () => fisApi.getStationTags(previewFis), staleTime: 300000 });
    const queries = useQueries({ queries: targets.map(target => ({
        queryKey: ['stationBlocking', target], queryFn: () => stationBlockingApi.list(target),
    })) });
    const rows = queries.flatMap(query => query.data ?? []);
    const errors = queries.map((query, index) => query.error ? `${targets[index]}: ${getLocalizedErrorMessage(query.error, language, t.actionError)}` : '').filter(Boolean).join(' · ');
    const mutation = useMutation({
        mutationFn: (change: NonNullable<typeof pending>) => change.action === 'delete' ? stationBlockingApi.remove(change.station, change.fis, change.mode) : stationBlockingApi.set(change.station, change.fis, change.mode),
        onSuccess: async () => {
            await Promise.all([
                queryClient.invalidateQueries({ queryKey: ['stationBlocking'] }),
                queryClient.invalidateQueries({ queryKey: ['history'] }),
            ]);
            setStation('');
            setPending(null);
        },
    });
    const scopeLabel = (value: StationRuleMode) => value === 'single' ? t.stationRuleSingle : t.stationRulePrefix;
    const previewMatches = pending ? matchingStations(previewTags.data ?? [], pending.station, pending.mode) : [];
    const nextRules = pending ? rows.filter(rule => !(rule.FIS === pending.fis && rule.mode === pending.mode && rule.station === pending.station)) : [...rows];
    if (pending?.action === 'set') nextRules.push({ station: pending.station, FIS: pending.fis, mode: pending.mode, user: '', date: '' });
    const fieldClass = 'min-h-12 rounded-xl border border-brand-border bg-brand-bg px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent/30';
    const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transform-none motion-reduce:transition-none';

    return <div className="space-y-6">
        <div className="flex items-start gap-4 rounded-2xl border border-brand-border bg-brand-surface p-5">
            <ShieldOff size={24} className="shrink-0 text-brand-warning" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-brand-text-muted">{t.stationBlockingDescription}</p>
        </div>
        <ErrorBanner message={errors || null} />
        <form className="flex flex-wrap items-end gap-4 rounded-2xl border border-brand-border bg-brand-surface p-5" onSubmit={event => {
            event.preventDefault();
            if (stationTags.isPending || stationTags.error || queries[targets.indexOf(fis)].isPending || queries[targets.indexOf(fis)].error) return;
            const name = station.trim();
            if (!options.some(tag => tag.key === name)) { setValidation(t.stationSelectRequired); return; }
            if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(name)) { setValidation(t.stationBlockingInvalid); return; }
            setValidation(null); mutation.reset(); setPending({ station: name, fis, mode, action: 'set' });
        }}>
            <label className="flex flex-col gap-2 text-xs font-bold text-brand-text-muted">FIS
                <select value={fis} onChange={event => { setFis(event.target.value as FisTarget); setStation(''); setValidation(null); }} className={fieldClass}>{targets.map(target => <option key={target}>{target}</option>)}</select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-bold text-brand-text-muted">{t.stationRuleScope}<select value={mode} onChange={event => { setMode(event.target.value as StationRuleMode); setStation(''); setValidation(null); }} className={fieldClass}><option value="single">{t.stationRuleSingle}</option><option value="prefix">{t.stationRulePrefix}</option></select></label>
            <div className="min-w-48 flex-1"><TagCombobox key={`${fis}:${mode}`} options={options} value={station} onChange={value => { setStation(value); setValidation(null); }} label={mode === 'single' ? t.stationBlockingName : t.stationRuleSelector} placeholder={t.stationSelectPlaceholder} isLoading={stationTags.isPending} hasError={!!stationTags.error} messages={{ loading: t.stationLoading, empty: mode === 'prefix' ? t.stationRuleNoGroups : t.stationNoMatches, list: t.stationList, clear: t.stationClear, open: t.stationOpenList, close: t.stationCloseList }} /></div>
            <button type="submit" disabled={!station || stationTags.isPending || !!stationTags.error || queries[targets.indexOf(fis)].isPending || !!queries[targets.indexOf(fis)].error} className={`${actionClass} bg-brand-accent text-white`}><ShieldCheck size={16} />{t.stationRuleSave}</button>
            {mode === 'prefix' && station && <div className="w-full rounded-xl border border-brand-accent/20 bg-brand-accent/5 p-4"><p className="text-xs leading-relaxed text-brand-text-muted">{t.stationRuleFuture}</p><details className="mt-3 text-xs text-brand-text"><summary className="cursor-pointer">{t.stationRuleMatches}: {matches.length}</summary><p className="mt-2 max-h-32 overflow-auto break-words font-mono leading-6">{matches.join(', ')}</p></details></div>}
            <div className="w-full"><ErrorBanner message={stationTags.error ? getLocalizedErrorMessage(stationTags.error, language, t.stationLoadError) : validation} />{stationTags.error && <button type="button" onClick={() => void stationTags.refetch()} className={`${actionClass} text-brand-text-muted`}><RefreshCw size={14} />{t.btnRefreshMasters}</button>}</div>
        </form>
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-surface shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 px-4 py-3">
                <p className="font-mono text-xs text-brand-text-muted">{t.stationRuleCount}: <strong className="text-brand-text">{rows.length}</strong></p>
                <button type="button" onClick={() => void Promise.all(queries.map(query => query.refetch()))} disabled={queries.some(query => query.isFetching)} className="interactive-button inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface-high px-3 py-2 text-xs font-bold text-brand-text hover:border-brand-accent/50 disabled:cursor-not-allowed disabled:opacity-50">
                    <RefreshCw size={14} className={queries.some(query => query.isFetching) ? 'animate-spin' : ''} />{t.btnRefreshMasters}
                </button>
            </div>
            <div className="max-h-[65dvh] overflow-auto">
                <table className="sticky-header-table w-full border-collapse text-left text-xs">
                    <thead>
                        <tr className="border-b border-brand-border bg-brand-surface font-mono text-[11px] uppercase tracking-wider text-brand-text-muted">
                            {[t.stationRuleSelector, t.thFis, t.stationRuleScope, t.historyUser, t.historyDateTime].map(label => <th key={label} className="px-4 py-3.5 font-semibold">{label}</th>)}
                            <th className="px-4 py-3.5 text-right font-semibold">{t.blockedColAction}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/60 font-mono text-xs text-brand-text">
                        {rows.map(row => (
                            <tr key={`${row.FIS}:${row.mode}:${row.station}`} className="transition-colors duration-150 hover:bg-brand-surface-high/50">
                                <td className="px-4 py-3.5 font-bold"><span className="[overflow-wrap:anywhere]">{row.station}<span className="text-brand-accent">{row.mode === 'prefix' ? '*' : ''}</span></span></td>
                                <td className="px-4 py-3.5"><Badge variant={row.FIS === 'FIS2' ? 'info' : 'neutral'}>{row.FIS}</Badge></td>
                                <td className="px-4 py-3.5"><Badge variant={row.mode === 'prefix' ? 'purple' : 'neutral'}>{scopeLabel(row.mode)}</Badge></td>
                                <td className="px-4 py-3.5 font-sans text-brand-text-muted">{row.user || '—'}</td>
                                <td className="whitespace-nowrap px-4 py-3.5 text-brand-text-muted">{row.date}</td>
                                <td className="px-4 py-3.5 text-right">
                                    {row.mode === 'prefix' && <button type="button" onClick={() => setPreviewRule(row)} title={t.stationRulePreview} aria-label={`${t.stationRulePreview}: ${row.station} · ${row.FIS}`} className="interactive-button mr-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-brand-accent/30 bg-brand-accent/10 px-3 py-1.5 text-xs font-bold text-brand-accent hover:bg-brand-accent/20"><Eye size={14} aria-hidden="true" />{t.stationRulePreviewButton}</button>}
                                    <button type="button" onClick={() => { mutation.reset(); setPending({ station: row.station, fis: row.FIS, mode: row.mode, action: 'delete' }); }} title={t.stationRuleDelete} aria-label={`${t.stationRuleDelete}: ${row.station} · ${row.FIS}`} className="interactive-button inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20">
                                        <Trash2 size={13} aria-hidden="true" />{t.stationRuleRemoveButton}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!rows.length && <tr><td colSpan={6} className="px-4 py-12 text-center font-sans text-brand-text-muted">{queries.some(query => query.isPending) ? t.stationLoading : errors ? t.actionError : t.stationRuleEmpty}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        <RuleMachinesModal rule={previewRule} onClose={() => setPreviewRule(null)} />
        {pending && <Modal isOpen onClose={() => { if (!mutation.isPending) setPending(null); }} title={t.stationBlockingConfirm}>
            <div className="space-y-5">
                <p className="text-sm font-semibold text-brand-text">{pending.action === 'delete' ? t.stationRuleDelete : t.stationRuleEnabled}</p>
                <p className="text-xs text-brand-text-muted">{scopeLabel(pending.mode)}</p>
                {pending.action === 'delete' && <p className="text-xs text-brand-text-muted">{t.stationRuleDeleteInfo}</p>}
                {pending.mode === 'prefix' && pending.action === 'set' && <p className="text-xs text-brand-text-muted">{t.stationRuleFuture}</p>}
                <p className="font-mono text-sm font-bold text-brand-text">{pending.station}{pending.mode === 'prefix' ? '*' : ''} · {pending.fis}</p>
                {previewTags.isPending ? <p className="text-xs text-brand-text-muted">{t.stationLoading}</p> : previewTags.error ? <ErrorBanner message={t.stationRulePreviewUnavailable} /> : <details open className="text-xs text-brand-text-muted"><summary className="cursor-pointer">{t.stationRuleMatches}: {previewMatches.length} · {t.stationRuleAfter}</summary><ul className="mt-3 max-h-48 space-y-2 overflow-auto">{previewMatches.map(name => {
                    const rule = effectiveStationRule(nextRules, pending.fis, name);
                    const overridden = rule && (rule.mode !== pending.mode || rule.station !== pending.station);
                    return <li key={name} className="rounded-lg bg-brand-bg p-2"><div className="flex flex-wrap justify-between gap-2"><span className="font-mono text-brand-text">{name}</span><span className={rule ? 'text-brand-success' : 'text-brand-text-muted'}>{(rule ? t.stationRuleEnabled : t.stationRuleDisabled)}</span></div>{overridden && <p className="mt-1 text-[10px]">{t.stationRuleOverride}: {scopeLabel(rule.mode)} {rule.station}</p>}</li>;
                })}</ul></details>}
                <ErrorBanner message={mutation.error ? getLocalizedErrorMessage(mutation.error, language, t.actionError) : null} />
                <div className="grid grid-cols-2 gap-3"><button type="button" disabled={mutation.isPending} onClick={() => setPending(null)} className={`${actionClass} border border-brand-border text-brand-text`}>{t.cancel}</button>
                    <button type="button" disabled={mutation.isPending || queries[targets.indexOf(pending.fis)].isPending || !!queries[targets.indexOf(pending.fis)].error} onClick={() => mutation.mutate(pending)} className={`${actionClass} bg-brand-accent text-white`}>{mutation.isPending ? t.saving : t.confirm}</button></div>
            </div>
        </Modal>}
    </div>;
};
