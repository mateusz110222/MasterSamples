import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { masterApi } from '../api/masterApi';
import { getFisUnitHistoryUrl } from '../api/fisApi';
import { MasterUnit, HistoryRecord, ResetType } from '../types';
import { useAuth } from '../auth/AuthContext';
import { useLanguage } from '../i18n/LanguageContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
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
    AlertTriangle
} from 'lucide-react';

type SortField = 'unit' | 'process' | 'FIS' | 'currentCounter' | 'errorCounter' | 'status' | 'user' | 'isactive';
type SortDirection = 'asc' | 'desc';

export const DashboardView: React.FC = () => {
    const navigate = useNavigate();
    const { user, canEdit } = useAuth();
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    // Filters matching PalletX
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProcess, setSelectedProcess] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedActive, setSelectedActive] = useState('all');
    const [pageSize, setPageSize] = useState<number>(50);

    // Interactive column sorting
    const [sortField, setSortField] = useState<SortField>('unit');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    // Modals
    const [resetTarget, setResetTarget] = useState<{ units: string[]; unitNames: string } | null>(null);
    const [resetTypeChoice, setResetTypeChoice] = useState<ResetType>('all');
    const [blockTarget, setBlockTarget] = useState<{ units: string[]; block: boolean } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<MasterUnit | null>(null);
    const [historyTarget, setHistoryTarget] = useState<MasterUnit | null>(null);

    // Queries
    const { data: masters = [], isLoading, isFetching, refetch } = useQuery({
        queryKey: ['masters'],
        queryFn: () => masterApi.getMasters(),
        refetchInterval: 30000,
    });

    const { data: unitHistory = [], isLoading: historyLoading } = useQuery({
        queryKey: ['unitHistory', historyTarget?.unit],
        queryFn: () => historyTarget ? masterApi.getMasterHistory(historyTarget.unit) : Promise.resolve([]),
        enabled: !!historyTarget,
    });

    // Mutations
    const resetMutation = useMutation({
        mutationFn: ({ units, type }: { units: string[]; type: ResetType }) => 
            masterApi.resetCounters(units, type, user?.uid || 'USER'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['masters'] });
            setResetTarget(null);
        }
    });

    const blockMutation = useMutation({
        mutationFn: ({ units, block }: { units: string[]; block: boolean }) => 
            block ? masterApi.blockMaster(units, user?.uid || 'USER') : masterApi.activateMaster(units[0], user?.uid || 'USER'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['masters'] });
            setBlockTarget(null);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: (unit: string) => masterApi.deleteMaster(unit, user?.uid || 'USER'),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['masters'] });
            setDeleteTarget(null);
        }
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
            m.process.split(',').forEach(p => set.add(p.trim()));
        });
        return Array.from(set).sort();
    }, [masters]);

    // Filtered data
    const filteredMasters = useMemo(() => {
        return masters.filter(m => {
            if (searchTerm) {
                const s = searchTerm.toLowerCase();
                const match = m.unit.toLowerCase().includes(s) ||
                              m.process.toLowerCase().includes(s) ||
                              m.user?.toLowerCase().includes(s);
                if (!match) return false;
            }
            if (selectedProcess && !m.process.includes(selectedProcess)) return false;
            if (selectedStatus && m.status !== selectedStatus) return false;
            if (selectedActive === 'active' && m.isactive !== 1) return false;
            if (selectedActive === 'dead' && m.isactive !== 2) return false;
            return true;
        });
    }, [masters, searchTerm, selectedProcess, selectedStatus, selectedActive]);

    // Sorted data
    const sortedMasters = useMemo(() => {
        const list = [...filteredMasters];
        list.sort((a, b) => {
            const valA = a[sortField];
            const valB = b[sortField];

            // Numeric comparisons
            if (sortField === 'currentCounter' || sortField === 'errorCounter' || sortField === 'isactive') {
                const numA = Number(valA) || 0;
                const numB = Number(valB) || 0;
                return sortDirection === 'asc' ? numA - numB : numB - numA;
            }

            // String comparisons
            const strA = (valA || '').toString().toLowerCase();
            const strB = (valB || '').toString().toLowerCase();
            if (strA < strB) return sortDirection === 'asc' ? -1 : 1;
            if (strA > strB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        return list;
    }, [filteredMasters, sortField, sortDirection]);

    const displayedMasters = useMemo(() => {
        return sortedMasters.slice(0, pageSize);
    }, [sortedMasters, pageSize]);

    // Sort handler
    const handleSort = (field: SortField) => {
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
        const headers = ['Unit', 'Process', 'Status', 'CurrentCounter', 'MaxCounter', 'ErrorCounter', 'ErrorMaxCounter', 'User', 'IsActive', 'FIS'];
        const rows = sortedMasters.map(m => [
            m.unit,
            `"${m.process}"`,
            m.status,
            m.currentCounter,
            m.maxCounter,
            m.errorCounter,
            m.errorMaxCounter,
            `"${m.user || ''}"`,
            m.isactive,
            m.FIS
        ]);
        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `masters_export_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Helper for sortable column header
    const renderSortHeader = (field: SortField, label: string, className = '') => {
        const isActive = sortField === field;
        return (
            <th
                onClick={() => handleSort(field)}
                className={`py-3 px-3.5 font-semibold select-none cursor-pointer transition-colors hover:text-white group ${className} ${
                    isActive ? 'text-indigo-400 font-bold bg-indigo-950/20' : 'text-slate-400'
                }`}
                title={`Sortuj wg: ${label}`}
            >
                <div className={`inline-flex items-center gap-1.5 ${
                    className.includes('text-center') ? 'justify-center w-full' : (className.includes('text-right') ? 'justify-end w-full' : 'justify-start')
                }`}>
                    <span>{label}</span>
                    <span className={`text-xs font-mono font-bold transition-transform ${
                        isActive ? 'text-indigo-400' : 'text-slate-600 group-hover:text-slate-400'
                    }`}>
                        {isActive ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                </div>
            </th>
        );
    };

    return (
        <div className="space-y-5 animate-page-enter">
            {/* Top Row: PalletX Stat Cards & Action Buttons */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
                {/* Stat 1: DOSTĘPNE MASTERY */}
                <div className="lg:col-span-3 bg-[#0d1322] border border-[#1e293b] p-4 rounded-2xl flex flex-col justify-between shadow-lg hover-lift animate-slide-up stagger-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.statAvailable}</span>
                    <div className="my-2">
                        <span className="text-3xl sm:text-4xl font-extrabold text-indigo-400 font-mono tracking-tight transition-transform duration-300 inline-block">{stats.active}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span>{stats.pctActive}% {t.statActive}</span>
                    </div>
                </div>

                {/* Stat 2: SERWIS / ZABLOKOWANE */}
                <div className={`lg:col-span-3 bg-[#0d1322] border border-[#1e293b] p-4 rounded-2xl flex flex-col justify-between shadow-lg hover-lift animate-slide-up stagger-2 ${
                    stats.blocked > 0 ? 'border-rose-900/40 shadow-rose-950/20' : ''
                }`}>
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t.statServiceBlocked}</span>
                    <div className="my-2">
                        <span className={`text-3xl sm:text-4xl font-extrabold font-mono tracking-tight transition-transform duration-300 inline-block ${stats.blocked > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
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
                                className="interactive-button h-11 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 cursor-pointer"
                            >
                                <Plus size={17} className="transition-transform group-hover:rotate-90 duration-300" />
                                <span>{t.btnAddMaster}</span>
                            </button>
                        )}

                        {/* Export Button */}
                        <button
                            type="button"
                            onClick={exportCsv}
                            className={`interactive-button h-11 px-4 rounded-xl bg-[#111827] border border-[#1e293b] hover:border-slate-500 text-slate-300 hover:text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer ${
                                !canEdit ? 'sm:col-span-2' : ''
                            }`}
                        >
                            <Download size={15} />
                            <span>{t.btnExportCsv}</span>
                        </button>
                    </div>

                    {/* Search Input matching PalletX */}
                    <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
                        <input
                            type="text"
                            placeholder={t.searchPlaceholder}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full h-11 pl-10 pr-4 bg-[#0d1322] border border-[#1e293b] rounded-xl text-xs text-white placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 font-mono transition-all duration-200"
                        />
                    </div>
                </div>
            </div>

            {/* Filter Bar: all filters and clear button in one row */}
            <div className="bg-[#0d1322] border border-[#1e293b] rounded-2xl p-4 shadow-md flex flex-wrap items-end gap-3 animate-slide-up stagger-4">
                {/* Filter 1: Process */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t.filterProcess}
                    </label>
                    <select
                        value={selectedProcess}
                        onChange={(e) => setSelectedProcess(e.target.value)}
                        className="h-9 px-3 bg-[#161f32] border border-[#1e293b] rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors hover:border-slate-600"
                    >
                        <option value="">{t.allProcesses}</option>
                        {processOptions.map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>

                {/* Filter 2: Status */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t.filterStatus}
                    </label>
                    <select
                        value={selectedStatus}
                        onChange={(e) => setSelectedStatus(e.target.value)}
                        className="h-9 px-3 bg-[#161f32] border border-[#1e293b] rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors hover:border-slate-600"
                    >
                        <option value="">{t.allStatuses}</option>
                        <option value="GOOD">GOOD</option>
                        <option value="BAD">BAD</option>
                    </select>
                </div>

                {/* Filter 3: Active state */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t.filterActivity}
                    </label>
                    <select
                        value={selectedActive}
                        onChange={(e) => setSelectedActive(e.target.value)}
                        className="h-9 px-3 bg-[#161f32] border border-[#1e293b] rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors hover:border-slate-600"
                    >
                        <option value="all">{t.allActivities}</option>
                        <option value="active">{t.onlyActive}</option>
                        <option value="dead">{t.blockedDead}</option>
                    </select>
                </div>

                {/* Filter 4: Rows per page */}
                <div className="space-y-1">
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {t.rowsPerPage}
                    </label>
                    <select
                        value={pageSize}
                        onChange={(e) => setPageSize(Number(e.target.value))}
                        className="h-9 px-3 bg-[#161f32] border border-[#1e293b] rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-indigo-500 cursor-pointer transition-colors hover:border-slate-600"
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
                    className="interactive-button h-9 px-3.5 rounded-xl bg-[#161f32] border border-[#1e293b] hover:border-slate-500 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                >
                    <RotateCcw size={13} />
                    <span>{t.clearFilters}</span>
                </button>
            </div>

            {/* Section Header: Title & Refresh Button */}
            <div className="flex items-center justify-between pt-1 animate-slide-up stagger-5">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide">{t.sectionRegistryTitle}</h2>
                <button
                    type="button"
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#111827] border border-[#1e293b] hover:border-slate-500 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                    <RefreshCw size={14} className={isFetching ? 'animate-spin text-indigo-400' : ''} />
                    <span>{t.btnRefreshMasters}</span>
                </button>
            </div>

            {/* Table with Interactive Sorting and no Checkboxes / Global column */}
            <div className="bg-[#0d1322] border border-[#1e293b] rounded-2xl shadow-xl overflow-hidden animate-slide-up stagger-5">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse table-auto">
                        <thead>
                            <tr className="bg-[#111827] text-slate-400 font-mono text-[11px] uppercase tracking-wider border-b border-[#1e293b]">
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
                        <tbody className="divide-y divide-[#1e293b]/60 text-slate-200 font-mono text-xs">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={canEdit ? 9 : 8} className="py-12 text-center text-slate-400">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-indigo-500" size={18} />
                                            <span>{t.loadingMasters}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : displayedMasters.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 9 : 8} className="py-12 text-center text-slate-500 font-sans">
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
                                            className={`animate-row-enter hover:bg-[#161f32] transition-colors duration-150 ${
                                                isDead ? 'opacity-60 bg-rose-950/10' : ''
                                            }`}
                                        >
                                            {/* Master ID (Indigo link to FIS 1 / FIS 2) */}
                                            <td className="py-2.5 px-3.5 font-bold tracking-wide">
                                                <a 
                                                    href={getFisUnitHistoryUrl(m.unit, m.FIS)}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-indigo-400 hover:text-indigo-300 hover:underline inline-block transition-transform hover:translate-x-0.5 duration-150"
                                                    title={`Otwórz historię jednostki w FIS ${String(m.FIS || '').includes('2') ? '2' : '1'}`}
                                                >
                                                    {m.unit}
                                                </a>
                                            </td>

                                            {/* Process */}
                                            <td className="py-2.5 px-3.5 text-slate-300 font-semibold break-all">
                                                {m.process}
                                            </td>

                                            {/* Parametry (FIS badge) */}
                                            <td className="py-2.5 px-3.5 text-center">
                                                <span className="bg-[#161f32] border border-[#1e293b] text-slate-300 px-2 py-0.5 rounded text-[11px] font-mono inline-block">
                                                    FIS: {m.FIS || '1'}
                                                </span>
                                            </td>

                                            {/* Zużycie (Cykle) with progress bar */}
                                            <td className="py-2.5 px-3.5">
                                                <div className="space-y-1">
                                                    <div className="flex justify-between items-center text-[11px] text-slate-300">
                                                        <span>{m.currentCounter} <span className="text-slate-500">/ {m.maxCounter}</span></span>
                                                        <span className={cyclePct >= 90 ? 'text-rose-400 font-bold' : (cyclePct >= 80 ? 'text-amber-400 font-bold' : 'text-slate-400')}>{cyclePct}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                                cyclePct >= 90 ? 'bg-rose-500' : (cyclePct >= 80 ? 'bg-amber-500' : 'bg-indigo-500')
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
                                                        <span className={m.errorCounter > 0 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                                                             {m.errorCounter} <span className="text-slate-500">/ {m.errorMaxCounter}</span>
                                                        </span>
                                                        <span className={m.errorCounter > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>{errorPct}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                                m.errorCounter > 0 ? 'bg-rose-500' : 'bg-slate-700'
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
                                            <td className="py-2.5 px-3.5 text-slate-300 font-sans truncate max-w-[160px]" title={m.user}>
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
                                                            className="p-1.5 rounded-lg bg-[#161f32] border border-[#1e293b] text-slate-400 hover:text-white hover:border-slate-500 hover:scale-110 active:scale-95 transition-all duration-150 cursor-pointer"
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
                                                                    ? 'opacity-30 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-500' 
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
                                                                    : 'bg-[#161f32] border-[#1e293b] text-slate-400 hover:text-rose-400 hover:border-rose-500/30 hover:scale-110 active:scale-95'
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

            {/* MODAL 1: Reset Counters with Option Selection */}
            <Modal
                isOpen={!!resetTarget}
                onClose={() => setResetTarget(null)}
                title={t.resetModalTitle}
                description={`${t.resetModalDesc} ${resetTarget?.unitNames}`}
            >
                <div className="space-y-5">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                            Wybierz rodzaj resetu:
                        </label>

                        {/* Option 1: Both */}
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            resetTypeChoice === 'all' 
                                ? 'bg-indigo-600/15 border-indigo-500 text-white' 
                                : 'bg-[#111827] border-[#1e293b] text-slate-300 hover:bg-[#161f32]'
                        }`}>
                            <input
                                type="radio"
                                name="resetOption"
                                value="all"
                                checked={resetTypeChoice === 'all'}
                                onChange={() => setResetTypeChoice('all')}
                                className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                            />
                            <div>
                                <span className="font-bold text-sm block">{t.resetOptBoth}</span>
                                <span className="text-xs text-slate-400">{t.resetOptBothSub}</span>
                            </div>
                        </label>

                        {/* Option 2: Cycles only */}
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            resetTypeChoice === 'cycles' 
                                ? 'bg-amber-500/15 border-amber-500 text-white' 
                                : 'bg-[#111827] border-[#1e293b] text-slate-300 hover:bg-[#161f32]'
                        }`}>
                            <input
                                type="radio"
                                name="resetOption"
                                value="cycles"
                                checked={resetTypeChoice === 'cycles'}
                                onChange={() => setResetTypeChoice('cycles')}
                                className="mt-0.5 text-amber-500 focus:ring-amber-500"
                            />
                            <div>
                                <span className="font-bold text-sm block text-amber-300">{t.resetOptCycles}</span>
                                <span className="text-xs text-slate-400">{t.resetOptCyclesSub}</span>
                            </div>
                        </label>

                        {/* Option 3: Errors only */}
                        <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            resetTypeChoice === 'errors' 
                                ? 'bg-rose-500/15 border-rose-500 text-white' 
                                : 'bg-[#111827] border-[#1e293b] text-slate-300 hover:bg-[#161f32]'
                        }`}>
                            <input
                                type="radio"
                                name="resetOption"
                                value="errors"
                                checked={resetTypeChoice === 'errors'}
                                onChange={() => setResetTypeChoice('errors')}
                                className="mt-0.5 text-rose-500 focus:ring-rose-500"
                            />
                            <div>
                                <span className="font-bold text-sm block text-rose-300">{t.resetOptErrors}</span>
                                <span className="text-xs text-slate-400">{t.resetOptErrorsSub}</span>
                            </div>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setResetTarget(null)}
                            className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => resetTarget && resetMutation.mutate({ units: resetTarget.units, type: resetTypeChoice })}
                            disabled={resetMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
                        >
                            {resetMutation.isPending ? t.resetting : t.confirmReset}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 2: Block Confirmation */}
            <Modal
                isOpen={!!blockTarget}
                onClose={() => setBlockTarget(null)}
                title={blockTarget?.block ? t.blockModalTitle : t.activateModalTitle}
                description={`Zmiana stanu aktywności dla: ${blockTarget?.units.join(', ')}`}
            >
                <div className="space-y-4">
                    <p className="text-sm text-slate-300">
                        {blockTarget?.block ? t.blockModalWarn : t.activateModalWarn}
                    </p>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setBlockTarget(null)}
                            className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => blockTarget && blockMutation.mutate(blockTarget)}
                            disabled={blockMutation.isPending}
                            className={`px-4 py-2 rounded-xl text-white text-sm font-bold shadow-lg transition-all cursor-pointer ${
                                blockTarget?.block ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                            }`}
                        >
                            {blockMutation.isPending ? t.saving : t.confirm}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 3: Delete Master */}
            <Modal
                isOpen={!!deleteTarget}
                onClose={() => setDeleteTarget(null)}
                title={t.deleteModalTitle}
                description={`Fizyczne usunięcie rekordu: ${deleteTarget?.unit}`}
            >
                <div className="space-y-4">
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-xs text-rose-300 flex items-start gap-3">
                        <AlertTriangle className="shrink-0 mt-0.5 text-rose-400" size={18} />
                        <div>
                            <p className="font-bold">{t.deleteModalWarning}</p>
                            <p className="mt-1">
                                Rekord <span className="font-mono font-bold text-white">{deleteTarget?.unit}</span> {t.deleteModalText}
                            </p>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setDeleteTarget(null)}
                            className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.unit)}
                            disabled={deleteMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                        >
                            {deleteMutation.isPending ? t.deleting : t.confirmDelete}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL 4: Unit History Log */}
            <Modal
                isOpen={!!historyTarget}
                onClose={() => setHistoryTarget(null)}
                title={`${t.historyModalTitle} ${historyTarget?.unit}`}
                description={t.historyModalSub}
                maxWidth="2xl"
            >
                <div className="space-y-4">
                    {historyLoading ? (
                        <div className="py-8 text-center text-slate-400 font-mono text-xs">
                            <RefreshCw className="animate-spin text-indigo-500 inline-block mr-2" size={18} />
                            Ładowanie historii zdarzeń...
                        </div>
                    ) : unitHistory.length === 0 ? (
                        <p className="text-center py-8 text-slate-500 text-sm">
                            {t.historyNoRecords} {historyTarget?.unit}.
                        </p>
                    ) : (
                        <div className="overflow-x-auto max-h-[50vh]">
                            <table className="w-full text-left text-xs font-mono border-collapse">
                                <thead>
                                    <tr className="bg-[#111827] text-slate-400 border-b border-[#1e293b]">
                                        <th className="py-2.5 px-3">{t.thDate}</th>
                                        <th className="py-2.5 px-3">{t.thOperation}</th>
                                        <th className="py-2.5 px-3">{t.thStatus}</th>
                                        <th className="py-2.5 px-3">{t.thCycles}</th>
                                        <th className="py-2.5 px-3">{t.thErrors}</th>
                                        <th className="py-2.5 px-3">{t.thOperator}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#1e293b]/50 text-slate-300">
                                    {unitHistory.map((h: HistoryRecord) => (
                                        <tr key={h.id} className="hover:bg-[#161f32]">
                                            <td className="py-2 px-3 text-slate-400">{h.date}</td>
                                            <td className="py-2 px-3 font-bold">
                                                <Badge 
                                                    variant={
                                                        h.operation === 'Create' ? 'success' :
                                                        h.operation.includes('Reset') ? 'warning' :
                                                        h.operation === 'Block' ? 'danger' :
                                                        h.operation === 'Delete' ? 'danger' : 'info'
                                                    }
                                                >
                                                    {h.operation}
                                                </Badge>
                                            </td>
                                            <td className="py-2 px-3">{h.status}</td>
                                            <td className="py-2 px-3">{h.currentCounter} / {h.maxCounter}</td>
                                            <td className="py-2 px-3">{h.errorCounter} / {h.errorMaxCounter}</td>
                                            <td className="py-2 px-3 text-slate-400">{h.user}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="flex justify-between items-center pt-2">
                        {historyTarget && (
                            <a
                                href={getFisUnitHistoryUrl(historyTarget.unit, historyTarget.FIS)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="interactive-button text-xs font-semibold inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 hover:text-white hover:bg-indigo-600/30"
                            >
                                <span>Otwórz w FIS ({String(historyTarget.FIS || '').includes('2') ? 'FIS 2' : 'FIS 1'}) ↗</span>
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={() => setHistoryTarget(null)}
                            className="px-4 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm font-semibold transition-colors cursor-pointer"
                        >
                            {t.close}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
