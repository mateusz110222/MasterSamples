import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { fisApi } from '../api/fisApi';
import { masterApi, CreateMasterPayload, FisTarget, normalizeFisTarget } from '../api/masterApi';
import type { MasterUnit, ProcessTagItem } from '../types';
import { useLanguage } from '../i18n/useLanguage';
import type { TranslationsType } from '../i18n/LanguageContext';
import { Modal } from '../components/common/Modal';
import { getErrorMessage } from '../lib/errors';
import { ApiError } from '../api/client';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { refreshMasterData } from '../lib/queryCache';

import {
    PlusCircle,
    ArrowLeft,
    CheckCircle2,
    AlertCircle,
    Check,
    RefreshCw,
    X,
    Search,
    ChevronDown,
    Tag,
} from 'lucide-react';

const formatMessage = (template: string, values: Record<string, string | number>) =>
    template.replace(/\{(\w+)\}/g, (match, key: string) => String(values[key] ?? match));

type Feedback = {
    type: 'success' | 'error';
    key: keyof TranslationsType;
    values?: Record<string, string | number>;
    serverMessage?: string;
    statusCode?: number;
};

const ProcessCombobox = ({
    options,
    value,
    onChange,
    label,
    placeholder,
    isLoading,
    hasError,
}: {
    options: ProcessTagItem[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder: string;
    isLoading: boolean;
    hasError: boolean;
}) => {
    const { t } = useLanguage();
    const inputId = useId();
    const listId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const filtered = useMemo(() => {
        const search = query.trim().toLocaleLowerCase();
        return search
            ? options.filter(option => option.key.toLocaleLowerCase().includes(search))
            : options;
    }, [options, query]);

    useEffect(() => {
        if (!isOpen) return;
        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && activeIndex >= 0) {
            document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, isOpen, listId]);

    const choose = (key: string) => {
        onChange(key);
        setQuery('');
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleClear = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onChange('');
        setQuery('');
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setQuery('');
                setActiveIndex(event.key === 'ArrowDown' ? 0 : options.length - 1);
            } else if (filtered.length > 0) {
                setActiveIndex(index => event.key === 'ArrowDown'
                    ? (index + 1) % filtered.length
                    : (index <= 0 ? filtered.length - 1 : index - 1));
            }
        } else if (event.key === 'Enter' && isOpen) {
            event.preventDefault();
            const option = filtered[activeIndex >= 0 ? activeIndex : 0];
            if (option) choose(option.key);
        } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            setIsOpen(false);
            setQuery('');
            setActiveIndex(-1);
        }
    };

    return (
        <div ref={containerRef} className={`relative ${isOpen ? 'z-40' : 'z-20'}`} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
        }}>
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-brand-text">
                {label} <span className="text-rose-400">*</span>
            </label>
            <div className={`flex h-12 items-center rounded-xl border bg-brand-surface-high px-3 transition-colors ${isOpen ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-brand-border hover:border-brand-text-muted/60'}`}>
                <Search size={16} className="mr-2 shrink-0 text-brand-text-muted" aria-hidden="true" />
                <input
                    ref={inputRef}
                    id={inputId}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    aria-activedescendant={isOpen && activeIndex >= 0 && filtered[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
                    autoComplete="off"
                    value={isOpen ? query : value}
                    placeholder={isLoading ? t.loadingProcesses : placeholder}
                    disabled={isLoading || hasError}
                    onFocus={() => { setIsOpen(true); setQuery(''); setActiveIndex(-1); }}
                    onPointerDown={() => {
                        if (document.activeElement === inputRef.current) {
                            setIsOpen(open => !open);
                            setQuery('');
                            setActiveIndex(-1);
                        }
                    }}
                    onChange={event => { setQuery(event.target.value); setIsOpen(true); setActiveIndex(-1); }}
                    onKeyDown={handleKeyDown}
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-brand-text placeholder-brand-text-muted outline-none disabled:opacity-60"
                />
                {(value || query) && (
                    <button
                        type="button"
                        aria-label={t.processClear}
                        title={t.processClear}
                        onMouseDown={event => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={handleClear}
                        className="rounded-md p-1 text-brand-text-muted hover:bg-brand-border hover:text-brand-text cursor-pointer transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
                <button type="button" tabIndex={-1} aria-label={isOpen ? t.processCloseList : t.processOpenList} onMouseDown={event => event.preventDefault()} onClick={() => { inputRef.current?.focus(); setIsOpen(!isOpen); setQuery(''); setActiveIndex(-1); }} className="ml-1 rounded-md p-1 text-brand-text-muted hover:bg-brand-border hover:text-brand-text"><ChevronDown size={17} className={isOpen ? 'rotate-180' : ''} /></button>
            </div>
            {isOpen && (
                <div id={listId} role="listbox" aria-label={t.processList} className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-brand-border bg-brand-surface-high p-1.5 shadow-2xl shadow-black/60">
                    {filtered.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-brand-text-muted">{isLoading ? t.loadingProcesses : t.processNoMatches}</p>
                    ) : filtered.map((option, index) => (
                        <div
                            key={option.key}
                            id={`${listId}-option-${index}`}
                            role="option"
                            aria-selected={option.key === value}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => choose(option.key)}
                            className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${index === activeIndex ? 'bg-brand-accent/30 text-white' : 'text-brand-text hover:bg-brand-accent/20'}`}
                        >
                            <span className="font-mono font-bold">{option.key}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const PnCombobox = ({
    options,
    value,
    onChange,
    label,
    placeholder,
    isLoading,
    hasError,
    invalid,
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder: string;
    isLoading: boolean;
    hasError: boolean;
    invalid: boolean;
}) => {
    const { t } = useLanguage();
    const inputId = useId();
    const listId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);

    const filtered = useMemo(() => {
        const search = query.trim().toLocaleLowerCase();
        return search
            ? options.filter(option => option.toLocaleLowerCase().includes(search))
            : options;
    }, [options, query]);
    const visibleOptions = filtered.slice(0, 150);

    useEffect(() => {
        if (!isOpen) return;
        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && activeIndex >= 0) {
            document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, isOpen, listId]);

    const choose = (key: string) => {
        onChange(key);
        setQuery(key);
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleClear = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onChange('');
        setQuery('');
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setQuery('');
                setActiveIndex(event.key === 'ArrowDown' ? (options.length ? 0 : -1) : Math.min(options.length, 150) - 1);
            } else if (visibleOptions.length > 0) {
                setActiveIndex(index => event.key === 'ArrowDown'
                    ? (index + 1) % visibleOptions.length
                    : (index <= 0 ? visibleOptions.length - 1 : index - 1));
            }
        } else if (event.key === 'Enter' && isOpen) {
            event.preventDefault();
            // A highlighted suggestion wins; otherwise keep the number typed by the user.
            choose(activeIndex >= 0 ? visibleOptions[activeIndex] : query.trim());
        } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            setIsOpen(false);
            setQuery(value);
            setActiveIndex(-1);
        }
    };

    return (
        <div ref={containerRef} className={`relative ${isOpen ? 'z-30' : 'z-10'}`} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsOpen(false);
                setQuery(value);
            }
        }}>
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-brand-text">
                {label} <span className="text-rose-400">*</span>
            </label>
            <div className={`flex h-12 items-center rounded-xl border bg-brand-surface-high px-3 transition-colors ${invalid ? 'border-rose-400 ring-2 ring-rose-400/20' : isOpen ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-brand-border hover:border-brand-text-muted/60'}`}>
                <Search size={16} className="mr-2 shrink-0 text-brand-text-muted" aria-hidden="true" />
                <input
                    ref={inputRef}
                    id={inputId}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-invalid={invalid}
                    aria-controls={listId}
                    aria-activedescendant={isOpen && activeIndex >= 0 && visibleOptions[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
                    autoComplete="off"
                    value={isOpen ? query : value}
                    placeholder={placeholder}
                    onFocus={() => { setIsOpen(true); setQuery(value); setActiveIndex(-1); }}
                    onChange={event => {
                        setQuery(event.target.value);
                        onChange(event.target.value);
                        setIsOpen(true);
                        setActiveIndex(-1);
                    }}
                    onKeyDown={handleKeyDown}
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-brand-text placeholder-brand-text-muted outline-none disabled:opacity-60"
                />
                {(value || query) && (
                    <button
                        type="button"
                        aria-label={t.pnClear}
                        title={t.pnClear}
                        onMouseDown={event => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={handleClear}
                        className="rounded-md p-1 text-brand-text-muted hover:bg-brand-border hover:text-brand-text cursor-pointer transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label={isOpen ? t.pnCloseList : t.pnOpenList}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => {
                        if (isOpen) {
                            setIsOpen(false);
                        } else {
                            inputRef.current?.focus();
                            setQuery('');
                            setIsOpen(true);
                        }
                        setActiveIndex(-1);
                    }}
                    className="ml-1 rounded-md p-1 text-brand-text-muted hover:bg-brand-border hover:text-brand-text"
                >
                    <ChevronDown size={17} className={isOpen ? 'rotate-180' : ''} />
                </button>
            </div>
            {isOpen && (
                <div id={listId} role="listbox" aria-label={t.pnList} className="absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-brand-border bg-brand-surface-high p-1.5 shadow-2xl shadow-black/60">
                    {filtered.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-brand-text-muted">
                            {isLoading ? t.pnLoadingManual : hasError ? t.pnUnavailableManual : t.pnNoMatchesManual}
                        </p>
                    ) : (
                        visibleOptions.map((pn, index) => (
                            <div
                                key={pn}
                                id={`${listId}-option-${index}`}
                                role="option"
                                aria-selected={pn === value}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => choose(pn)}
                                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${index === activeIndex ? 'bg-brand-accent/30 text-white' : 'text-brand-text hover:bg-brand-accent/20'}`}
                            >
                                <span className="font-mono font-bold">{pn}</span>
                            </div>
                        ))
                    )}
                    {filtered.length > 150 && (
                        <p className="px-3 py-2 text-xs text-brand-text-muted font-mono text-center border-t border-brand-border/40">
                            {formatMessage(t.pnMoreResults, { count: filtered.length - 150 })}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export const CreateMasterView: React.FC = () => {
    const navigate = useNavigate();
    const { t, language } = useLanguage();
    const queryClient = useQueryClient();
    const localizedError = (error: unknown, fallback: string) => {
        if (language === 'PL') return getErrorMessage(error, fallback);
        if (error instanceof ApiError && error.statusCode > 0) {
            return `${fallback} ${formatMessage(t.httpErrorCode, { code: error.statusCode })}`;
        }
        return fallback;
    };

    // Mode: 'single' | 'multiple'
    const [mode, setMode] = useState<'single' | 'multiple'>('single');

    // Form state
    const [serialNumber, setSerialNumber] = useState('');
    const [singleProcess, setSingleProcess] = useState('');
    const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
    const [multiSearchQuery, setMultiSearchQuery] = useState('');
    const [assignPn, setAssignPn] = useState(false);
    const [selectedPn, setSelectedPn] = useState('');
    const [pnRequiredError, setPnRequiredError] = useState(false);
    const [status, setStatus] = useState<'GOOD' | 'BAD'>('GOOD');
    const [maxCounter, setMaxCounter] = useState<number>(1000);
    const [maxErrors, setMaxErrors] = useState<number>(50);
    const [selectedFis, setSelectedFis] = useState<FisTarget>(() => {
        try {
            return window.localStorage.getItem('masterSamples.selectedFis') === 'FIS2' ? 'FIS2' : 'FIS1';
        } catch {
            return 'FIS1';
        }
    });

    const handleFisChange = (fis: FisTarget) => {
        if (fis === selectedFis) return;
        setSelectedFis(fis);
        setSingleProcess('');
        setSelectedProcesses([]);
        setMultiSearchQuery('');
        try {
            window.localStorage.setItem('masterSamples.selectedFis', fis);
        } catch {
            // Selection remains active for the current session when storage is unavailable.
        }
    };

    // Existing unit update comparison modal
    const [existingModalData, setExistingModalData] = useState<{
        oldData: Partial<MasterUnit>;
        newData: Partial<MasterUnit>;
    } | null>(null);

    // Feedback state
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const feedbackMessage = feedback && (language === 'PL' && feedback.serverMessage
        ? feedback.serverMessage
        : formatMessage(t[feedback.key], feedback.values ?? {}));
    const feedbackStatus = feedback?.statusCode && language === 'EN'
        ? ` ${formatMessage(t.httpErrorCode, { code: feedback.statusCode })}`
        : '';

    // Fetch process tags (normalized to ProcessTagItem[])
    const { data: processTags = [], isLoading: tagsLoading, error: processTagsError } = useQuery({
        queryKey: ['processTags', selectedFis],
        queryFn: () => fisApi.getProcessTags(selectedFis),
        staleTime: 5 * 60 * 1000,
    });

    // Fetch PN / userkey2 tags when enabled
    const { data: pnTags = [], isLoading: pnLoading, error: pnError } = useQuery({
        queryKey: ['userKey2Tags', selectedFis],
        queryFn: () => fisApi.getUserKey2Tags(selectedFis),
        enabled: assignPn,
        staleTime: 5 * 60 * 1000,
    });

    // Filtered processes for multiple selection
    const filteredMultiTags = useMemo(() => {
        if (!multiSearchQuery.trim()) return processTags;
        const q = multiSearchQuery.toLowerCase().trim();
        return processTags.filter(tag => tag.key.toLowerCase().includes(q));
    }, [processTags, multiSearchQuery]);

    const createMutation = useMutation({
        mutationFn: async (payload: CreateMasterPayload & { oldFis?: FisTarget }) => {
            const { oldFis, ...createPayload } = payload;
            if (createPayload.forceUpdate && oldFis && oldFis !== createPayload.fis) {
                // Delete from the old FIS server first
                await masterApi.deleteMaster(createPayload.unit, oldFis, { fisOnly: true });
            }
            return masterApi.createMaster(createPayload);
        },
        onSuccess: (res, variables) => {
            if (res.data?.exists && !variables.forceUpdate) {
                setExistingModalData({
                    oldData: res.data.oldData ?? {},
                    newData: res.data.newData ?? {},
                });
                return;
            }

            if (res.status) {
                const isMigration = variables.forceUpdate && variables.oldFis && variables.oldFis !== variables.fis;
                setFeedback(isMigration
                    ? { type: 'success', key: 'masterMigrated', values: { unit: variables.unit, oldFis: variables.oldFis!, fis: variables.fis } }
                    : { type: 'success', key: 'masterSaved' });
                void refreshMasterData(queryClient);
                setExistingModalData(null);
                // Reset form
                setSerialNumber('');
                setAssignPn(false);
                setSelectedPn('');
                if (mode === 'single') setSingleProcess('');
                else {
                    setSelectedProcesses([]);
                    setMultiSearchQuery('');
                }
            } else {
                setFeedback({ type: 'error', key: 'masterSaveError', serverMessage: res.message });
            }
        },
        onError: (error: unknown) => {
            setFeedback({
                type: 'error',
                key: 'connectionError',
                serverMessage: getErrorMessage(error, t.connectionError),
                statusCode: error instanceof ApiError ? error.statusCode : undefined,
            });
        }
    });

    const handleSubmit = (e: React.SyntheticEvent, forceUpdate = false) => {
        e.preventDefault();
        setFeedback(null);

        const sn = serialNumber.trim().toUpperCase();
        if (!sn) {
            setFeedback({ type: 'error', key: 'serialRequired' });
            return;
        }

        const proc = mode === 'single' ? singleProcess.trim() : selectedProcesses.join(',');
        if (!proc) {
            setFeedback({ type: 'error', key: 'processRequired' });
            return;
        }

        if (assignPn && !selectedPn.trim()) {
            setPnRequiredError(true);
            setFeedback({ type: 'error', key: 'pnValidation' });
            return;
        }

        const oldFis = (forceUpdate && existingModalData?.oldData?.FIS)
            ? normalizeFisTarget(existingModalData.oldData.FIS)
            : undefined;

        createMutation.mutate({
            unit: sn,
            process: proc,
            status,
            maxCounter: Number(maxCounter) || 1000,
            maxErrors: Number(maxErrors) || 50,
            fis: selectedFis,
            userKey2: assignPn && selectedPn.trim() ? selectedPn.trim() : undefined,
            forceUpdate,
            oldFis,
        });
    };

    const toggleMultiProcess = (procKey: string) => {
        setSelectedProcesses(prev =>
            prev.includes(procKey) ? prev.filter(p => p !== procKey) : [...prev, procKey]
        );
    };

    const selectAllVisible = () => {
        const visibleKeys = filteredMultiTags.map(t => t.key);
        setSelectedProcesses(prev => Array.from(new Set([...prev, ...visibleKeys])));
    };

    const clearVisible = () => {
        const visibleKeys = new Set(filteredMultiTags.map(t => t.key));
        setSelectedProcesses(prev => prev.filter(k => !visibleKeys.has(k)));
    };

    return (
        <div className="max-w-2xl mx-auto space-y-6">
            <ErrorBanner message={processTagsError ? localizedError(processTagsError, t.processLoadError) : null} />
            {/* Top Navigation Back */}
            <div className="flex items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={() => navigate('/')}
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
                            {serialNumber.trim() && (
                                <span className="text-[11px] font-mono text-brand-accent font-semibold flex items-center gap-1">
                                    <Check size={12} className="text-emerald-400" />
                                    <span>{formatMessage(t.serialLength, { count: serialNumber.trim().length })}</span>
                                </span>
                            )}
                        </div>
                        <input
                            type="text"
                            required
                            placeholder={t.serialNumberPlaceholder}
                            value={serialNumber}
                            onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
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
                                hasError={Boolean(processTagsError)}
                            />
                        ) : (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                    {t.multiProcessLabel} <span className="text-rose-400">*</span>
                                </label>
                                {selectedProcesses.length > 0 && (
                                    <span className="text-xs font-mono text-brand-accent font-bold">
                                        {formatMessage(t.selectedProcessesCount, { count: selectedProcesses.length })}
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
                                            {formatMessage(t.noProcessesForQuery, { query: multiSearchQuery })}
                                        </div>
                                    ) : (
                                        filteredMultiTags.map(tag => {
                                            const selected = selectedProcesses.includes(tag.key);
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
                                    onChange={(e) => {
                                        const nextChecked = e.target.checked;
                                        setAssignPn(nextChecked);
                                        setPnRequiredError(false);
                                        if (!nextChecked) {
                                            setSelectedPn('');
                                        }
                                    }}
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
                                    onChange={pn => { setSelectedPn(pn); setPnRequiredError(false); }}
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
                                        {localizedError(pnError, t.pnLoadError)} {t.pnManualStillAvailable}
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
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                    {t.maxCounterLabel}
                                </label>
                                <div className="flex items-center gap-1">
                                    {[500, 1000, 2500, 5000].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setMaxCounter(preset)}
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                                                maxCounter === preset
                                                    ? 'bg-brand-accent text-white shadow-xs'
                                                    : 'bg-brand-surface-high text-brand-text-muted hover:text-white hover:bg-slate-700'
                                            }`}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <input
                                type="number"
                                min={50}
                                max={5000}
                                value={maxCounter}
                                onChange={(e) => setMaxCounter(parseInt(e.target.value) || 0)}
                                className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-sm focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/40"
                            />
                            <p className="text-[10px] text-brand-text-muted font-mono">{t.maxCounterHint}</p>
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                    {t.maxErrorsLabel}
                                </label>
                                <div className="flex items-center gap-1">
                                    {[10, 25, 50, 100].map((preset) => (
                                        <button
                                            key={preset}
                                            type="button"
                                            onClick={() => setMaxErrors(preset)}
                                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold transition-colors cursor-pointer ${
                                                maxErrors === preset
                                                    ? 'bg-brand-accent text-white shadow-xs'
                                                    : 'bg-brand-surface-high text-brand-text-muted hover:text-white hover:bg-slate-700'
                                            }`}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <input
                                type="number"
                                min={5}
                                max={1000}
                                value={maxErrors}
                                onChange={(e) => setMaxErrors(parseInt(e.target.value) || 0)}
                                className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-sm focus:outline-none focus:border-brand-accent focus:ring-1 focus:ring-brand-accent/40"
                            />
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
                                {Boolean((existingModalData.newData as { userKey2?: string })?.userKey2) && (
                                    <div className="grid grid-cols-3 gap-2 pt-2">
                                        <span className="text-brand-text-muted">{t.pnLabel}</span>
                                        <span className="text-brand-text-muted">{t.unreadValue}</span>
                                        <span className="text-emerald-400 font-semibold font-mono">{(existingModalData.newData as { userKey2?: string }).userKey2}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {existingModalData.oldData.FIS && existingModalData.newData.FIS && normalizeFisTarget(existingModalData.oldData.FIS) !== normalizeFisTarget(existingModalData.newData.FIS) && (
                            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300">
                                <strong>{t.fisMigrationTitle}</strong>{' '}
                                {formatMessage(t.fisMigrationDescription, {
                                    oldFis: existingModalData.oldData.FIS,
                                    fis: existingModalData.newData.FIS,
                                })}
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
