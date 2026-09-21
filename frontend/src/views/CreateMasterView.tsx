import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { fisApi } from '../api/fisApi';
import { masterApi, CreateMasterPayload } from '../api/masterApi';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { Modal } from '../components/common/Modal';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { 
    PlusCircle, 
    ArrowLeft, 
    CheckCircle2, 
    AlertCircle, 
    Check, 
    RefreshCw,
    X,
    Search,
    CheckCheck
} from 'lucide-react';

export const CreateMasterView: React.FC = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    // Mode: 'single' | 'multiple'
    const [mode, setMode] = useState<'single' | 'multiple'>('single');

    // Form state
    const [serialNumber, setSerialNumber] = useState('');
    const [singleProcess, setSingleProcess] = useState('');
    const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
    const [multiSearchQuery, setMultiSearchQuery] = useState('');
    const [status, setStatus] = useState<'GOOD' | 'BAD'>('GOOD');
    const [maxCounter, setMaxCounter] = useState<number>(1000);
    const [maxErrors, setMaxErrors] = useState<number>(50);

    // Existing unit update comparison modal
    const [existingModalData, setExistingModalData] = useState<{
        oldData: any;
        newData: any;
    } | null>(null);

    // Feedback state
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

    // Fetch process tags (normalized to ProcessTagItem[])
    const { data: processTags = [], isLoading: tagsLoading } = useQuery({
        queryKey: ['processTags'],
        queryFn: () => fisApi.getProcessTags(),
        staleTime: 5 * 60 * 1000,
    });

    // Options formatted for SearchableSelect
    const processSelectOptions = useMemo(() => {
        return processTags.map(tag => ({
            value: tag.key,
            label: tag.key,
            description: tag.description !== tag.key ? tag.description : undefined
        }));
    }, [processTags]);

    // Filtered processes for multiple selection
    const filteredMultiTags = useMemo(() => {
        if (!multiSearchQuery.trim()) return processTags;
        const q = multiSearchQuery.toLowerCase().trim();
        return processTags.filter(tag => 
            tag.key.toLowerCase().includes(q) || 
            (tag.description && tag.description.toLowerCase().includes(q))
        );
    }, [processTags, multiSearchQuery]);

    const createMutation = useMutation({
        mutationFn: (payload: CreateMasterPayload) => masterApi.createMaster(payload),
        onSuccess: (res, variables) => {
            if (res.data?.exists && !variables.forceUpdate) {
                setExistingModalData({
                    oldData: res.data.oldData,
                    newData: res.data.newData,
                });
                return;
            }

            if (res.status) {
                setFeedback({ type: 'success', message: res.message || 'Master został pomyślnie zapisany w systemie!' });
                queryClient.invalidateQueries({ queryKey: ['masters'] });
                setExistingModalData(null);
                // Reset form
                setSerialNumber('');
                if (mode === 'single') setSingleProcess('');
                else {
                    setSelectedProcesses([]);
                    setMultiSearchQuery('');
                }
            } else {
                setFeedback({ type: 'error', message: res.message || 'Wystąpił błąd podczas tworzenia mastera.' });
            }
        },
        onError: (err: any) => {
            setFeedback({ type: 'error', message: err.message || 'Błąd połączenia z serwerem.' });
        }
    });

    const handleSubmit = (e: React.FormEvent, forceUpdate = false) => {
        e.preventDefault();
        setFeedback(null);

        const sn = serialNumber.trim().toUpperCase();
        if (!sn) {
            setFeedback({ type: 'error', message: 'Wpisz lub zeskanuj numer seryjny (SN)!' });
            return;
        }

        const proc = mode === 'single' ? singleProcess.trim() : selectedProcesses.join(',');
        if (!proc) {
            setFeedback({ type: 'error', message: 'Wybierz co najmniej jeden proces produkcyjny!' });
            return;
        }

        createMutation.mutate({
            unit: sn,
            process: proc,
            status,
            maxCounter: Number(maxCounter) || 1000,
            maxErrors: Number(maxErrors) || 50,
            user: user?.uid || 'USER',
            forceUpdate
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
        <div className="max-w-2xl mx-auto space-y-6 animate-page-enter">
            {/* Top Navigation Back */}
            <div className="flex items-center justify-between animate-slide-down">
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-white transition-all hover:-translate-x-1 cursor-pointer"
                >
                    <ArrowLeft size={16} />
                    <span>{t.backToDashboard}</span>
                </button>

                {/* Mode Switcher Pill */}
                <div className="bg-[#111827] border border-[#374151] p-1 rounded-xl flex items-center gap-1 shadow-md">
                    <button
                        type="button"
                        onClick={() => setMode('single')}
                        className={`interactive-pill px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            mode === 'single'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t.singleProcessMode}
                    </button>
                    <button
                        type="button"
                        onClick={() => setMode('multiple')}
                        className={`interactive-pill px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            mode === 'multiple'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {t.multiProcessMode}
                    </button>
                </div>
            </div>

            {/* Main Card */}
            <div className="bg-[#111827] border border-[#374151] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 hover-lift animate-slide-up">
                <div className="border-b border-[#374151]/70 pb-4">
                    <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2.5">
                        <PlusCircle className="text-indigo-400 transition-transform duration-300 group-hover:rotate-90" size={22} />
                        <span>{t.createTitle}</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-1">
                        {mode === 'single' ? t.createSingleSub : t.createMultiSub}
                    </p>
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
                        <div className="flex-1 font-medium">{feedback.message}</div>
                        <button type="button" onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white cursor-pointer">
                            <X size={16} />
                        </button>
                    </div>
                )}

                <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-5">
                    {/* 1. Serial Number */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                            {t.serialNumberLabel} <span className="text-rose-400">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            placeholder={t.serialNumberPlaceholder}
                            value={serialNumber}
                            onChange={(e) => setSerialNumber(e.target.value.toUpperCase())}
                            className="w-full px-4 py-3 bg-[#1f2937] border border-[#374151] rounded-xl text-white font-mono text-base font-bold placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                    </div>

                    {/* 2. Process Selection: Searchable Select for Single, or Filtered Pool for Multiple */}
                    {mode === 'single' ? (
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                                {t.processLabel} <span className="text-rose-400">*</span>
                            </label>
                            <SearchableSelect
                                options={processSelectOptions}
                                value={singleProcess}
                                onChange={(val) => setSingleProcess(val)}
                                placeholder={t.selectProcessPlaceholder}
                                required
                            />
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                                    {t.multiProcessLabel} <span className="text-rose-400">*</span>
                                </label>
                                {selectedProcesses.length > 0 && (
                                    <span className="text-xs font-mono text-indigo-400 font-bold">
                                        Zaznaczono: {selectedProcesses.length}
                                    </span>
                                )}
                            </div>
                            
                            {/* Selected Chips Bar */}
                            {selectedProcesses.length > 0 && (
                                <div className="space-y-1.5">
                                    <div className="flex flex-wrap gap-1.5 p-2.5 bg-[#1f2937] rounded-xl border border-indigo-500/30 max-h-32 overflow-y-auto">
                                        {selectedProcesses.map(p => (
                                            <span key={p} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/30 border border-indigo-500/50 text-indigo-300 text-xs font-mono font-bold">
                                                {p}
                                                <button 
                                                    type="button" 
                                                    onClick={() => toggleMultiProcess(p)}
                                                    className="hover:text-white cursor-pointer"
                                                    title="Usuń proces"
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
                            <div className="space-y-2 bg-[#1f2937]/60 p-3 rounded-xl border border-[#374151]">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                    <input
                                        type="text"
                                        value={multiSearchQuery}
                                        onChange={(e) => setMultiSearchQuery(e.target.value)}
                                        placeholder={t.searchProcessesPlaceholder}
                                        className="w-full pl-9 pr-8 py-2 bg-[#111827] border border-[#374151] rounded-lg text-xs text-white placeholder-slate-400 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                    {multiSearchQuery && (
                                        <button
                                            type="button"
                                            onClick={() => setMultiSearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                {/* Quick filter action toolbar */}
                                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 px-0.5">
                                    <span>{t.visibleProcessesCount} <strong className="text-white">{filteredMultiTags.length}</strong> z {processTags.length}</span>
                                    {multiSearchQuery && filteredMultiTags.length > 0 && (
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={selectAllVisible}
                                                className="text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                                            >
                                                + {t.selectAllFiltered}
                                            </button>
                                            <span>|</span>
                                            <button
                                                type="button"
                                                onClick={clearVisible}
                                                className="text-slate-400 hover:text-white cursor-pointer"
                                            >
                                                Odznacz widoczne
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Filtered Tags Pool */}
                                <div className="max-h-48 overflow-y-auto p-2 bg-[#111827]/80 rounded-lg border border-[#374151]/60 flex flex-wrap gap-1.5">
                                    {tagsLoading ? (
                                        <div className="text-xs text-slate-400 py-3 w-full text-center">{t.loadingProcesses}</div>
                                    ) : filteredMultiTags.length === 0 ? (
                                        <div className="text-xs text-slate-400 py-4 w-full text-center font-sans">
                                            Nie znaleziono procesów pasujących do &quot;{multiSearchQuery}&quot;
                                        </div>
                                    ) : (
                                        filteredMultiTags.map(tag => {
                                            const selected = selectedProcesses.includes(tag.key);
                                            return (
                                                <button
                                                    key={tag.key}
                                                    type="button"
                                                    title={tag.description}
                                                    onClick={() => toggleMultiProcess(tag.key)}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                                                        selected
                                                            ? 'bg-indigo-600 text-white shadow-xs'
                                                            : 'bg-slate-800 text-slate-300 border border-slate-700 hover:border-slate-500'
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

                    {/* 3. Status Toggle - ONLY "GOOD" and "BAD" as requested */}
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                            {t.statusLabel} <span className="text-rose-400">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setStatus('GOOD')}
                                className={`py-3 px-4 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                    status === 'GOOD'
                                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-lg shadow-emerald-500/10'
                                        : 'bg-[#1f2937] border-[#374151] text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <CheckCircle2 size={18} />
                                <span>GOOD</span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setStatus('BAD')}
                                className={`py-3 px-4 rounded-xl border font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                                    status === 'BAD'
                                        ? 'bg-rose-500/20 border-rose-500 text-rose-300 shadow-lg shadow-rose-500/10'
                                        : 'bg-[#1f2937] border-[#374151] text-slate-400 hover:text-slate-200'
                                }`}
                            >
                                <AlertCircle size={18} />
                                <span>BAD</span>
                            </button>
                        </div>
                    </div>

                    {/* 4. Counters Limits */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                                {t.maxCounterLabel}
                            </label>
                            <input
                                type="number"
                                min={50}
                                max={5000}
                                value={maxCounter}
                                onChange={(e) => setMaxCounter(parseInt(e.target.value) || 0)}
                                className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-xl text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[10px] text-slate-400 font-mono">{t.maxCounterHint}</p>
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                                {t.maxErrorsLabel}
                            </label>
                            <input
                                type="number"
                                min={5}
                                max={1000}
                                value={maxErrors}
                                onChange={(e) => setMaxErrors(parseInt(e.target.value) || 0)}
                                className="w-full px-4 py-2.5 bg-[#1f2937] border border-[#374151] rounded-xl text-white font-mono text-sm focus:outline-none focus:border-indigo-500"
                            />
                            <p className="text-[10px] text-slate-400 font-mono">{t.maxErrorsHint}</p>
                        </div>
                    </div>

                    {/* Submit Button */}
                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={createMutation.isPending}
                            className="interactive-button w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-bold text-sm tracking-wide shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
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
                title="Master o tym SN już istnieje!"
                description="Wykryto istniejący rekord w bazie. Czy chcesz zaktualizować jego parametry?"
                maxWidth="lg"
            >
                {existingModalData && (
                    <div className="space-y-5">
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 text-xs font-mono">
                            <div className="grid grid-cols-3 gap-2 pb-2 border-b border-slate-700 text-slate-400 font-bold uppercase">
                                <div>Pole</div>
                                <div>Poprzednia wartość</div>
                                <div>Nowa wartość</div>
                            </div>
                            <div className="divide-y divide-slate-800 pt-2 space-y-2">
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-slate-400">Proces</span>
                                    <span className="text-rose-400 font-semibold break-all">{existingModalData.oldData.process}</span>
                                    <span className="text-emerald-400 font-semibold break-all">{existingModalData.newData.process}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-slate-400">Status</span>
                                    <span className="text-rose-400 font-semibold">{existingModalData.oldData.status}</span>
                                    <span className="text-emerald-400 font-semibold">{existingModalData.newData.status}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-slate-400">Max Use</span>
                                    <span className="text-rose-400 font-semibold">{existingModalData.oldData.maxCounter}</span>
                                    <span className="text-emerald-400 font-semibold">{existingModalData.newData.maxCounter}</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2 pt-2">
                                    <span className="text-slate-400">Max Errors</span>
                                    <span className="text-rose-400 font-semibold">{existingModalData.oldData.errorMaxCounter}</span>
                                    <span className="text-emerald-400 font-semibold">{existingModalData.newData.errorMaxCounter}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setExistingModalData(null)}
                                className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="button"
                                onClick={(e) => handleSubmit(e, true)}
                                disabled={createMutation.isPending}
                                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                            >
                                {createMutation.isPending ? 'Aktualizacja...' : 'Potwierdź Aktualizację'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
};
