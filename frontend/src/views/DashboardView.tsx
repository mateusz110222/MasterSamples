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
    RefreshCw
} from 'lucide-react';

export const DashboardView: React.FC = () => {
    const navigate = useNavigate();
    const { canEdit } = useAuth();
    const { t } = useLanguage();

    // Filters matching PalletX
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedActive, setSelectedActive] = useState('all');
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
        });
    }, [masters, searchTerm, selectedProcess, selectedStatus, selectedActive]);

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
        <div className="space-y-5 animate-page-enter">
            <ErrorBanner
                message={actionError ?? (mastersError ? getErrorMessage(mastersError, 'Nie udało się pobrać masterów.') : null)}
                onDismiss={actionError ? () => setActionError(null) : undefined}
            />
            {/* Top Row: PalletX Stat Cards & Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
                {/* Stat 1: DOSTĘPNE MASTERY */}
                <div className="lg:col-span-3 bg-brand-surface border border-brand-border p-4 rounded-2xl flex flex-col justify-between shadow-lg hover-lift animate-slide-up stagger-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">{t.statAvailable}</span>
                    <div className="my-2">
                        <span className="text-3xl sm:text-4xl font-extrabold text-brand-accent font-mono tracking-tight transition-transform duration-300 inline-block">{stats.active}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>{stats.pctActive}% {t.statActive}</span>
                    </div>
                </div>

                {/* Stat 2: SERWIS / ZABLOKOWANE */}
                <div className={`lg:col-span-3 bg-brand-surface border border-brand-border p-4 rounded-2xl flex flex-col justify-between shadow-lg hover-lift animate-slide-up stagger-2 ${
                    stats.blocked > 0 ? 'border-rose-900/40 shadow-rose-950/20' : ''
                }`}>
                    <span className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">{t.statServiceBlocked}</span>
                    <div className="my-2">
                        <span className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight transition-transform duration-300 inline-block ${stats.blocked > 0 ? 'text-rose-400' : 'text-brand-text-muted'}`}>
                            {stats.blocked}
                        </span>
                    </div>
                    <div className="text-xs text-rose-400/90 font-medium">
                        {stats.blocked > 0 ? t.statRequiresAttention : t.statNoBlocked}
                    </div>
                </div>

                {/* Action Buttons & Search (tight vertical column without large empty gap) */}
                <div className="lg:col-span-6 flex flex-col justify-center gap-2.5 animate-slide-up stagger-3">
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

                    {/* Search Input matching PalletX */}
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted" size={17} />
                        <input
                            type="text"
                            placeholder={t.searchPlaceholder}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-11 pl-10 pr-4 bg-brand-surface border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 font-mono transition-all duration-200"
                        />
                    </div>
                </div>
            </div>

            {/* Filter Bar: all filters and clear button in one row */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md flex flex-wrap items-end gap-3 animate-slide-up stagger-4">
                {/* Filter 1: Process */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                        {t.filterProcess}
                    </label>
                    <select
                        value={selectedProcess}
                        onChange={(e) => setSelectedProcess(e.target.value)}
                        className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-colors hover:border-brand-text-muted/50"
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
                        className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-colors hover:border-brand-text-muted/50"
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
                        className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer transition-colors hover:border-brand-text-muted/50"
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
                    className="interactive-button h-9 px-3.5 rounded-xl bg-brand-surface-high border border-brand-border hover:border-brand-text-muted/60 text-brand-text hover:text-brand-text text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                    <RotateCcw size={13} />
                    <span>{t.clearFilters}</span>
                </button>
            </div>

            {/* Section Header: Title & Refresh Button */}
            <div className="flex items-center justify-between pt-1 animate-slide-up stagger-5">
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
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden animate-slide-up stagger-5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse table-auto">
                        <thead>
                            <tr className="bg-brand-surface text-brand-text-muted font-mono text-[11px] uppercase tracking-wider border-b border-brand-border">
                                {renderSortHeader('unit', t.thMasterId, 'w-44')}
                                {renderSortHeader('process', t.thProcess, 'w-40')}
                                {renderSortHeader('FIS', t.thFis, 'w-28 text-center')}
                                {renderSortHeader('currentCounter', t.thCycles, 'w-48')}
                                {renderSortHeader('errorCounter', t.thErrors, 'w-44')}
                                {renderSortHeader('status', t.thStatus, 'w-28 text-center')}
                                {renderSortHeader('user', t.thOperator, 'w-44')}
                                {renderSortHeader('isactive', t.thState, 'w-32 text-center')}
                                {canEdit && <th className="py-3 px-3.5 w-36 font-semibold text-right pr-4">{t.thActions}</th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/60 text-brand-text font-mono text-xs">
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
                                    const cyclePct = m.maxCounter > 0 ? Math.min(100, Math.round((m.currentCounter / m.maxCounter) * 100)) : 0;
                                    const errorPct = m.errorMaxCounter > 0 ? Math.min(100, Math.round((m.errorCounter / m.errorMaxCounter) * 100)) : 0;

                                    return (
                                        <tr
                                            key={m.id}
                                            style={{ animationDelay: `${Math.min(idx * 20, 350)}ms` }}
                                            className={`animate-row-enter hover:bg-brand-surface-high transition-colors duration-150 ${
                                                isDead ? 'opacity-60 bg-rose-950/10' : ''
                                            }`}
                                        >
                                            {/* Master ID (Indigo link to FIS 1 / FIS 2) */}
                                            <td className="py-2.5 px-3.5 font-bold tracking-wide">
                                                <a
                                                    href={getFisUnitHistoryUrl(m.unit, m.FIS)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-brand-accent hover:text-indigo-300 hover:underline inline-block transition-transform hover:translate-x-0.5 duration-150"
                                                    title={`Otwórz historię jednostki w FIS ${String(m.FIS || '').includes('2') ? '2' : '1'}`}
                                                >
                                                    {m.unit}
                                                </a>
                                            </td>

                                            {/* Process */}
                                            <td className="py-2.5 px-3.5 text-brand-text font-semibold break-all">
                                                {m.process}
                                            </td>

                                            {/* Parametry (FIS badge) */}
                                            <td className="py-2.5 px-3.5 text-center">
                                                <span className="bg-brand-surface-high border border-brand-border text-brand-text px-2 py-0.5 rounded text-[11px] font-mono inline-block">
                                                    FIS: {m.FIS || '1'}
                                                </span>
                                            </td>

                                            {/* Zużycie (Cykle) with progress bar */}
                                            <td className="py-2.5 px-3.5">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-[11px] text-brand-text">
                                                        <span>{m.currentCounter} <span className="text-brand-text-muted/70">/ {m.maxCounter}</span></span>
                                                        <span className={cyclePct >= 90 ? 'text-rose-400 font-bold' : (cyclePct >= 80 ? 'text-amber-400 font-bold' : 'text-brand-text-muted')}>{cyclePct}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-brand-surface-high rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                                cyclePct >= 90 ? 'bg-rose-500' : (cyclePct >= 80 ? 'bg-amber-500' : 'bg-brand-accent')
                                                            }`}
                                                            style={{ width: `${cyclePct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Licznik Błędów with progress bar */}
                                            <td className="py-2.5 px-3.5">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-[11px]">
                                                        <span className={m.errorCounter > 0 ? 'text-rose-400 font-bold' : 'text-brand-text'}>
                                                             {m.errorCounter} <span className="text-brand-text-muted/70">/ {m.errorMaxCounter}</span>
                                                        </span>
                                                        <span className={m.errorCounter > 0 ? 'text-rose-400 font-bold' : 'text-brand-text-muted'}>{errorPct}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-brand-surface-high rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                                m.errorCounter > 0 ? 'bg-rose-500' : 'bg-brand-border'
                                                            }`}
                                                            style={{ width: `${errorPct}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="py-2.5 px-3.5 text-center">
                                                {m.status === 'GOOD' ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 transition-transform hover:scale-105 duration-150">
                                                        GOOD
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 transition-transform hover:scale-105 duration-150">
                                                        BAD
                                                    </span>
                                                )}
                                            </td>

                                            {/* Utworzył / Operator */}
                                            <td className="py-2.5 px-3.5 text-brand-text font-sans truncate max-w-[160px]" title={m.user}>
                                                {m.user || '—'}
                                            </td>

                                            {/* Stan: AKTYWNY / ZABLOKOWANY */}
                                            <td className="py-2.5 px-3.5 text-center">
                                                {isDead ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30 transition-transform hover:scale-105 duration-150">
                                                        {t.stateBlocked}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 transition-transform hover:scale-105 duration-150">
                                                        {t.stateActive}
                                                    </span>
                                                )}
                                            </td>

                                            {/* Akcje (if canEdit) */}
                                            {canEdit && (
                                                <td className="py-2.5 px-3.5 text-right pr-4">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        {/* Unit History Button */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setHistoryTarget(m)}
                                                            className="p-1.5 rounded-lg bg-brand-surface-high border border-brand-border text-brand-text-muted hover:text-brand-text hover:border-brand-text-muted/60 hover:scale-110 active:scale-95 transition-all duration-150 cursor-pointer"
                                                            title="Historia zmian tego mastera"
                                                        >
                                                            <History size={14} />
                                                        </button>

                                                        {/* Selective Reset Counter Options */}
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setResetTypeChoice('all');
                                                                setResetTarget({ units: [m.unit], unitNames: m.unit });
                                                            }}
                                                            disabled={isDead}
                                                            className={`p-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                                                                isDead
                                                                    ? 'opacity-30 cursor-not-allowed bg-brand-surface-high border-brand-border text-brand-text-muted/70'
                                                                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20 hover:scale-110 active:scale-95'
                                                            }`}
                                                            title="Resetuj liczniki (wybór cykli lub błędów)"
                                                        >
                                                            <RotateCcw size={14} />
                                                        </button>

                                                        {/* Block / Unblock Toggle */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setBlockTarget({ units: [m.unit], block: !isDead })}
                                                            className={`p-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                                                                isDead
                                                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:scale-110 active:scale-95'
                                                                    : 'bg-brand-surface-high border-brand-border text-brand-text-muted hover:text-rose-400 hover:border-rose-500/30 hover:scale-110 active:scale-95'
                                                            }`}
                                                            title={isDead ? "Aktywuj mastera" : "Zablokuj mastera (isActive=2)"}
                                                        >
                                                            {isDead ? <Check size={14} /> : <Ban size={14} />}
                                                        </button>

                                                        {/* Delete */}
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget(m)}
                                                            className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 hover:scale-110 active:scale-95 transition-all duration-150 cursor-pointer"
                                                            title="Usuń z bazy danych"
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
