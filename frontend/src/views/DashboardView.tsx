import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getFisUnitHistoryUrl } from '../api/fisApi';
import { MasterUnit, ResetType } from '../types';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { DashboardModals } from '../components/dashboard/DashboardModals';
import { getErrorMessage } from '../lib/errors';
import { useMasterActions, useMasterHistoryQuery, useMastersQuery } from '../hooks/useMasters';
import {
    buildMastersCsv,
    downloadTextFile,
    filterMasters,
    sortMasters,
    splitProcesses,
    type MasterSortField,
    type SortDirection,
    type TaskPreset,
} from '../lib/masterUtils';
import {
    Plus,
    Download,
    Search,
    RotateCcw,
    History,
    Trash2,
    Ban,
    Check,
    RefreshCw,
    X,
    AlertTriangle,
    Filter,
    Gauge,
    User,
    AlertCircle,
} from 'lucide-react';

export const DashboardView: React.FC = () => {
    const navigate = useNavigate();
    const { canEdit, user } = useAuth();
    const { t } = useLanguage();

    // Filters matching PalletX
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedActive, setSelectedActive] = useState('all');
    const [taskPreset, setTaskPreset] = useState<TaskPreset>('all');
    const [pageSize, setPageSize] = useState<number>(50);

    // Interactive column sorting
    const [sortField, setSortField] = useState<MasterSortField>('unit');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Modals
    const [resetTarget, setResetTarget] = useState<{ units: string[]; unitNames: string } | null>(null);
    const [resetTypeChoice, setResetTypeChoice] = useState<ResetType>('all');
    const [blockTarget, setBlockTarget] = useState<{ units: string[]; block: boolean } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<MasterUnit | null>(null);
    const [historyTarget, setHistoryTarget] = useState<MasterUnit | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // Queries
    const { data: masters = [], isLoading, isFetching, refetch, error: mastersError } = useMastersQuery();

    const { data: unitHistory = [], isLoading: historyLoading } = useMasterHistoryQuery(historyTarget?.unit);

    const { resetMutation, blockMutation, deleteMutation } = useMasterActions({
        onMutate: () => setActionError(null),
        onError: (error: unknown) => setActionError(getErrorMessage(error)),
        onResetSuccess: () => setResetTarget(null),
        onBlockSuccess: () => setBlockTarget(null),
        onDeleteSuccess: () => setDeleteTarget(null),
    });

    // KPI Metrics calculation
    const stats = useMemo(() => {
        const total = masters.length;
        const active = masters.filter(m => m.isactive === 1).length;
        const blocked = masters.filter(m => m.isactive === 2).length;
        const pctActive = total > 0 ? Math.round((active / total) * 100) : 100;
        return { total, active, blocked, pctActive };
    }, [masters]);

    // Task Preset Counts
    const presetCounts = useMemo(() => {
        let actionRequired = 0;
        let cycles80 = 0;
        let errorsExceeded = 0;
        let myProcesses = 0;
        const currentUid = user?.uid?.toLowerCase() || '';

        masters.forEach(m => {
            const cycleExceeded = m.maxCounter > 0 && m.currentCounter >= m.maxCounter;
            const errorExceeded = m.errorMaxCounter > 0 && m.errorCounter >= m.errorMaxCounter;
            const cycle80 = m.maxCounter > 0 && (m.currentCounter / m.maxCounter) >= 0.8;
            const isDead = m.isactive === 2;

            if (cycleExceeded || errorExceeded || isDead) actionRequired++;
            if (cycle80) cycles80++;
            if (errorExceeded) errorsExceeded++;
            if (currentUid && m.user?.toLowerCase().includes(currentUid)) myProcesses++;
        });

        return { actionRequired, cycles80, errorsExceeded, myProcesses };
    }, [masters, user?.uid]);

    // Unique process list
    const processOptions = useMemo(() => {
        const set = new Set<string>();
        masters.forEach(m => {
            splitProcesses(m.process).forEach(process => set.add(process));
        });
        return Array.from(set).sort();
    }, [masters]);

    // Filtered data
    const filteredMasters = useMemo(() => {
        return filterMasters(masters, {
            searchTerm,
            process: selectedProcess,
            status: selectedStatus,
            activity: selectedActive,
            taskPreset,
            currentUser: user?.uid,
        });
    }, [masters, searchTerm, selectedProcess, selectedStatus, selectedActive, taskPreset, user?.uid]);

    // Sorted data
    const sortedMasters = useMemo(() => {
        return sortMasters(filteredMasters, sortField, sortDirection);
    }, [filteredMasters, sortField, sortDirection]);

    const displayedMasters = useMemo(() => {
        return sortedMasters.slice(0, pageSize);
    }, [sortedMasters, pageSize]);

    // Sort handler
    const handleSort = (field: MasterSortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const clearFilters = () => {
        setSearchTerm('');
        setSelectedProcess('');
        setSelectedStatus('');
        setSelectedActive('all');
        setTaskPreset('all');
    };

    // CSV Export
    const exportCsv = () => {
        downloadTextFile(
            buildMastersCsv(sortedMasters),
            `masters_export_${new Date().toISOString().slice(0, 10)}.csv`,
            'text/csv;charset=utf-8',
        );
    };

    // Helper for sortable column header
    const renderSortHeader = (field: MasterSortField, label: string, className = '') => {
        const isActive = sortField === field;
        return (
            <th
                onClick={() => handleSort(field)}
                className={`py-3 px-3.5 font-semibold select-none cursor-pointer transition-colors hover:text-brand-text group ${className} ${
                    isActive ? 'text-brand-accent font-bold bg-indigo-950/20' : 'text-brand-text-muted'
                }`}
                title={`Sortuj wg: ${label}`}
            >
                <div className={`inline-flex items-center gap-1.5 ${
                    className.includes('text-center') ? 'justify-center w-full' : (className.includes('text-right') ? 'justify-end w-full' : 'justify-start')
                }`}>
                    <span>{label}</span>
                    <span className={`text-xs font-mono font-bold transition-transform ${
                        isActive ? 'text-brand-accent' : 'text-brand-text-muted/50 group-hover:text-brand-text-muted'
                    }`}>
                        {isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                </div>
            </th>
        );
    };

    return (
        <div className="space-y-5">
            <ErrorBanner
                message={actionError ?? (mastersError ? getErrorMessage(mastersError, 'Nie udało się pobrać masterów.') : null)}
                onDismiss={actionError ? () => setActionError(null) : undefined}
            />
            {/* Top Row: PalletX Stat Cards & Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
                {/* Stat 1: DOSTĘPNE MASTERY */}
                <div className="lg:col-span-3 bg-brand-surface border border-brand-border p-4 rounded-2xl flex flex-col justify-between shadow-lg hover-lift">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">{t.statAvailable}</span>
                    <div className="my-2">
                        <span className="text-3xl sm:text-4xl font-extrabold text-brand-accent font-mono tracking-tight transition-transform duration-300 inline-block">{stats.active}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>{stats.pctActive}% {t.statActive}</span>
                    </div>
                </div>

                {/* Stat 2: SERWIS / ZABLOKOWANE (Clickable Operational Alert) */}
                <div
                    onClick={() => {
                        if (stats.blocked > 0) {
                            setTaskPreset(prev => prev === 'blocked' ? 'all' : 'blocked');
                        }
                    }}
                    className={`lg:col-span-3 bg-brand-surface border p-4 rounded-2xl flex flex-col justify-between shadow-lg hover-lift transition-all select-none ${
                        stats.blocked > 0 ? 'cursor-pointer' : ''
                    } ${
                        taskPreset === 'blocked'
                            ? 'border-brand-accent/50 bg-brand-accent/5'
                            : 'border-brand-border'
                    }`}
                >
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">{t.statServiceBlocked}</span>
                    </div>
                    <div className="my-2">
                        <span className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight transition-transform duration-300 inline-block ${stats.blocked > 0 ? 'text-rose-400' : 'text-brand-text-muted'}`}>
                            {stats.blocked}
                        </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-brand-text-muted font-medium">
                        <span>{stats.blocked > 0 ? t.statRequiresAttention : t.statNoBlocked}</span>
                    </div>
                </div>

                {/* Action Buttons & Search (tight vertical column without large empty gap) */}
                <div className="lg:col-span-6 flex flex-col justify-center gap-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {/* Add Master Button */}
                        {canEdit && (
                            <button
                                type="button"
                                onClick={() => navigate('/create')}
                                className="interactive-button h-11 px-4 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-brand-accent/30 cursor-pointer"
                            >
                                <Plus size={17} className="transition-transform group-hover:rotate-90 duration-300" />
                                <span>{t.btnAddMaster}</span>
                            </button>
                        )}

                        {/* Export Button */}
                        <button
                            type="button"
                            onClick={exportCsv}
                            className={`interactive-button h-11 px-4 rounded-xl bg-brand-surface border border-brand-border hover:border-brand-text-muted/60 text-brand-text hover:text-brand-text font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer ${
                                !canEdit ? 'sm:col-span-2' : ''
                            }`}
                        >
                            <Download size={15} />
                            <span>{t.btnExportCsv}</span>
                        </button>
                    </div>

                    {/* Search Input matching PalletX with clear button */}
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted" size={17} />
                        <input
                            type="text"
                            placeholder={t.searchPlaceholder}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-11 pl-10 pr-10 bg-brand-surface border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 font-mono transition-all duration-200"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-brand-text-muted hover:text-white rounded-lg hover:bg-brand-surface-high transition-colors cursor-pointer"
                                title="Wyczyść wyszukiwanie"
                            >
                                <X size={15} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter Bar: all filters and clear button in one row */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md flex flex-wrap items-end gap-3">
                {/* Filter 1: Process */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                        {t.filterProcess}
                    </label>
                    <select
                        value={selectedProcess}
                        onChange={(e) => setSelectedProcess(e.target.value)}
                        className={`h-9 px-3 border rounded-xl text-xs font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-all duration-200 ${
                            selectedProcess
                                ? 'bg-indigo-950/40 border-brand-accent text-indigo-200 ring-1 ring-brand-accent/40 font-bold'
                                : 'bg-brand-surface-high border-brand-border text-brand-text hover:border-brand-text-muted/50'
                        }`}
                    >
                        <option value="">{t.allProcesses}</option>
                        {processOptions.map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>

                {/* Filter 2: Status */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                        {t.filterStatus}
                    </label>
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className={`h-9 px-3 border rounded-xl text-xs font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-all duration-200 ${
                            selectedStatus
                                ? 'bg-indigo-950/40 border-brand-accent text-indigo-200 ring-1 ring-brand-accent/40 font-bold'
                                : 'bg-brand-surface-high border-brand-border text-brand-text hover:border-brand-text-muted/50'
                        }`}
                    >
                        <option value="">{t.allStatuses}</option>
                        <option value="GOOD">GOOD</option>
                        <option value="BAD">BAD</option>
                    </select>
                </div>

                {/* Filter 3: Active state */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                        {t.filterActivity}
                    </label>
                    <select
                        value={selectedActive}
                        onChange={(e) => setSelectedActive(e.target.value)}
                        className={`h-9 px-3 border rounded-xl text-xs font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-all duration-200 ${
                            selectedActive !== 'all'
                                ? 'bg-indigo-950/40 border-brand-accent text-indigo-200 ring-1 ring-brand-accent/40 font-bold'
                                : 'bg-brand-surface-high border-brand-border text-brand-text hover:border-brand-text-muted/50'
                        }`}
                    >
                        <option value="all">{t.allActivities}</option>
                        <option value="active">{t.onlyActive}</option>
                        <option value="dead">{t.blockedDead}</option>
                    </select>
                </div>

                {/* Filter 4: Rows per page */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                        {t.rowsPerPage}
                    </label>
                    <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-colors hover:border-brand-text-muted/50"
                    >
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={500}>500</option>
                    </select>
                </div>

                {/* Clear Filters Button */}
                <button
                    type="button"
                    onClick={clearFilters}
                    className={`interactive-button h-9 px-3.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                        searchTerm || selectedProcess || selectedStatus || selectedActive !== 'all'
                            ? 'bg-indigo-500/20 border-brand-accent text-indigo-300 hover:bg-indigo-500/30 shadow-xs'
                            : 'bg-brand-surface-high border-brand-border text-brand-text-muted hover:text-brand-text hover:border-brand-text-muted/60'
                    }`}
                >
                    <RotateCcw size={13} />
                    <span>{t.clearFilters}</span>
                </button>
            </div>

            {/* Task View Presets Bar (Pills matching requested task-based view) */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-2.5 shadow-md flex items-center gap-2 overflow-x-auto scrollbar-thin">
                <div className="text-[11px] font-bold uppercase tracking-wider text-brand-text-muted px-2 shrink-0 flex items-center gap-1.5">
                    <Filter size={13} className="text-brand-accent" />
                    <span>Zadania:</span>
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-max">
                    {[
                        { id: 'all', label: t.taskAll, count: stats.total, color: 'indigo' },
                        { id: 'action_required', label: t.taskActionRequired, count: presetCounts.actionRequired, color: 'rose', icon: AlertTriangle, urgent: presetCounts.actionRequired > 0 },
                        { id: 'blocked', label: t.taskBlocked, count: stats.blocked, color: 'red', icon: Ban },
                        { id: 'cycles_80', label: t.taskCycle80, count: presetCounts.cycles80, color: 'orange', icon: Gauge },
                        { id: 'errors_exceeded', label: t.taskErrorExceeded, count: presetCounts.errorsExceeded, color: 'rose', icon: AlertCircle, urgent: presetCounts.errorsExceeded > 0 },
                        ...(user?.uid ? [{ id: 'my_processes', label: t.taskMyProcesses, count: presetCounts.myProcesses, color: 'cyan', icon: User }] : []),
                    ].map(pill => {
                        const isActive = taskPreset === pill.id;
                        const Icon = pill.icon;
                        return (
                            <button
                                key={pill.id}
                                type="button"
                                onClick={() => setTaskPreset(pill.id as TaskPreset)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                                    isActive
                                        ? 'bg-brand-accent text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] ring-2 ring-brand-accent/50'
                                        : pill.urgent
                                            ? 'bg-rose-950/40 text-rose-300 border border-rose-800/60 hover:bg-rose-900/50 hover:border-rose-500'
                                            : 'bg-brand-surface-high/80 text-brand-text-muted border border-brand-border/60 hover:text-brand-text hover:bg-brand-surface-high hover:border-brand-text-muted/40'
                                }`}
                            >
                                {Icon && <Icon size={13} className={isActive ? 'text-white' : (pill.urgent ? 'text-rose-400 animate-pulse' : 'text-brand-text-muted')} />}
                                <span>{pill.label}</span>
                                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-md ${
                                    isActive
                                        ? 'bg-black/30 text-white'
                                        : pill.urgent
                                            ? 'bg-rose-500/20 text-rose-300 font-bold'
                                            : 'bg-brand-surface text-brand-text-muted'
                                }`}>
                                    {pill.count}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Section Header: Title & Refresh Button */}
            <div className="flex items-center justify-between pt-1">
                <h2 className="text-base sm:text-lg font-bold text-brand-text tracking-wide">{t.sectionRegistryTitle}</h2>
                <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-surface border border-brand-border hover:border-brand-text-muted/60 text-brand-text hover:text-brand-text text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                    <RefreshCw size={14} className={isFetching ? 'animate-spin text-brand-accent' : ''} />
                    <span>{t.btnRefreshMasters}</span>
                </button>
            </div>

            {/* Table with Interactive Sorting and no Checkboxes / Global column */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-[13px] border-collapse table-auto">
                        <thead>
                            <tr className="bg-brand-surface text-brand-text-muted font-mono text-xs uppercase tracking-wider border-b border-brand-border">
                                {renderSortHeader('unit', t.thMasterId, 'w-44')}
                                {renderSortHeader('process', t.thProcess, 'w-40')}
                                {renderSortHeader('FIS', t.thFis, 'w-28 text-center')}
                                {renderSortHeader('currentCounter', t.thCycles, 'w-48')}
                                {renderSortHeader('errorCounter', t.thErrors, 'w-44')}
                                {renderSortHeader('status', t.thStatus, 'w-28 text-center')}
                                {renderSortHeader('user', t.thOperator, 'w-44')}
                                {renderSortHeader('isactive', t.thState, 'w-32 text-center')}
                                {canEdit && <th className="py-3 px-3.5 w-44 font-semibold text-right pr-4">{t.thActions}</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/60 text-brand-text font-mono text-[13px]">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={canEdit ? 9 : 8} className="py-12 text-center text-brand-text-muted">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-brand-accent" size={18} />
                                            <span>{t.loadingMasters}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : displayedMasters.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 9 : 8} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                        {t.noMastersFound}
                                    </td>
                                </tr>
                            ) : (
                                displayedMasters.map((m, idx) => {
                                    const isDead = m.isactive === 2;
                                    const cycleExceeded = m.maxCounter > 0 && m.currentCounter >= m.maxCounter;
                                    const errorExceeded = m.errorMaxCounter > 0 && m.errorCounter >= m.errorMaxCounter;
                                    const cycleWarn = !cycleExceeded && m.maxCounter > 0 && (m.currentCounter / m.maxCounter) >= 0.8;
                                    const cyclePct = m.maxCounter > 0 ? Math.min(100, Math.round((m.currentCounter / m.maxCounter) * 100)) : 0;
                                    const errorPct = m.errorMaxCounter > 0 ? Math.min(100, Math.round((m.errorCounter / m.errorMaxCounter) * 100)) : 0;

                                    return (
                                        <tr
                                            key={m.id}
                                            style={{ animationDelay: `${Math.min(idx * 20, 350)}ms` }}
                                            className={`animate-row-enter transition-colors duration-150 border-b border-brand-border/50 group ${
                                                isDead
                                                    ? 'opacity-60 bg-slate-900/50 hover:bg-brand-surface-high'
                                                    : 'hover:bg-brand-surface-high'
                                            }`}
                                        >
                                            {/* Master ID (Indigo link to FIS 1 / FIS 2) */}
                                            <td className="py-3 px-3.5 font-bold tracking-wide">
                                                <a
                                                    href={getFisUnitHistoryUrl(m.unit, m.FIS)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-brand-accent hover:text-indigo-300 hover:underline inline-flex items-center gap-1.5 transition-transform hover:translate-x-0.5 duration-150"
                                                    title={`Otwórz historię jednostki w FIS ${String(m.FIS || '').includes('2') ? '2' : '1'}`}
                                                >
                                                    {m.unit}
                                                </a>
                                            </td>

                                            {/* Process */}
                                            <td className="py-3 px-3.5 text-brand-text font-semibold break-all">
                                                {m.process}
                                            </td>

                                            {/* Parametry (FIS badge) */}
                                            <td className="py-3 px-3.5 text-center">
                                                <span className="bg-brand-surface-high border border-brand-border text-brand-text px-2 py-0.5 rounded text-xs font-mono inline-block">
                                                    FIS: {m.FIS || '1'}
                                                </span>
                                            </td>

                                            {/* Zużycie (Cykle) with progress bar & exceeded warning */}
                                            <td className="py-3 px-3.5">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className={cycleExceeded ? 'text-rose-400 font-bold flex items-center gap-1' : (cycleWarn ? 'text-amber-300 font-bold' : 'text-slate-200')}>
                                                            {cycleExceeded && <AlertTriangle size={12} className="text-rose-400 shrink-0" />}
                                                            <span>{m.currentCounter} <span className="text-brand-text-muted/60">/ {m.maxCounter}</span></span>
                                                        </span>
                                                        <span className={cycleExceeded ? 'text-rose-400 font-bold' : (cycleWarn ? 'text-amber-400 font-bold' : 'text-brand-text-muted')}>{cyclePct}%</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-brand-surface-high rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                                cycleExceeded
                                                                    ? 'bg-rose-500'
                                                                    : (cycleWarn ? 'bg-amber-500' : 'bg-brand-accent')
                                                            }`}
                                                            style={{ width: `${cyclePct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Licznik Błędów with progress bar & exceeded warning */}
                                            <td className="py-3 px-3.5">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-xs">
                                                        <span className={errorExceeded ? 'text-rose-400 font-bold flex items-center gap-1' : (m.errorCounter > 0 ? 'text-amber-300 font-bold' : 'text-slate-200')}>
                                                            {errorExceeded && <AlertTriangle size={12} className="text-rose-400 shrink-0" />}
                                                            <span>{m.errorCounter} <span className="text-brand-text-muted/60">/ {m.errorMaxCounter}</span></span>
                                                        </span>
                                                        <span className={errorExceeded ? 'text-rose-400 font-bold' : (m.errorCounter > 0 ? 'text-amber-400 font-bold' : 'text-brand-text-muted')}>{errorPct}%</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-brand-surface-high rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                                errorExceeded
                                                                    ? 'bg-rose-500'
                                                                    : (m.errorCounter > 0 ? 'bg-amber-500' : 'bg-brand-border')
                                                            }`}
                                                            style={{ width: `${errorPct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-3 px-3.5 text-center">
                                                {m.status === 'GOOD' ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 transition-transform hover:scale-105 duration-150">
                                                        GOOD
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 transition-transform hover:scale-105 duration-150">
                                                        BAD
                                                    </span>
                                                )}
                                            </td>

                                            {/* Utworzył / Operator */}
                                            <td className="py-3 px-3.5 text-brand-text font-sans truncate max-w-[160px]" title={m.user}>
                                                {m.user || '—'}
                                            </td>

                                            {/* Stan: AKTYWNY / ZABLOKOWANY */}
                                            <td className="py-3 px-3.5 text-center">
                                                {isDead ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 transition-transform hover:scale-105 duration-150">
                                                        {t.stateBlocked}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 transition-transform hover:scale-105 duration-150">
                                                        {t.stateActive}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Akcje (if canEdit) - Safer layout with Reset highlighted */}
                                            {canEdit && (
                                                <td className="py-3 px-3.5 text-right pr-4">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Primary Safe Action: Reset Counters with distinct badge */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setResetTypeChoice('all');
                                                                setResetTarget({ units: [m.unit], unitNames: m.unit });
                                                            }}
                                                            disabled={isDead}
                                                            className={`interactive-button px-2.5 py-1.5 rounded-lg border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                                                                isDead
                                                                    ? 'opacity-30 cursor-not-allowed bg-brand-surface-high border-brand-border text-brand-text-muted/70'
                                                                    : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 hover:border-amber-400 hover:shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                                                            }`}
                                                            title={t.actionReset}
                                                        >
                                                            <RotateCcw size={13} />
                                                            <span>Reset</span>
                                                        </button>

                                                        {/* History Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setHistoryTarget(m)}
                                                            className="interactive-button p-1.5 rounded-lg bg-brand-surface-high border border-brand-border/80 text-brand-text-muted hover:text-indigo-300 hover:border-brand-accent/50 hover:bg-brand-accent/15 hover:shadow-xs cursor-pointer"
                                                            title={t.actionHistory}
                                                        >
                                                            <History size={14} />
                                                        </button>

                                                        {/* Safe Divider separating dangerous actions */}
                                                        <div className="h-4 w-px bg-brand-border/80 mx-0.5" />

                                                        {/* Block / Unblock Toggle */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setBlockTarget({ units: [m.unit], block: !isDead })}
                                                            className={`interactive-button p-1.5 rounded-lg border cursor-pointer transition-all ${
                                                                isDead
                                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 hover:border-emerald-400/60 hover:shadow-xs'
                                                                    : 'bg-brand-surface-high border-brand-border/80 text-brand-text-muted hover:text-rose-400 hover:border-rose-500/40 hover:bg-rose-500/15 hover:shadow-xs'
                                                            }`}
                                                            title={isDead ? t.actionActivateConfirm : t.actionBlockConfirm}
                                                        >
                                                            {isDead ? <Check size={14} /> : <Ban size={14} />}
                                                        </button>

                                                        {/* Delete */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget(m)}
                                                            className="interactive-button p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25 hover:border-rose-400/60 hover:shadow-xs cursor-pointer"
                                                            title={t.actionDeleteConfirm}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <DashboardModals
                t={t}
                resetTarget={resetTarget}
                resetType={resetTypeChoice}
                setResetType={setResetTypeChoice}
                closeReset={() => setResetTarget(null)}
                resetMutation={resetMutation}
                blockTarget={blockTarget}
                closeBlock={() => setBlockTarget(null)}
                blockMutation={blockMutation}
                deleteTarget={deleteTarget}
                closeDelete={() => setDeleteTarget(null)}
                deleteMutation={deleteMutation}
                historyTarget={historyTarget}
                closeHistory={() => setHistoryTarget(null)}
                history={unitHistory}
                historyLoading={historyLoading}
            />
        </div>
    );
};
