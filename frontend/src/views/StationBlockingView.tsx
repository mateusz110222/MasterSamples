import { RefreshCw, ShieldOff, ShieldCheck, Trash2, Eye, Check } from 'lucide-react';
import type { StationRuleMode } from '../api/stationBlockingApi';
import type { FisTarget } from '../types';
import { useStationBlocking } from '../hooks/useStationBlocking';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { Modal } from '../components/common/Modal';
import { Badge } from '../components/common/Badge';
import { RuleMachinesModal } from '../components/dashboard/RuleMachinesModal';
import { TagCombobox } from '../components/common/TagCombobox';

export const StationBlockingView = () => {
    const {
        t, targets, fis, station, mode, options, matches, overrideCards,
        rows, previewRule, confirmation, errorMessage, formError, mutationError,
        isStationLoading, hasStationError, isRulesFetching, emptyRulesLabel,
        canSaveRule, canConfirm, isSaving, chooseFis, chooseMode, chooseStation,
        prepareSave, prepareDelete, closeConfirmation, confirm, openPreview, closePreview,
        refreshRules, refreshStations, stationFieldLabel, stationEmptyLabel, showPrefixPreview,
    } = useStationBlocking();
    const fieldClass = 'min-h-12 rounded-xl border border-brand-border bg-brand-bg px-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent/30';
    const actionClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all duration-200 enabled:hover:-translate-y-0.5 enabled:active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed motion-reduce:transform-none motion-reduce:transition-none';

    return <div className="space-y-6">
        <div className="flex items-start gap-4 rounded-2xl border border-brand-border bg-brand-surface p-5">
            <ShieldOff size={24} className="shrink-0 text-brand-warning" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-brand-text-muted">{t.stationBlockingDescription}</p>
        </div>
        <ErrorBanner message={errorMessage} />
        <section className="rounded-2xl border border-brand-accent/30 bg-brand-surface p-5" aria-label={t.stationFisScope}>
            <h2 className="text-sm font-bold text-brand-text">{t.stationFisScope}</h2>
            <p className="mt-2 text-xs leading-relaxed text-brand-text-muted">{t.stationFisInfo}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">{overrideCards.map(card => {
                const statusClass = !card.stateKnown ? 'border-brand-border bg-brand-surface text-brand-text-muted' : card.current === 'on' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400' : card.current === 'off' ? 'border-rose-500/40 bg-rose-500/15 text-rose-400' : 'border-brand-accent/40 bg-brand-accent/15 text-brand-text';
                return <div key={card.fis} className="rounded-xl border border-brand-border bg-brand-bg p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <Badge variant={card.fis === 'FIS2' ? 'info' : 'neutral'}>{card.fis}</Badge>
                        <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                            {card.stateKnown && <span className="text-[11px] text-brand-text-muted">{t.stationFisCurrent}</span>}
                            <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold ${statusClass}`}>
                                {card.stateKnown && <Check size={14} aria-hidden="true" />}
                                {card.statusLabel}
                            </span>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">{card.options.map(option => {
                        const selectedClass = option.value === 'on' ? 'border-emerald-400 bg-emerald-700 text-white' : option.value === 'off' ? 'border-rose-400 bg-rose-700 text-white' : 'border-brand-accent bg-brand-accent text-white';
                        return <button key={option.value} type="button" aria-pressed={option.selected} disabled={option.disabled} onClick={option.select} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-bg motion-reduce:transition-none ${option.selected ? `${selectedClass} shadow-sm disabled:cursor-default disabled:opacity-100` : 'border-brand-border bg-brand-bg text-brand-text enabled:hover:border-brand-accent/60 enabled:hover:bg-brand-surface-high disabled:cursor-not-allowed disabled:opacity-50'}`}>
                            {option.selected && <Check size={16} strokeWidth={3} aria-hidden="true" />}
                            {option.label}
                        </button>;
                    })}</div>
                </div>;
            })}</div>
        </section>
        <form className="flex flex-wrap items-end gap-4 rounded-2xl border border-brand-border bg-brand-surface p-5" onSubmit={event => { event.preventDefault(); prepareSave(); }}>
            <label className="flex flex-col gap-2 text-xs font-bold text-brand-text-muted">FIS
                <select value={fis} onChange={event => chooseFis(event.target.value as FisTarget)} className={fieldClass}>{targets.map(target => <option key={target}>{target}</option>)}</select>
            </label>
            <label className="flex flex-col gap-2 text-xs font-bold text-brand-text-muted">{t.stationRuleScope}<select value={mode} onChange={event => chooseMode(event.target.value as StationRuleMode)} className={fieldClass}><option value="single">{t.stationRuleSingle}</option><option value="prefix">{t.stationRulePrefix}</option></select></label>
            <div className="min-w-48 flex-1"><TagCombobox key={`${fis}:${mode}`} options={options} value={station} onChange={chooseStation} label={stationFieldLabel} placeholder={t.stationSelectPlaceholder} isLoading={isStationLoading} hasError={hasStationError} messages={{ loading: t.stationLoading, empty: stationEmptyLabel, list: t.stationList, clear: t.stationClear, open: t.stationOpenList, close: t.stationCloseList }} /></div>
            <button type="submit" disabled={!canSaveRule} className={`${actionClass} bg-brand-accent text-white`}><ShieldCheck size={16} />{t.stationRuleSave}</button>
            {showPrefixPreview && <div className="w-full rounded-xl border border-brand-accent/20 bg-brand-accent/5 p-4"><p className="text-xs leading-relaxed text-brand-text-muted">{t.stationRuleFuture}</p><details className="mt-3 text-xs text-brand-text"><summary className="cursor-pointer">{t.stationRuleMatches}: {matches.length}</summary><p className="mt-2 max-h-32 overflow-auto break-words font-mono leading-6">{matches.join(', ')}</p></details></div>}
            <div className="w-full"><ErrorBanner message={formError} />{hasStationError && <button type="button" onClick={refreshStations} className={`${actionClass} text-brand-text-muted`}><RefreshCw size={14} />{t.btnRefreshMasters}</button>}</div>
        </form>
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-surface shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-border/60 px-4 py-3">
                <p className="font-mono text-xs text-brand-text-muted">{t.stationRuleCount}: <strong className="text-brand-text">{rows.length}</strong></p>
                <button type="button" onClick={refreshRules} disabled={isRulesFetching} className="interactive-button inline-flex items-center gap-2 rounded-lg border border-brand-border bg-brand-surface-high px-3 py-2 text-xs font-bold text-brand-text hover:border-brand-accent/50 disabled:cursor-not-allowed disabled:opacity-50">
                    <RefreshCw size={14} className={isRulesFetching ? 'animate-spin' : ''} />{t.btnRefreshMasters}
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
                                <td className="px-4 py-3.5 font-bold"><span className="[overflow-wrap:anywhere]">{row.station}<span className="text-brand-accent">{row.isPrefix ? '*' : ''}</span></span></td>
                                <td className="px-4 py-3.5"><Badge variant={row.FIS === 'FIS2' ? 'info' : 'neutral'}>{row.FIS}</Badge></td>
                                <td className="px-4 py-3.5"><Badge variant={row.isPrefix ? 'purple' : 'neutral'}>{row.scopeLabel}</Badge></td>
                                <td className="px-4 py-3.5 font-sans text-brand-text-muted">{row.user || '—'}</td>
                                <td className="whitespace-nowrap px-4 py-3.5 text-brand-text-muted">{row.date}</td>
                                <td className="px-4 py-3.5 text-right">
                                    {row.isPrefix && <button type="button" onClick={() => openPreview(row)} title={t.stationRulePreview} aria-label={`${t.stationRulePreview}: ${row.station} · ${row.FIS}`} className="interactive-button mr-2 inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-brand-accent/30 bg-brand-accent/10 px-3 py-1.5 text-xs font-bold text-brand-accent hover:bg-brand-accent/20"><Eye size={14} aria-hidden="true" />{t.stationRulePreviewButton}</button>}
                                    <button type="button" onClick={() => prepareDelete(row)} title={t.stationRuleDelete} aria-label={`${t.stationRuleDelete}: ${row.station} · ${row.FIS}`} className="interactive-button inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-bold text-rose-400 hover:bg-rose-500/20">
                                        <Trash2 size={13} aria-hidden="true" />{t.stationRuleRemoveButton}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {!rows.length && <tr><td colSpan={6} className="px-4 py-12 text-center font-sans text-brand-text-muted">{emptyRulesLabel}</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>
        <RuleMachinesModal rule={previewRule} onClose={closePreview} />
        {confirmation && <Modal isOpen onClose={closeConfirmation} title={t.stationBlockingConfirm}>
            <div className="space-y-5">
                <p className="text-sm font-semibold text-brand-text">{confirmation.actionLabel}</p>
                <p className="text-xs text-brand-text-muted">{confirmation.scopeLabel}</p>
                {confirmation.info && <p className="text-xs text-brand-text-muted">{confirmation.info}</p>}
                <p className="font-mono text-sm font-bold text-brand-text">{confirmation.selector} · {confirmation.fis}</p>
                {confirmation.isPreviewLoading ? <p className="text-xs text-brand-text-muted">{t.stationLoading}</p> : confirmation.previewError ? <ErrorBanner message={confirmation.previewError} /> : <details open className="text-xs text-brand-text-muted">
                    <summary className="cursor-pointer">{t.stationRuleMatches}: {confirmation.stations.length} · {t.stationRuleAfter}</summary>
                    <ul className="mt-3 max-h-48 space-y-2 overflow-auto">{confirmation.stations.map(item => <li key={item.name} className="rounded-lg bg-brand-bg p-2">
                        <div className="flex flex-wrap justify-between gap-2"><span className="font-mono text-brand-text">{item.name}</span><span className={item.enabled ? 'text-brand-success' : 'text-brand-text-muted'}>{item.enabled ? t.stationRuleEnabled : t.stationRuleDisabled}</span></div>
                        {item.overrideLabel && <p className="mt-1 text-[10px]">{item.overrideLabel}</p>}
                    </li>)}</ul>
                </details>}
                <ErrorBanner message={mutationError} />
                <div className="grid grid-cols-2 gap-3">
                    <button type="button" disabled={isSaving} onClick={closeConfirmation} className={`${actionClass} border border-brand-border text-brand-text`}>{t.cancel}</button>
                    <button type="button" disabled={!canConfirm} onClick={confirm} className={`${actionClass} bg-brand-accent text-white`}>{isSaving ? t.saving : t.confirm}</button>
                </div>
            </div>
        </Modal>}
    </div>;
};
