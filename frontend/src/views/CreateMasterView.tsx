import { PnCombobox } from '../components/common/PnCombobox';
import React from 'react';
import { Modal } from '../components/common/Modal';
import { TagCombobox as ProcessCombobox } from '../components/common/TagCombobox';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { PlusCircle, ArrowLeft, CheckCircle2, AlertCircle, Check, RefreshCw, X, Search, Tag } from 'lucide-react';
import { useCreateMaster } from '../hooks/useCreateMaster';

export const CreateMasterView: React.FC = () => {
    const {
        handleFisChange, feedbackMessage, feedbackStatus, filteredMultiTags, createMutation,
        handleSubmit, toggleMultiProcess, selectAllVisible, clearVisible, mode,
        setMode, serialNumber, singleProcess, setSingleProcess, selectedProcesses,
        setSelectedProcesses, multiSearchQuery, setMultiSearchQuery, assignPn, selectedPn,
        pnRequiredError, status, setStatus, maxCounter,
        maxErrors, selectedFis, existingModalData, setExistingModalData,
        feedback, setFeedback, t, processTags, tagsLoading,
        pnTags, pnLoading, pnError, serialLengthLabel, selectedProcessesLabel,
        noProcessesLabel, migrationDescription, setPnAssignment, choosePn, goToDashboard,
        hasProcessTagsError, processErrorMessage, pnErrorMessage, isMigration, processChoices,
        changeSerialNumber, hasSerialNumber, changeMaxCounter, changeMaxErrors, comparisonPn,
        errorLimitPresets, usageLimitPresets,
    } = useCreateMaster();
    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <ErrorBanner message={processErrorMessage} />
            {/* Top Navigation Back */}
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={goToDashboard}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-brand-text-muted hover:text-brand-text transition-all hover:-translate-x-1 cursor-pointer"
                >
                    <ArrowLeft size={16} />
                    <span>{t.backToDashboard}</span>
                </button>

                {/* Mode Switcher Pill */}
                <div className="bg-brand-surface border border-brand-border p-1 rounded-xl flex items-center gap-1 shadow-md" role="group" aria-label={t.processModeLabel}>
                    <button
                        type="button"
                        onClick={() => setMode('single')}
                        aria-pressed={mode === 'single'}
                        className={`interactive-pill px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            mode === 'single'
                                ? 'bg-brand-accent text-brand-text shadow-xs'
                                : 'text-brand-text-muted hover:text-brand-text'
                        }`}
                    >
                        {t.singleProcessMode}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('multiple')}
                        aria-pressed={mode === 'multiple'}
                        className={`interactive-pill px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            mode === 'multiple'
                                ? 'bg-brand-accent text-brand-text shadow-xs'
                                : 'text-brand-text-muted hover:text-brand-text'
                        }`}
                    >
                        {t.multiProcessMode}
                    </button>
                </div>
            </div>

            {/* Main Card */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6">
                <div className="border-b border-brand-border/70 pb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-brand-text tracking-tight flex items-center gap-2.5">
                            <PlusCircle className="text-brand-accent transition-transform duration-300 group-hover:rotate-90" size={22} />
                            <span>{t.createTitle}</span>
                        </h2>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end sm:shrink-0">
                        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-text-muted">
                            {t.fisTargetLabel}
                        </span>
                        <div className="bg-brand-bg border border-brand-border p-1 rounded-xl flex items-center gap-1 shadow-md" role="group" aria-label={t.fisTargetLabel}>
                            {(['FIS1', 'FIS2'] as const).map((fis) => (
                                <button
                                    key={fis}
                                    type="button"
                                    onClick={() => handleFisChange(fis)}
                                    aria-pressed={selectedFis === fis}
                                    className={`interactive-pill px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        selectedFis === fis
                                            ? 'bg-brand-accent text-brand-text shadow-xs'
                                            : 'text-brand-text-muted hover:text-brand-text'
                                    }`}
                                >
                                    {fis === 'FIS1' ? t.fis1Option : t.fis2Option}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Notification Alert */}
                {feedback && (
                    <div className={`p-4 rounded-xl border text-xs flex items-start gap-3 animate-scale-in ${
                        feedback.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    }`}>
                        {feedback.type === 'success' ? (
                            <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                        ) : (
                            <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={18} />
                        )}
                        <div className="flex-1 font-medium">{feedbackMessage}{feedbackStatus}</div>
                        <button type="button" onClick={() => setFeedback(null)} className="text-brand-text-muted hover:text-brand-text cursor-pointer">
                            <X size={16} />
                        </button>
                    </div>
                )}

                <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
                    {/* 1. Serial Number with inline validation */}
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                {t.serialNumberLabel} <span className="text-rose-400">*</span>
                            </label>
                            {hasSerialNumber && (
                                <span className="text-[11px] font-mono text-brand-accent font-semibold flex items-center gap-1">
                                    <Check size={12} className="text-emerald-400" />
                                    <span>{serialLengthLabel}</span>
                                </span>
                            )}
                        </div>
                        <input
                            type="text"
                            required
                            placeholder={t.serialNumberPlaceholder}
                            value={serialNumber}
                            onChange={(e) => changeSerialNumber(e.target.value)}
                            className="w-full px-4 py-3 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-base font-bold placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent transition-colors"
                        />
                    </div>

                    {/* 2. Process Selection */}
                    <div className="relative z-30">
                        {mode === 'single' ? (
                            <ProcessCombobox
                                key={selectedFis}
                                options={processTags}
                                value={singleProcess}
                                onChange={setSingleProcess}
                                label={t.processLabel}
                                placeholder={t.selectProcessPlaceholder}
                                isLoading={tagsLoading}
                                hasError={Boolean(hasProcessTagsError)}
                            />
                        ) : (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                    {t.multiProcessLabel} <span className="text-rose-400">*</span>
                                </label>
                                {selectedProcesses.length > 0 && (
                                    <span className="text-xs font-mono text-brand-accent font-bold">
                                        {selectedProcessesLabel}
                                    </span>
                                )}
                            </div>

                            {/* Selected Chips Bar */}
                            {selectedProcesses.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap gap-1.5 p-2.5 bg-brand-surface-high rounded-xl border border-brand-accent/30 max-h-32 overflow-y-auto">
                                        {selectedProcesses.map(p => (
                                            <span key={p} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-accent/30 border border-brand-accent/50 text-indigo-300 text-xs font-mono font-bold">
                                                {p}
                                                <button
                                                    type="button"
                                                    onClick={() => toggleMultiProcess(p)}
                                                    className="hover:text-brand-text cursor-pointer"
                                                    title={t.removeProcess}
                                                    aria-label={`${t.removeProcess}: ${p}`}
                                                >
                                                    <X size={13} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedProcesses([])}
                                            className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                                        >
                                            {t.clearAllSelected}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Search Filter Input for Tags Pool */}
                            <div className="space-y-2 bg-brand-surface-high/60 p-3 rounded-xl border border-brand-border">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={15} />
                                    <input
                                        type="text"
                                        value={multiSearchQuery}
                                        onChange={(e) => setMultiSearchQuery(e.target.value)}
                                        placeholder={t.searchProcessesPlaceholder}
                                        className="w-full pl-9 pr-8 py-2 bg-brand-surface border border-brand-border rounded-lg text-xs text-brand-text placeholder-brand-text-muted/60 font-mono focus:outline-none focus:border-brand-accent transition-colors"
                                    />
                                    {multiSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setMultiSearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-text cursor-pointer"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                {/* Quick filter action toolbar */}
                                <div className="flex items-center justify-between text-[11px] font-mono text-brand-text-muted px-0.5">
                                    <span>{t.visibleProcessesCount} <strong className="text-brand-text">{filteredMultiTags.length}</strong> {t.outOfTotal} {processTags.length}</span>
                                    {multiSearchQuery && filteredMultiTags.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={selectAllVisible}
                                                className="text-brand-accent hover:text-indigo-300 font-bold cursor-pointer"
                                            >
                                                + {t.selectAllFiltered}
                                            </button>
                                            <span>|</span>
                                            <button
                                                type="button"
                                                onClick={clearVisible}
                                                className="text-brand-text-muted hover:text-brand-text cursor-pointer"
                                            >
                                                {t.clearVisible}
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Filtered Tags Pool */}
                                <div className="max-h-48 overflow-y-auto p-2 bg-brand-surface/80 rounded-lg border border-brand-border/60 flex flex-wrap gap-1.5">
                                    {tagsLoading ? (
                                        <div className="text-xs text-brand-text-muted py-3 w-full text-center">{t.loadingProcesses}</div>
                                    ) : filteredMultiTags.length === 0 ? (
                                        <div className="text-xs text-brand-text-muted py-4 w-full text-center font-sans">
                                            {noProcessesLabel}
                                        </div>
                                    ) : (
                                        processChoices.map(tag => {
                                            const selected = tag.selected;
                                            return (
                                                <button
                                                    key={tag.key}
                                                    type="button"
                                                    onClick={() => toggleMultiProcess(tag.key)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                                                        selected
                                                            ? 'bg-brand-accent text-white shadow-xs ring-1 ring-brand-accent'
                                                            : 'bg-brand-surface-high text-brand-text border border-brand-border hover:bg-indigo-600/25 hover:border-brand-accent hover:text-white hover:-translate-y-0.5'
                                                    }`}
                                                >
                                                    {tag.key}
                                                </button>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    </div>

                    {/* PN / userkey2 Assignment */}
                    <div className={`rounded-xl border transition-all duration-200 p-3.5 sm:p-4 space-y-3 relative ${
                        assignPn
                            ? 'z-20 border-brand-accent/40 bg-brand-accent/[0.04] shadow-xs shadow-brand-accent/10'
                            : 'z-10 border-brand-border/70 bg-brand-surface-high/30 hover:border-brand-border hover:bg-brand-surface-high/50'
                    }`}>
                        <label className="group flex items-center gap-3 cursor-pointer select-none">
                            <div className="relative flex items-center justify-center">
                                <input
                                    type="checkbox"
                                    checked={assignPn}
                                    onChange={event => setPnAssignment(event.target.checked)}
                                    className="peer sr-only"
                                />
                                <div className={`
                                    flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200
                                    ${assignPn
                                        ? 'border-brand-accent bg-brand-accent text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                                        : 'border-brand-border bg-brand-surface text-transparent group-hover:border-brand-accent/50 group-hover:bg-brand-surface-high'}
                                    peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-brand-surface
                                `}>
                                    <Check size={13} className={`stroke-[3] transition-all duration-200 ${assignPn ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`} />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Tag size={16} className={`transition-colors duration-200 ${assignPn ? 'text-brand-accent' : 'text-brand-text-muted group-hover:text-brand-text'}`} />
                                <span className={`text-sm font-semibold tracking-tight transition-colors duration-200 ${assignPn ? 'text-brand-text' : 'text-brand-text-muted group-hover:text-brand-text'}`}>
                                    {t.assignPnCheckbox}
                                </span>
                            </div>
                        </label>

                        {assignPn && (
                            <div className="pt-3 border-t border-brand-border/60 animate-scale-in space-y-1.5 relative z-20">
                                <PnCombobox
                                    options={pnTags}
                                    value={selectedPn}
                                    onChange={choosePn}
                                    label={t.pnLabel}
                                    placeholder={t.pnPlaceholder}
                                    isLoading={pnLoading}
                                    hasError={Boolean(pnError)}
                                    invalid={pnRequiredError}
                                />
                                {pnRequiredError && <p className="text-xs font-medium text-rose-300" role="alert">{t.pnRequired}</p>}
                                <p className="text-xs text-brand-text-muted">{t.pnManualHint}</p>
                                {pnError && (
                                    <p className="text-xs text-rose-400 font-medium">
                                        {pnErrorMessage} {t.pnManualStillAvailable}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 3. Status Toggle - ONLY "GOOD" and "BAD" as requested */}
                    <div className="space-y-2 relative z-0">
                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                            {t.statusLabel} <span className="text-rose-400">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setStatus('GOOD')}
                                className={`py-3 px-4 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ${
                                    status === 'GOOD'
                                        ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/15 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                                        : 'bg-slate-900/60 border-brand-border/70 text-brand-text-muted hover:text-white hover:border-slate-500 hover:bg-slate-800/60'
                                }`}
                            >
                                <CheckCircle2 size={18} className={status === 'GOOD' ? 'animate-scale-in text-emerald-400' : ''} />
                                <span>{t.goodStatusLabel}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setStatus('BAD')}
                                className={`py-3 px-4 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all duration-150 ${
                                    status === 'BAD'
                                        ? 'bg-gradient-to-r from-rose-500/25 to-pink-500/15 border-rose-500 text-rose-300 ring-2 ring-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                                        : 'bg-slate-900/60 border-brand-border/70 text-brand-text-muted hover:text-white hover:border-slate-500 hover:bg-slate-800/60'
                                }`}
                            >
                                <AlertCircle size={18} className={status === 'BAD' ? 'animate-scale-in text-rose-400' : ''} />
                                <span>{t.badStatusLabel}</span>
                            </button>
                        </div>
                    </div>

                    {/* 4. Counters Limits */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label htmlFor="master-cycle-limit" className="block text-xs font-bold uppercase tracking-wider text-brand-text">{t.maxCounterLabel}</label>
                            <select id="master-cycle-limit" value={maxCounter} onChange={event => changeMaxCounter(event.target.value)} className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface-high px-4 py-2.5 font-mono text-sm text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/40">
                                {usageLimitPresets.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                            <p className="text-[10px] text-brand-text-muted font-mono">{t.maxCounterHint}</p>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="master-error-limit" className="block text-xs font-bold uppercase tracking-wider text-brand-text">{t.maxErrorsLabel}</label>
                            <select id="master-error-limit" value={maxErrors} onChange={event => changeMaxErrors(event.target.value)} className="min-h-11 w-full rounded-xl border border-brand-border bg-brand-surface-high px-4 py-2.5 font-mono text-sm text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/40">
                                {errorLimitPresets.map(value => <option key={value} value={value}>{value}</option>)}
                            </select>
                            <p className="text-[10px] text-brand-text-muted font-mono">{t.maxErrorsHint}</p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={createMutation.isPending}
                            className="interactive-button w-full py-3.5 px-4 rounded-xl bg-brand-accent hover:bg-brand-accent disabled:bg-indigo-800 text-brand-text font-bold text-sm tracking-wide shadow-lg shadow-brand-accent/30 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {createMutation.isPending ? (
                                <>
                                    <RefreshCw className="animate-spin" size={18} />
                                    <span>{t.btnRegistering}</span>
                                </>
                            ) : (
                                <>
                                    <Check size={18} />
                                    <span>{t.btnRegisterMaster}</span>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* MODAL: Existing Master Sample - Update Comparison */}
            <Modal
                isOpen={!!existingModalData}
                onClose={() => setExistingModalData(null)}
                title={t.existingMasterTitle}
                description={t.existingMasterDescription}
                maxWidth="lg"
            >
                {existingModalData && (
                    <div className="space-y-5">
                        <div className="bg-brand-bg border border-brand-border rounded-xl p-4 text-xs font-mono">
                            <div className="grid grid-cols-3 gap-2 pb-2 border-b border-brand-border text-brand-text-muted font-bold uppercase">
                                <div>{t.fieldLabel}</div>
                                <div>{t.previousValue}</div>
                                <div>{t.newValue}</div>
                            </div>
                            <div className="divide-y divide-brand-border pt-2 space-y-2">
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-brand-text-muted">{t.serialNumberLabel}</span>
                                    <span className="text-rose-400 font-semibold break-all">{existingModalData.oldData.unit}</span>
                                    <span className="text-emerald-400 font-semibold break-all">{existingModalData.newData.unit}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-brand-text-muted">{t.thFis}</span>
                                    <span className="text-rose-400 font-semibold">{existingModalData.oldData.FIS}</span>
                                    <span className="text-emerald-400 font-semibold">{existingModalData.newData.FIS}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-brand-text-muted">{t.processLabel}</span>
                                    <span className="text-rose-400 font-semibold break-all">{existingModalData.oldData.process}</span>
                                    <span className="text-emerald-400 font-semibold break-all">{existingModalData.newData.process}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-brand-text-muted">{t.statusLabel}</span>
                                    <span className="text-rose-400 font-semibold">{existingModalData.oldData.status}</span>
                                    <span className="text-emerald-400 font-semibold">{existingModalData.newData.status}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-brand-text-muted">{t.maxCounterLabel}</span>
                                    <span className="text-rose-400 font-semibold">{existingModalData.oldData.maxCounter}</span>
                                    <span className="text-emerald-400 font-semibold">{existingModalData.newData.maxCounter}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-brand-text-muted">{t.maxErrorsLabel}</span>
                                    <span className="text-rose-400 font-semibold">{existingModalData.oldData.errorMaxCounter}</span>
                                    <span className="text-emerald-400 font-semibold">{existingModalData.newData.errorMaxCounter}</span>
                                </div>
                                {comparisonPn && (
                                    <div className="grid grid-cols-3 gap-2 pt-2">
                                        <span className="text-brand-text-muted">{t.pnLabel}</span>
                                        <span className="text-brand-text-muted">{t.unreadValue}</span>
                                        <span className="text-emerald-400 font-semibold font-mono">{comparisonPn}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {isMigration && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
                                <strong>{t.fisMigrationTitle}</strong>{' '}
                                {migrationDescription}
                            </div>
                        )}

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setExistingModalData(null)}
                                className="px-4 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text text-sm font-semibold transition-colors cursor-pointer"
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e, true)}
                                disabled={createMutation.isPending}
                                className="px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text text-sm font-semibold shadow-lg shadow-brand-accent/30 transition-all cursor-pointer"
                            >
                                {createMutation.isPending ? t.updatePending : t.confirmUpdate}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
