import { getLocalizedErrorMessage } from '../lib/errors';
import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { MasterUnit, ResetType } from '../types';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { useMasterActions, useMasterHistoryQuery, useMastersQuery } from './useMasters.ts';
import { useDebouncedValue } from './useDebouncedValue.ts';
import { buildMastersCsv, downloadTextFile, filterMasters, getActivePercentage, matchesCurrentUser, parsePaginationParams, sortMasters, splitProcesses, type MasterSortField, type SortDirection, type TaskPreset } from '../lib/masterUtils';
import { useAdaptiveTableColumns } from './useAdaptiveTableColumns.ts';

export const useDashboard = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { canEdit, user } = useAuth();
    const { language, t } = useLanguage();
    const isPl = language === 'PL';

    // Filters derived from searchParams as single source of truth
    const urlSearch = searchParams.get('search') ?? searchParams.get('unit') ?? '';
    const [searchTerm, setSearchTerm] = useState(urlSearch);
    const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

    const selectedProcess = searchParams.get('process') ?? '';
    const selectedStatus = searchParams.get('status') ?? '';
    const selectedActive = searchParams.get('active') ?? 'all';
    const taskPreset = (searchParams.get('preset') as TaskPreset) || 'all';
    const { page: currentPage, pageSize } = parsePaginationParams(searchParams);

    // Synchronize local searchTerm when searchParams changes externally (e.g. navigation, back/forward)
    useEffect(() => {
        if (urlSearch !== searchTerm) {
            setSearchTerm(urlSearch);
        }
    }, [urlSearch]);

    // Helper to update any filter in searchParams
    const updateFilters = (updates: Record<string, string | number | null | undefined>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);

            if ('search' in updates) {
                next.delete('unit');
            }

            Object.entries(updates).forEach(([key, val]) => {
                if (
                    val === undefined ||
                    val === null ||
                    val === '' ||
                    val === 'all' ||
                    (key === 'page' && Number(val) <= 1) ||
                    (key === 'pageSize' && Number(val) === 50)
                ) {
                    next.delete(key);
                } else {
                    next.set(key, String(val));
                }
            });

            return next;
        }, { replace: true });
    };

    // Debounce search input sync to searchParams
    useEffect(() => {
        const currentSearchInUrl = searchParams.get('search') ?? searchParams.get('unit') ?? '';
        if (debouncedSearchTerm !== currentSearchInUrl) {
            updateFilters({ search: debouncedSearchTerm, page: 1 });
        }
    }, [debouncedSearchTerm]);

    // Interactive column sorting
    const [sortField, setSortField] = useState<MasterSortField>('unit');
    const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

    const tableCardRef = useRef<HTMLDivElement>(null);
    const tableBodyRef = useRef<HTMLTableSectionElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);

    // Modals
    const [resetTarget, setResetTarget] = useState<{ units: string[]; unitNames: string } | null>(null);
    const [resetTypeChoice, setResetTypeChoice] = useState<ResetType>('all');
    const [blockTarget, setBlockTarget] = useState<{ units: string[]; block: boolean } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<MasterUnit | null>(null);
    const [editTarget, setEditTarget] = useState<MasterUnit | null>(null);
    const [historyTarget, setHistoryTarget] = useState<MasterUnit | null>(null);
    const [actionError, setActionError] = useState<unknown>(null);

    // Queries
    const { data: masters = [], isLoading, isFetching, refetch, error: mastersError } = useMastersQuery();

    const { data: unitHistory = [], isLoading: historyLoading, isFetching: historyFetching, error: historyError, refetch: refetchHistory } = useMasterHistoryQuery(historyTarget?.unit);

    const { resetMutation, blockMutation, deleteMutation } = useMasterActions({
        onMutate: () => setActionError(null),
        onError: (error: unknown) => setActionError(error),
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
            process: searchParams.get('process') ?? '',
            status: searchParams.get('status') ?? '',
            activity: searchParams.get('active') ?? 'all',
            taskPreset: (searchParams.get('preset') as TaskPreset) || 'all',
            currentUser: user?.uid,
            currentUserName: user?.name,
        });
    }, [masters, searchParams, searchTerm, user?.uid, user?.name]);

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
    useAdaptiveTableColumns(tableRef, displayedMasters, 9, 1, language);

    const handlePageChange = (nextPage: number) => {
        if (nextPage === safeCurrentPage) return;
        tableBodyRef.current?.scrollTo({ top: 0 });
        updateFilters({ page: nextPage });
        tableCardRef.current?.scrollIntoView({ block: 'start' });
    };

    const selectTaskPreset = (preset: TaskPreset) => {
        const nextPreset = taskPreset === preset && preset !== 'all' ? 'all' : preset;
        updateFilters({ preset: nextPreset, page: 1 });
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
        setSearchParams({}, { replace: true });
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


    const errorMessage = actionError ? getLocalizedErrorMessage(actionError, language, t.actionError) : mastersError ? getLocalizedErrorMessage(mastersError, language, t.mastersLoadError) : null;
    const dismissError = () => setActionError(null);
    const historyErrorMessage = historyError ? getLocalizedErrorMessage(historyError, language, t.historyLoadError) : null;
    const dashboardRows = displayedMasters.map(m => {
        const maxC = m.maxCounter || 1000;
        const currC = m.currentCounter || 0;
        const maxE = m.errorMaxCounter || 50;
        const currE = m.errorCounter || 0;
        return { m, maxC, currC, maxE, currE,
            isDead: m.isactive === 2,
            usagePercent: Math.min(100, Math.round((currC / maxC) * 100)),
            isLimitExceeded: maxC > 0 && currC >= maxC,
            errorPercent: Math.min(100, Math.round((currE / maxE) * 100)),
            isErrorExceeded: maxE > 0 && currE >= maxE,
        };
    });
    const prepareReset = (master: MasterUnit) => {
        setResetTypeChoice('all');
        setResetTarget({ units: [master.unit], unitNames: master.unit });
    };
    const clearSearch = () => { setSearchTerm(''); updateFilters({ search: '', page: 1 }); };
    const createMaster = () => navigate('/create');

    const changeProcess = (value: string) => updateFilters({ process: value, page: 1 });
    const changeStatus = (value: string) => updateFilters({ status: value, page: 1 });
    const changeActivity = (value: string) => updateFilters({ active: value, page: 1 });
    const changePageSize = (value: string) => updateFilters({ pageSize: Number(value), page: 1 });
    const prepareBlock = (master: MasterUnit, block: boolean) => setBlockTarget({ units: [master.unit], block });

    return {
        changeProcess, changeStatus, changeActivity, changePageSize, prepareBlock,
        historyErrorMessage, dashboardRows, prepareReset, clearSearch, createMaster,
        errorMessage, dismissError, isPl, selectedProcess, selectedStatus,
        selectedActive, taskPreset, tableCardRef, tableBodyRef, tableRef,
        stats, presetCounts, processOptions, totalItems, totalPages,
        safeCurrentPage, handlePageChange, selectTaskPreset, handleSort, clearFilters,
        exportCsv, searchTerm, setSearchTerm, sortField, sortDirection,
        resetTarget, setResetTarget, resetTypeChoice, setResetTypeChoice, blockTarget,
        setBlockTarget, deleteTarget, setDeleteTarget, editTarget, setEditTarget,
        historyTarget, setHistoryTarget, actionError, canEdit, user,
        t, pageSize, isLoading, isFetching, refetch,
        unitHistory, historyLoading, historyFetching, refetchHistory, resetMutation,
        blockMutation, deleteMutation,
    };
};
