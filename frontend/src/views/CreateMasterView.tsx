import { PnCombobox } from '../components/common/PnCombobox';
import React from 'react';
import { Modal } from '../components/common/Modal';
import { TagCombobox as ProcessCombobox } from '../components/common/TagCombobox';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { PlusCircle, CheckCircle2, AlertCircle, Check, RefreshCw, X, Search, Tag } from 'lucide-react';
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
        noProcessesLabel, migrationDescription, setPnAssignment, choosePn,
        hasProcessTagsError, processErrorMessage, pnErrorMessage, isMigration, processChoices,
        changeSerialNumber, hasSerialNumber, changeMaxCounter, changeMaxErrors, comparisonPn,
        errorLimitPresets, usageLimitPresets,
    } = useCreateMaster();

    return (
        <div className="w-full max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto space-y-4 lg:space-y-5 pb-4 transition-all duration-300">
            <ErrorBanner message={processErrorMessage} />

            {/* Top Navigation Back & Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3">

                {/* Mode Switcher Pill */}
                <div
                    className="bg-brand-surface border border-brand-border p-1.5 rounded-xl flex items-center gap-1.5 shadow-md w-full sm:w-auto sm:min-w-[340px] justify-center"
                    role="group"
                    aria-label={t.processModeLabel}
                >
                    <button
                        type="button"
                        onClick={() => setMode('single')}
                        aria-pressed={mode === 'single'}
                        className={`interactive-pill flex-1 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer truncate ${
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
                        className={`interactive-pill flex-1 px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer truncate ${
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
            <div className="bg-brand-surface border border-brand-border rounded-2xl lg:rounded-3xl shadow-2xl p-5 sm:p-7 lg:p-9 space-y-5 lg:space-y-7">
                {/* Header & FIS Target Switcher */}
                <div className="border-b border-brand-border/70 pb-4 lg:pb-5 flex flex-wrap items-center justify-between gap-4">
                    <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-brand-text tracking-tight flex items-center gap-2.5">
                        <PlusCircle className="text-brand-accent shrink-0" size={24} />
                        <span>{t.createTitle}</span>
                    </h2>

                    <div className="flex items-center justify-between gap-3 w-full sm:w-auto sm:justify-end shrink-0">
                        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-text-muted">
                            {t.fisTargetLabel}
                        </span>
                        <div
                            className="bg-brand-bg border border-brand-border p-1 rounded-xl flex items-center gap-1 shadow-md"
                            role="group"
                            aria-label={t.fisTargetLabel}
                        >
                            {(['FIS1', 'FIS2'] as const).map((fis) => (
                                <button
                                    key={fis}
                                    type="button"
                                    onClick={() => handleFisChange(fis)}
                                    aria-pressed={selectedFis === fis}
                                    className={`interactive-pill px-4 py-1.5 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer ${
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
                    <div
                        className={`p-4 rounded-xl border text-xs sm:text-sm flex items-start gap-3 animate-scale-in ${
                            feedback.type === 'success'
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        }`}
                    >
                        {feedback.type === 'success' ? (
                            <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                        ) : (
                            <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={18} />
                        )}
                        <div className="flex-1 font-medium leading-relaxed break-words min-w-0">
                            {feedbackMessage}
                            {feedbackStatus}
                        </div>
                        <button
                            type="button"
                            onClick={() => setFeedback(null)}
                            className="text-brand-text-muted hover:text-brand-text cursor-pointer p-0.5 shrink-0"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5 lg:space-y-6">
                    {/* Sekcja 1 & 2: Na 1080p (lg) w trybie 'single' стоят obok siebie w 2 kolumnach */}
                    <div className={`grid grid-cols-1 gap-5 lg:gap-6 ${mode === 'single' ? 'lg:grid-cols-2 lg:items-start' : ''}`}>
                        {/* 1. Serial Number with inline validation */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2 min-h-[20px]">
                                <label
                                    htmlFor="master-serial-number"
                                    className="block text-xs font-bold uppercase tracking-wider text-brand-text"
                                >
                                    {t.serialNumberLabel} <span className="text-rose-400">*</span>
                                </label>
                                {hasSerialNumber && (
                                    <span className="text-xs font-mono text-brand-accent font-semibold flex items-center gap-1 shrink-0">
                                        <Check size={13} className="text-emerald-400" />
                                        <span>{serialLengthLabel}</span>
                                    </span>
                                )}
                            </div>
                            <input
                                id="master-serial-number"
                                type="text"
                                required
                                placeholder={t.serialNumberPlaceholder}
                                value={serialNumber}
                                onChange={(e) => changeSerialNumber(e.target.value)}
                                className="w-full h-[46px] lg:h-[50px] px-4 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-base font-bold placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 transition-all"
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
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                            {t.multiProcessLabel} <span className="text-rose-400">*</span>
                                        </label>
                                        {selectedProcesses.length > 0 && (
                                            <span className="text-xs font-mono text-brand-accent font-bold shrink-0">
                                                {selectedProcessesLabel}
                                            </span>
                                        )}
                                    </div>

                                    {/* Selected Chips Bar */}
                                    {selectedProcesses.length > 0 && (
                                        <div className="space-y-1.5">
                                            <div className="flex flex-wrap gap-1.5 p-3 bg-brand-surface-high rounded-xl border border-brand-accent/30 max-h-28 overflow-y-auto">
                                                {selectedProcesses.map((p) => (
                                                    <span
                                                        key={p}
                                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-brand-accent/30 border border-brand-accent/50 text-indigo-300 text-xs font-mono font-bold"
                                                    >
                                                        {p}
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleMultiProcess(p)}
                                                            className="hover:text-brand-text cursor-pointer p-0.5"
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
                                                    className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                                                >
                                                    {t.clearAllSelected}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Search Filter Input for Tags Pool */}
                                    <div className="space-y-2.5 bg-brand-surface-high/60 p-3.5 rounded-xl border border-brand-border">
                                        <div className="relative flex items-center">
                                            <Search
                                                className="absolute left-3.5 text-brand-text-muted pointer-events-none"
                                                size={16}
                                            />
                                            <input
                                                type="text"
                                                value={multiSearchQuery}
                                                onChange={(e) => setMultiSearchQuery(e.target.value)}
                                                placeholder={t.searchProcessesPlaceholder}
                                                className="w-full pl-10 pr-9 py-2.5 bg-brand-surface border border-brand-border rounded-lg text-base sm:text-xs lg:text-sm text-brand-text placeholder-brand-text-muted/60 font-mono focus:outline-none focus:border-brand-accent transition-colors"
                                            />
                                            {multiSearchQuery && (
                                                <button
                                                    type="button"
                                                    onClick={() => setMultiSearchQuery('')}
                                                    className="absolute right-3 text-brand-text-muted hover:text-brand-text cursor-pointer p-0.5"
                                                >
                                                    <X size={15} />
                                                </button>
                                            )}
                                        </div>

                                        {/* Quick filter action toolbar */}
                                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-brand-text-muted px-0.5">
                                            <span>
                                                {t.visibleProcessesCount}{' '}
                                                <strong className="text-brand-text">{filteredMultiTags.length}</strong>{' '}
                                                {t.outOfTotal} {processTags.length}
                                            </span>
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
                                        <div className="max-h-44 lg:max-h-52 overflow-y-auto p-2.5 bg-brand-surface/80 rounded-lg border border-brand-border/60 flex flex-wrap gap-2">
                                            {tagsLoading ? (
                                                <div className="text-xs text-brand-text-muted py-4 w-full text-center">
                                                    {t.loadingProcesses}
                                                </div>
                                            ) : filteredMultiTags.length === 0 ? (
                                                <div className="text-xs text-brand-text-muted py-4 w-full text-center font-sans">
                                                    {noProcessesLabel}
                                                </div>
                                            ) : (
                                                processChoices.map((tag) => {
                                                    const selected = tag.selected;
                                                    return (
                                                        <button
                                                            key={tag.key}
                                                            type="button"
                                                            onClick={() => toggleMultiProcess(tag.key)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                                                                selected
                                                                    ? 'bg-brand-accent text-white shadow-xs ring-1 ring-brand-accent'
                                                                    : 'bg-brand-surface-high text-brand-text border border-brand-border hover:bg-indigo-600/25 hover:border-brand-accent hover:text-white'
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
                    </div>

                    {/* PN / userkey2 Assignment */}
                    <div
                        className={`rounded-xl border transition-all duration-200 p-4 lg:p-5 space-y-3 relative ${
                            assignPn
                                ? 'z-20 border-brand-accent/40 bg-brand-accent/[0.04] shadow-xs shadow-brand-accent/10'
                                : 'z-10 border-brand-border/70 bg-brand-surface-high/30 hover:border-brand-border hover:bg-brand-surface-high/50'
                        }`}
                    >
                        <label className="group flex items-center gap-3 cursor-pointer select-none">
                            <div className="relative flex items-center justify-center shrink-0">
                                <input
                                    type="checkbox"
                                    checked={assignPn}
                                    onChange={(event) => setPnAssignment(event.target.checked)}
                                    className="peer sr-only"
                                />
                                <div
                                    className={`
                                        flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-200
                                        ${
                                            assignPn
                                                ? 'border-brand-accent bg-brand-accent text-white shadow-[0_0_12px_rgba(99,102,241,0.4)]'
                                                : 'border-brand-border bg-brand-surface text-transparent group-hover:border-brand-accent/50 group-hover:bg-brand-surface-high'
                                        }
                                        peer-focus-visible:ring-2 peer-focus-visible:ring-brand-accent peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-brand-surface
                                    `}
                                >
                                    <Check
                                        size={13}
                                        className={`stroke-[3] transition-all duration-200 ${
                                            assignPn ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                                        }`}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 min-w-0">
                                <Tag
                                    size={16}
                                    className={`shrink-0 transition-colors duration-200 ${
                                        assignPn ? 'text-brand-accent' : 'text-brand-text-muted group-hover:text-brand-text'
                                    }`}
                                />
                                <span
                                    className={`text-sm font-semibold tracking-tight transition-colors duration-200 ${
                                        assignPn ? 'text-brand-text' : 'text-brand-text-muted group-hover:text-brand-text'
                                    }`}
                                >
                                    {t.assignPnCheckbox}
                                </span>
                            </div>
                        </label>

                        {assignPn && (
                            <div className="pt-3 border-t border-brand-border/60 animate-scale-in space-y-2 relative z-20">
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
                                {pnRequiredError && (
                                    <p className="text-xs font-medium text-rose-300" role="alert">
                                        {t.pnRequired}
                                    </p>
                                )}
                                <p className="text-xs text-brand-text-muted">{t.pnManualHint}</p>
                                {pnError && (
                                    <p className="text-xs text-rose-400 font-medium">
                                        {pnErrorMessage} {t.pnManualStillAvailable}
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    {/* 3. Status Toggle - ONLY "GOOD" and "BAD" */}
                    <div className="space-y-2 relative z-0">
                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                            {t.statusLabel} <span className="text-rose-400">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3 lg:gap-5">
                            <button
                                type="button"
                                onClick={() => setStatus('GOOD')}
                                className={`py-3 lg:py-3.5 px-4 rounded-xl border font-bold text-sm lg:text-base flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-150 ${
                                    status === 'GOOD'
                                        ? 'bg-gradient-to-r from-emerald-500/25 to-teal-500/15 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                                        : 'bg-slate-900/60 border-brand-border/70 text-brand-text-muted hover:text-white hover:border-slate-500 hover:bg-slate-800/60'
                                }`}
                            >
                                <CheckCircle2
                                    size={19}
                                    className={`shrink-0 ${status === 'GOOD' ? 'animate-scale-in text-emerald-400' : ''}`}
                                />
                                <span className="truncate">{t.goodStatusLabel}</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setStatus('BAD')}
                                className={`py-3 lg:py-3.5 px-4 rounded-xl border font-bold text-sm lg:text-base flex items-center justify-center gap-2.5 cursor-pointer transition-all duration-150 ${
                                    status === 'BAD'
                                        ? 'bg-gradient-to-r from-rose-500/25 to-pink-500/15 border-rose-500 text-rose-300 ring-2 ring-rose-500/40 shadow-[0_0_15px_rgba(244,63,94,0.25)]'
                                        : 'bg-slate-900/60 border-brand-border/70 text-brand-text-muted hover:text-white hover:border-slate-500 hover:bg-slate-800/60'
                                }`}
                            >
                                <AlertCircle
                                    size={19}
                                    className={`shrink-0 ${status === 'BAD' ? 'animate-scale-in text-rose-400' : ''}`}
                                />
                                <span className="truncate">{t.badStatusLabel}</span>
                            </button>
                        </div>
                    </div>

                    {/* 4. Counters Limits */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:gap-5">
                        <div className="space-y-1.5">
                            <label
                                htmlFor="master-cycle-limit"
                                className="block text-xs font-bold uppercase tracking-wider text-brand-text"
                            >
                                {t.maxCounterLabel}
                            </label>
                            <select
                                id="master-cycle-limit"
                                value={maxCounter}
                                onChange={(event) => changeMaxCounter(event.target.value)}
                                className="h-[46px] lg:h-[50px] w-full rounded-xl border border-brand-border bg-brand-surface-high px-4 font-mono text-base sm:text-sm lg:text-base text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/40 cursor-pointer"
                            >
                                {usageLimitPresets.map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-brand-text-muted font-mono leading-tight">
                                {t.maxCounterHint}
                            </p>
                        </div>

                        <div className="space-y-1.5">
                            <label
                                htmlFor="master-error-limit"
                                className="block text-xs font-bold uppercase tracking-wider text-brand-text"
                            >
                                {t.maxErrorsLabel}
                            </label>
                            <select
                                id="master-error-limit"
                                value={maxErrors}
                                onChange={(event) => changeMaxErrors(event.target.value)}
                                className="h-[46px] lg:h-[50px] w-full rounded-xl border border-brand-border bg-brand-surface-high px-4 font-mono text-base sm:text-sm lg:text-base text-brand-text focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/40 cursor-pointer"
                            >
                                {errorLimitPresets.map((value) => (
                                    <option key={value} value={value}>
                                        {value}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[11px] text-brand-text-muted font-mono leading-tight">
                                {t.maxErrorsHint}
                            </p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2 lg:pt-3">
                        <button
                            type="submit"
                            disabled={createMutation.isPending}
                            className="interactive-button w-full py-3.5 lg:py-4 px-6 rounded-xl bg-brand-accent hover:bg-brand-accent/90 disabled:bg-indigo-800 disabled:opacity-60 text-brand-text font-bold text-sm lg:text-base tracking-wide shadow-lg shadow-brand-accent/30 flex items-center justify-center gap-2.5 cursor-pointer active:scale-[0.99] transition-all"
                        >
                            {createMutation.isPending ? (
                                <>
                                    <RefreshCw className="animate-spin shrink-0" size={19} />
                                    <span className="truncate">{t.btnRegistering}</span>
                                </>
                            ) : (
                                <>
                                    <Check size={19} className="shrink-0" />
                                    <span className="truncate">{t.btnRegisterMaster}</span>
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
                    <div className="space-y-4">
                        <div className="bg-brand-bg border border-brand-border rounded-xl p-3 sm:p-4 text-[11px] sm:text-xs font-mono overflow-x-auto">
                            <div className="grid grid-cols-12 gap-2 pb-2 border-b border-brand-border text-brand-text-muted font-bold uppercase">
                                <div className="col-span-4">{t.fieldLabel}</div>
                                <div className="col-span-4">{t.previousValue}</div>
                                <div className="col-span-4">{t.newValue}</div>
                            </div>
                            <div className="divide-y divide-brand-border/60">
                                <div className="grid grid-cols-12 gap-2 py-2 items-center">
                                    <span className="col-span-4 text-brand-text-muted truncate" title={t.serialNumberLabel}>
                                        {t.serialNumberLabel}
                                    </span>
                                    <span className="col-span-4 text-rose-400 font-semibold break-all">
                                        {existingModalData.oldData.unit}
                                    </span>
                                    <span className="col-span-4 text-emerald-400 font-semibold break-all">
                                        {existingModalData.newData.unit}
                                    </span>
                                </div>
                                <div className="grid grid-cols-12 gap-2 py-2 items-center">
                                    <span className="col-span-4 text-brand-text-muted truncate">{t.thFis}</span>
                                    <span className="col-span-4 text-rose-400 font-semibold">
                                        {existingModalData.oldData.FIS}
                                    </span>
                                    <span className="col-span-4 text-emerald-400 font-semibold">
                                        {existingModalData.newData.FIS}
                                    </span>
                                </div>
                                <div className="grid grid-cols-12 gap-2 py-2 items-center">
                                    <span className="col-span-4 text-brand-text-muted truncate">{t.processLabel}</span>
                                    <span className="col-span-4 text-rose-400 font-semibold break-all">
                                        {existingModalData.oldData.process}
                                    </span>
                                    <span className="col-span-4 text-emerald-400 font-semibold break-all">
                                        {existingModalData.newData.process}
                                    </span>
                                </div>
                                <div className="grid grid-cols-12 gap-2 py-2 items-center">
                                    <span className="col-span-4 text-brand-text-muted truncate">{t.statusLabel}</span>
                                    <span className="col-span-4 text-rose-400 font-semibold">
                                        {existingModalData.oldData.status}
                                    </span>
                                    <span className="col-span-4 text-emerald-400 font-semibold">
                                        {existingModalData.newData.status}
                                    </span>
                                </div>
                                <div className="grid grid-cols-12 gap-2 py-2 items-center">
                                    <span className="col-span-4 text-brand-text-muted truncate" title={t.maxCounterLabel}>
                                        {t.maxCounterLabel}
                                    </span>
                                    <span className="col-span-4 text-rose-400 font-semibold">
                                        {existingModalData.oldData.maxCounter}
                                    </span>
                                    <span className="col-span-4 text-emerald-400 font-semibold">
                                        {existingModalData.newData.maxCounter}
                                    </span>
                                </div>
                                <div className="grid grid-cols-12 gap-2 py-2 items-center">
                                    <span className="col-span-4 text-brand-text-muted truncate" title={t.maxErrorsLabel}>
                                        {t.maxErrorsLabel}
                                    </span>
                                    <span className="col-span-4 text-rose-400 font-semibold">
                                        {existingModalData.oldData.errorMaxCounter}
                                    </span>
                                    <span className="col-span-4 text-emerald-400 font-semibold">
                                        {existingModalData.newData.errorMaxCounter}
                                    </span>
                                </div>
                                {comparisonPn && (
                                    <div className="grid grid-cols-12 gap-2 py-2 items-center">
                                        <span className="col-span-4 text-brand-text-muted truncate">{t.pnLabel}</span>
                                        <span className="col-span-4 text-brand-text-muted break-all">
                                            {t.unreadValue}
                                        </span>
                                        <span className="col-span-4 text-emerald-400 font-semibold font-mono break-all">
                                            {comparisonPn}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {isMigration && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 leading-relaxed">
                                <strong>{t.fisMigrationTitle}</strong> {migrationDescription}
                            </div>
                        )}

                        <div className="flex flex-col-reverse xs:flex-row justify-end gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={() => setExistingModalData(null)}
                                className="w-full xs:w-auto px-4 py-2.5 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:bg-brand-border/40 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e, true)}
                                disabled={createMutation.isPending}
                                className="w-full xs:w-auto px-4 py-2.5 rounded-xl bg-brand-accent hover:bg-brand-accent/90 disabled:opacity-60 text-brand-text text-xs sm:text-sm font-semibold shadow-lg shadow-brand-accent/30 transition-all cursor-pointer"
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