import React, { useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
    getActivePercentage,
    matchesCurrentUser,
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
    RefreshCw,
    X,
    AlertTriangle,
    Filter,
    Gauge,
    User,
    AlertCircle,
    ShieldAlert,
    ShieldCheck,
} from 'lucide-react';
import { Pagination } from '../components/common/Pagination';
import { useAdaptiveTableColumns } from '../hooks/useAdaptiveTableColumns';

export const DashboardView: React.FC = () => {
    const navigate = useNavigate();
    const { canEdit, user } = useAuth();
    const { language, t } = useLanguage();
    const isPl = language === 'PL';

    // Filters matching PalletX
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedActive, setSelectedActive] = useState('all');
    const [taskPreset, setTaskPreset] = useState<TaskPreset>('all');
    const [pageSize, setPageSize] = useState<number>(50);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const tableCardRef = useRef<HTMLDivElement>(null);
    const tableBodyRef = useRef<HTMLTableSectionElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);

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
        const pctActive = getActivePercentage(active, total);
        return { total, active, blocked, pctActive };
    }, [masters]);

    // Task Preset Counts
    const presetCounts = useMemo(() => {
        let actionRequired = 0;
        let cycles80 = 0;
        let errorsExceeded = 0;
        let myProcesses = 0;

        masters.forEach(m => {
            const cycleExceeded = m.maxCounter > 0 && m.currentCounter >= m.maxCounter;
            const errorExceeded = m.errorMaxCounter > 0 && m.errorCounter >= m.errorMaxCounter;
            const cycle80 = m.maxCounter > 0 && (m.currentCounter / m.maxCounter) >= 0.8;
            const isDead = m.isactive === 2;

            if (cycleExceeded || errorExceeded || isDead) actionRequired++;
            if (cycle80) cycles80++;
            if (errorExceeded) errorsExceeded++;
            if (matchesCurrentUser(m.user ?? '', user?.uid, user?.name)) myProcesses++;
        });

        return { actionRequired, cycles80, errorsExceeded, myProcesses };
    }, [masters, user?.uid, user?.name]);

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
            currentUserName: user?.name,
        });
    }, [masters, searchTerm, selectedProcess, selectedStatus, selectedActive, taskPreset, user?.uid, user?.name]);

    // Sorted data
    const sortedMasters = useMemo(() => {
        return sortMasters(filteredMasters, sortField, sortDirection);
    }, [filteredMasters, sortField, sortDirection]);

    // Pagination calculations
    const totalItems = sortedMasters.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

    const displayedMasters = useMemo(() => {
        const startIndex = (safeCurrentPage - 1) * pageSize;
        return sortedMasters.slice(startIndex, startIndex + pageSize);
    }, [sortedMasters, safeCurrentPage, pageSize]);
    useAdaptiveTableColumns(tableRef, displayedMasters, 8, 1, language);

    const handlePageChange = (nextPage: number) => {
        if (nextPage === safeCurrentPage) return;
        tableBodyRef.current?.scrollTo({ top: 0 });
        setCurrentPage(nextPage);
        tableCardRef.current?.scrollIntoView({ block: 'start' });
    };

    const selectTaskPreset = (preset: TaskPreset) => {
        setTaskPreset(current => current === preset && preset !== 'all' ? 'all' : preset);
        setCurrentPage(1);
        tableBodyRef.current?.scrollTo({ top: 0 });
    };

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
        setCurrentPage(1);
        tableBodyRef.current?.scrollTo({ top: 0 });
    };

    // CSV Export
    const exportCsv = () => {
        downloadTextFile(
            buildMastersCsv(sortedMasters),
            `masters_export_${new Date().toISOString().slice(0, 10)}.csv`,
            'text/csv;charset=utf-8',
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
                        <span>{stats.pctActive.toLocaleString(isPl ? 'pl-PL' : 'en-US', { maximumFractionDigits: 1 })}% {t.statActive}</span>
                    </div>
                </div>

                {/* Stat 2: SERWIS / ZABLOKOWANE (Clickable Operational Alert) */}
                <button
                    type="button"
                    disabled={stats.blocked === 0}
                    aria-pressed={taskPreset === 'blocked'}
                    aria-label={`${t.statServiceBlocked}: ${stats.blocked}`}
                    onClick={() => {
                        selectTaskPreset('blocked');
                    }}
                    className={`lg:col-span-3 w-full text-left bg-brand-surface border p-4 rounded-2xl flex flex-col justify-between shadow-lg hover-lift transition-all select-none focus-visible:outline-2 focus-visible:outline-brand-accent ${
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
                </button>

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
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                            className="w-full h-11 pl-10 pr-10 bg-brand-surface border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 font-mono transition-all duration-200"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
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
                        onChange={(e) => { setSelectedProcess(e.target.value); setCurrentPage(1); }}
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
                        onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
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
                        onChange={(e) => { setSelectedActive(e.target.value); setCurrentPage(1); }}
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
                        onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                        className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-colors hover:border-brand-text-muted/50"
                    >
                        <option value={15}>15</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                        <option value={250}>250</option>
                        <option value={500}>500</option>
                    </select>
                </div>

                {/* Clear Filters Button */}
                <button
                    type="button"
                    onClick={clearFilters}
                    className={`interactive-button h-9 px-3.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                        searchTerm || selectedProcess || selectedStatus || selectedActive !== 'all' || taskPreset !== 'all'
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
                                aria-pressed={isActive}
                                onClick={() => selectTaskPreset(pill.id as TaskPreset)}
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

            {/* Master Inventory Table matching PalletX */}
            <div ref={tableCardRef} className="bg-brand-surface rounded-xl border border-brand-border overflow-hidden">
                {/* Card Header: Title & Refresh Button */}
                <div className="px-6 py-4 border-b border-brand-border flex flex-wrap gap-3 justify-between items-center bg-brand-surface/50">
                    <h3 className="text-base font-bold text-brand-text">{t.sectionRegistryTitle}</h3>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        title={t.btnRefreshMasters}
                        aria-label={t.btnRefreshMasters}
                        className="border border-brand-border text-brand-text font-bold uppercase text-xs h-9 px-3 flex items-center justify-center gap-2 hover:bg-brand-surface-high hover:border-brand-accent/40 active:scale-[0.98] transition-all rounded disabled:opacity-50 cursor-pointer"
                    >
                        <RefreshCw size={14} className={isFetching ? "animate-spin text-brand-accent" : ""}/>
                        <span>{t.btnRefreshMasters}</span>
                    </button>
                </div>

                {/* Table Frame & Scroll Container */}
                <div className="admin-table-frame relative">
                    <div className="admin-table-scroll relative overflow-x-auto">
                        <table ref={tableRef} className="split-scroll-table border-collapse">
                            <thead>
                                <tr className="border-b border-brand-border text-left select-none">
                                    <th aria-sort={sortField === 'unit' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted">
                                        <button type="button" onClick={() => handleSort('unit')} className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                                            {t.thMasterId}
                                            <span aria-hidden="true">{sortField === 'unit' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                    <th aria-sort={sortField === 'process' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted">
                                        <button type="button" onClick={() => handleSort('process')} className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                                            {t.thProcess}
                                            <span aria-hidden="true">{sortField === 'process' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                    <th aria-sort={sortField === 'FIS' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted">
                                        <button type="button" onClick={() => handleSort('FIS')} className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                                            {t.thFis}
                                            <span aria-hidden="true">{sortField === 'FIS' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                    <th aria-sort={sortField === 'currentCounter' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted">
                                        <button type="button" onClick={() => handleSort('currentCounter')} className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                                            {t.thCycles}
                                            <span aria-hidden="true">{sortField === 'currentCounter' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                    <th aria-sort={sortField === 'errorCounter' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted">
                                        <button type="button" onClick={() => handleSort('errorCounter')} className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                                            {t.thErrors}
                                            <span aria-hidden="true">{sortField === 'errorCounter' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                    <th aria-sort={sortField === 'status' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted">
                                        <button type="button" onClick={() => handleSort('status')} className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                                            {t.thStatus}
                                            <span aria-hidden="true">{sortField === 'status' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                    <th aria-sort={sortField === 'user' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'} className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted">
                                        <button type="button" onClick={() => handleSort('user')} className="flex items-center gap-2 whitespace-nowrap cursor-pointer">
                                            {t.thOperator}
                                            <span aria-hidden="true">{sortField === 'user' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        </button>
                                    </th>
                                    <th className="px-6 py-3 text-[0.625rem] uppercase font-bold tracking-wider text-brand-text-muted text-right">
                                        {t.thActions}
                                    </th>
                                </tr>
                            </thead>
                            <tbody ref={tableBodyRef} className="divide-y divide-brand-border">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-brand-text-muted">
                                            <div className="inline-flex items-center gap-2">
                                                <RefreshCw className="animate-spin text-brand-accent" size={18} />
                                                <span>{t.loadingMasters}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : displayedMasters.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-6 py-12 text-center text-brand-text-muted">
                                            {t.noMastersFound}
                                        </td>
                                    </tr>
                                ) : (
                                    displayedMasters.map((m, idx) => {
                                        const isDead = m.isactive === 2;
                                        const maxC = m.maxCounter || 1000;
                                        const currC = m.currentCounter || 0;
                                        const usagePercent = Math.min(100, Math.round((currC / maxC) * 100));
                                        const isLimitExceeded = maxC > 0 && currC >= maxC;

                                        const maxE = m.errorMaxCounter || 50;
                                        const currE = m.errorCounter || 0;
                                        const errorPercent = Math.min(100, Math.round((currE / maxE) * 100));
                                        const isErrorExceeded = maxE > 0 && currE >= maxE;

                                        return (
                                            <tr
                                                key={m.unit}
                                                style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
                                                className="animate-row-enter hover:bg-brand-surface-high/30 transition-colors"
                                            >
                                                {/* Master ID */}
                                                <td className="px-6 py-4 font-mono text-xs font-semibold">
                                                    <button
                                                        type="button"
                                                        onClick={() => setHistoryTarget(m)}
                                                        title="Historia mastera"
                                                        className="w-max whitespace-nowrap text-brand-accent hover:text-brand-text hover:underline underline-offset-2 cursor-pointer transition-colors focus:outline-none focus:ring-1 focus:ring-brand-accent rounded px-1 -mx-1"
                                                    >
                                                        {m.unit}
                                                    </button>
                                                </td>

                                                {/* Process */}
                                                <td className="px-6 py-4 text-xs font-medium text-brand-text">
                                                    <span className="block w-max max-w-68 wrap-anywhere">{m.process}</span>
                                                </td>

                                                {/* FIS Parameters */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1">
                                                        <span className="bg-brand-surface-high text-[0.5625rem] px-2 py-0.5 rounded border border-brand-border font-mono text-brand-text">
                                                            FIS: {m.FIS ? (m.FIS.replace(/[^0-9]/g, '') || m.FIS) : '1'}
                                                        </span>
                                                    </div>
                                                </td>

                                                {/* Cycle Usage with Progress Bar */}
                                                <td className="px-6 py-4">
                                                    <div className="w-32 flex flex-col gap-1">
                                                        <div className="flex justify-between text-[0.625rem] font-mono">
                                                            <span className={isLimitExceeded ? "text-red-400 font-bold" : "text-brand-text-muted"}>
                                                                {currC}
                                                            </span>
                                                            <span className="text-brand-text-muted/60">/ {maxC}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-brand-bg rounded-full overflow-hidden border border-brand-border/40">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    isLimitExceeded
                                                                        ? 'bg-red-500'
                                                                        : usagePercent > 85
                                                                            ? 'bg-yellow-500'
                                                                            : 'bg-brand-accent'
                                                                }`}
                                                                style={{ width: `${usagePercent}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Error Counter with Progress Bar */}
                                                <td className="px-6 py-4">
                                                    <div className="w-28 flex flex-col gap-1">
                                                        <div className="flex justify-between text-[0.625rem] font-mono">
                                                            <span className={isErrorExceeded ? "text-red-400 font-bold" : "text-brand-text-muted"}>
                                                                {currE}
                                                            </span>
                                                            <span className="text-brand-text-muted/60">/ {maxE}</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-brand-bg rounded-full overflow-hidden border border-brand-border/40">
                                                            <div
                                                                className={`h-full rounded-full transition-all duration-500 ${
                                                                    isErrorExceeded
                                                                        ? 'bg-red-500'
                                                                        : errorPercent > 85
                                                                            ? 'bg-yellow-500'
                                                                            : 'bg-brand-accent'
                                                                }`}
                                                                style={{ width: `${errorPercent}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Quality / Status: GOOD / BAD */}
                                                <td className="px-6 py-4">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider font-mono border ${
                                                        m.status === 'GOOD'
                                                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                                            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                                    }`}>
                                                        {m.status}
                                                    </span>
                                                </td>

                                                {/* Created By / Operator */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-medium text-brand-text">{m.user || '—'}</span>
                                                    </div>
                                                </td>

                                                {/* Actions */}
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex min-w-48 items-center justify-end gap-1">
                                                        {/* Historia mastera */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setHistoryTarget(m)}
                                                            title={t.actionHistory || 'Historia zmian'}
                                                            aria-label={`Historia: ${m.unit}`}
                                                            className="rounded-lg p-2 text-brand-text-muted hover:bg-brand-accent/10 hover:text-brand-accent transition-colors cursor-pointer"
                                                        >
                                                            <History size={16} />
                                                        </button>

                                                        {/* Reset liczników */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setResetTypeChoice('all');
                                                                setResetTarget({ units: [m.unit], unitNames: m.unit });
                                                            }}
                                                            disabled={isDead}
                                                            title={t.actionReset || 'Reset liczników'}
                                                            aria-label={`Reset: ${m.unit}`}
                                                            className="rounded-lg p-2 text-brand-text-muted hover:bg-amber-500/10 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                                        >
                                                            <RotateCcw size={16} />
                                                        </button>

                                                        <span aria-hidden="true" className="mx-1 h-6 w-px bg-brand-border" />

                                                        {isDead ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setBlockTarget({ units: [m.unit], block: false })}
                                                                title={t.actionActivateConfirm || 'Odblokuj'}
                                                                aria-label={`Odblokuj: ${m.unit}`}
                                                                className="inline-flex items-center gap-1.5 rounded-lg p-2 text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                                                            >
                                                                <ShieldCheck size={16} />
                                                                <span className="text-[0.625rem] font-bold uppercase">{t.actionActivateConfirm || 'ODBLOKUJ'}</span>
                                                            </button>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => setBlockTarget({ units: [m.unit], block: true })}
                                                                title={t.actionBlockConfirm || 'Zablokuj'}
                                                                aria-label={`Zablokuj: ${m.unit}`}
                                                                className="inline-flex items-center gap-1.5 rounded-lg p-2 text-brand-text-muted hover:bg-amber-500/10 hover:text-amber-400 transition-colors cursor-pointer"
                                                            >
                                                                <ShieldAlert size={16} />
                                                                <span className="text-[0.625rem] font-bold uppercase">{t.actionBlockConfirm || 'ZABLOKUJ'}</span>
                                                            </button>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget(m)}
                                                            title={t.actionDeleteConfirm || 'Usuń z ewidencji'}
                                                            aria-label={`Usuń z ewidencji: ${m.unit}`}
                                                            className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-red-400 hover:border-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors cursor-pointer"
                                                        >
                                                            <Trash2 size={16} />
                                                            <span className="text-[0.625rem] font-bold uppercase">{t.actionDeleteConfirm || 'USUŃ Z EWIDENCJI'}</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Paginacja matching PalletX */}
                <Pagination
                    currentPage={safeCurrentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    onPageChange={handlePageChange}
                />
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
