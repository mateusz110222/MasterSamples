import { getErrorMessage } from '../lib/errors';
import { getFisUnitHistoryUrl } from '../api/fisApi';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { masterApi } from '../api/masterApi';
import { type BadgeVariant } from '../components/common/Badge';
import { useDebouncedValue } from './useDebouncedValue.ts';
import { useLanguage } from '../i18n/useLanguage';
import { parsePaginationParams } from '../lib/masterUtils';
import { useAdaptiveTableColumns } from './useAdaptiveTableColumns.ts';
const stationOperations = new Set(['UnlockStation', 'DisableStationBlocking', 'EnableStationBlocking', 'DeleteStationBlockingRule']);
export const useHistory = () => {
    const { language, t } = useLanguage();
    const [searchParams, setSearchParams] = useSearchParams();

    // Filters derived from searchParams as single source of truth
    const urlUnit = searchParams.get('unit') ?? '';
    const urlProcess = searchParams.get('process') ?? '';
    const urlUser = searchParams.get('user') ?? '';

    const [unitFilter, setUnitFilter] = useState(urlUnit);
    const [processFilter, setProcessFilter] = useState(urlProcess);
    const [userFilter, setUserFilter] = useState(urlUser);

    const operationFilter = searchParams.get('operation') ?? '';
    const statusFilter = searchParams.get('status') ?? '';
    const dateFrom = searchParams.get('dateFrom') ?? '';
    const dateTo = searchParams.get('dateTo') ?? '';
    const { page, pageSize } = parsePaginationParams(searchParams);

    // Synchronize local input filters when searchParams changes externally
    useEffect(() => {
        if (urlUnit !== unitFilter) setUnitFilter(urlUnit);
    }, [urlUnit]);
    useEffect(() => {
        if (urlProcess !== processFilter) setProcessFilter(urlProcess);
    }, [urlProcess]);
    useEffect(() => {
        if (urlUser !== userFilter) setUserFilter(urlUser);
    }, [urlUser]);

    const updateFilters = (updates: Record<string, string | number | null | undefined>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, val]) => {
                if (
                    val === undefined ||
                    val === null ||
                    val === '' ||
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

    const debouncedUnitFilter = useDebouncedValue(unitFilter);
    const debouncedUserFilter = useDebouncedValue(userFilter);
    const debouncedProcessFilter = useDebouncedValue(processFilter);

    // Debounce text inputs sync to searchParams
    useEffect(() => {
        if (debouncedUnitFilter !== (searchParams.get('unit') ?? '')) {
            updateFilters({ unit: debouncedUnitFilter, page: 1 });
        }
    }, [debouncedUnitFilter]);

    useEffect(() => {
        if (debouncedProcessFilter !== (searchParams.get('process') ?? '')) {
            updateFilters({ process: debouncedProcessFilter, page: 1 });
        }
    }, [debouncedProcessFilter]);

    useEffect(() => {
        if (debouncedUserFilter !== (searchParams.get('user') ?? '')) {
            updateFilters({ user: debouncedUserFilter, page: 1 });
        }
    }, [debouncedUserFilter]);

    const filtersKey = JSON.stringify([debouncedUnitFilter, operationFilter, debouncedUserFilter, debouncedProcessFilter, statusFilter, dateFrom, dateTo, pageSize]);
    const tableScrollRef = useRef<HTMLTableSectionElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const paginationRef = useRef<HTMLDivElement>(null);
    const pendingPageRef = useRef<number | null>(null);

    useEffect(() => {
        tableScrollRef.current?.scrollTo({ top: 0 });
    }, [filtersKey]);

    const { data: historyPage, isLoading, isFetching, refetch, error } = useQuery({
        queryKey: ['history', filtersKey, page],
        placeholderData: (previousData, previousQuery) =>
            previousQuery?.queryKey[1] === filtersKey ? previousData : undefined,
        queryFn: () => masterApi.getHistory({
            unit: debouncedUnitFilter,
            operation: operationFilter,
            user: debouncedUserFilter,
            process: debouncedProcessFilter,
            status: statusFilter,
            dateFrom,
            dateTo,
            limit: Math.min(pageSize + 1, 500),
            offset: (page - 1) * pageSize,
        }),
    });

    const historyRecords = historyPage?.records ?? [];
    const visibleRecords = historyRecords.slice(0, pageSize);
    const totalItems = historyPage?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    useAdaptiveTableColumns(tableRef, historyRecords, 9, 3, language);
    useLayoutEffect(() => {
        if (!isFetching && pendingPageRef.current === page) {
            paginationRef.current?.scrollIntoView({ block: 'nearest' });
            pendingPageRef.current = null;
        }
    }, [page, isFetching, historyPage]);
    const handlePageChange = (nextPage: number) => {
        pendingPageRef.current = nextPage;
        updateFilters({ page: nextPage });
        tableScrollRef.current?.scrollTo({ top: 0 });
    };

    const getOperationBadgeVariant = (op: string): BadgeVariant => {
        switch (op.toLowerCase()) {
            case 'create':
                return 'success';
            case 'update':
                return 'info';
            case 'reset':
            case 'resetcycles':
            case 'reseterrors':
                return 'warning';
            case 'block':
            case 'delete':
                return 'danger';
            case 'activate':
                return 'purple';
            case 'unlockstation':
            case 'enablestationblocking':
                return 'success';
            case 'disablestationblocking':
            case 'deletestationblockingrule':
                return 'warning';
            default:
                return 'neutral';
        }
    };

    const getOperationLabel = (op: string): string => {
        switch (op.toLowerCase()) {
            case 'create':
                return t.opCreate;
            case 'update':
                return t.opUpdate;
            case 'reset':
                return t.opReset;
            case 'resetcycles':
                return t.opResetCycles;
            case 'reseterrors':
                return t.opResetErrors;
            case 'block':
                return t.opBlock;
            case 'activate':
                return t.opActivate;
            case 'unlockstation':
                return t.opUnlockStation;
            case 'disablestationblocking':
                return t.opDisableStationBlocking;
            case 'enablestationblocking':
                return t.opEnableStationBlocking;
            case 'deletestationblockingrule':
                return t.opDeleteStationBlockingRule;
            case 'delete':
                return t.opDelete;
            default:
                return op;
        }
    };

    const clearFilters = () => {
        setUnitFilter('');
        setProcessFilter('');
        setUserFilter('');
        setSearchParams({}, { replace: true });
    };

    const hasActiveFilters = Boolean(unitFilter || operationFilter || userFilter || processFilter || statusFilter || dateFrom || dateTo);




    const errorMessage = error ? (language === 'PL' ? getErrorMessage(error, t.historyLoadError) : t.historyLoadError) : null;
    const historyRows = visibleRecords.map(rec => {
        const isStationOperation = stationOperations.has(rec.operation);
        return { ...rec, isStationOperation,
            isBlockingPolicyChange: ['ENABLED', 'DISABLED', 'INHERIT'].includes(rec.status ?? ''),
            statusLabel: rec.status === 'DISABLED' ? t.stationRuleDisabled : rec.status === 'ENABLED' ? t.stationRuleEnabled : t.stationRuleInherit,
            dashboardUrl: isStationOperation ? rec.operation === 'UnlockStation' ? '/blocked-machines' : '/admin/station-blocking' : '/?search=' + encodeURIComponent(rec.unit),
            dashboardLinkTitle: isStationOperation ? getOperationLabel(rec.operation) : t.historyDashboardLink.replace('{unit}', rec.unit),
            fisHistoryUrl: !isStationOperation && rec.FIS && ['FIS1', 'FIS2', '1', '2'].includes(rec.FIS.trim().toUpperCase()) ? getFisUnitHistoryUrl(rec.unit, rec.FIS) : null,
            operationLabel: getOperationLabel(rec.operation), operationBadgeVariant: getOperationBadgeVariant(rec.operation),
            processLabel: rec.process === 'BLOCKING_POLICY:prefix' ? t.stationRulePrefix : rec.process === 'BLOCKING_POLICY:single' || rec.process === 'BLOCKING_POLICY' ? t.stationRuleSingle : rec.process === 'BLOCKING_POLICY:fis' ? t.stationFisScope : rec.process,
        };
    });
    const clearUnit = () => { setUnitFilter(''); updateFilters({ unit: '', page: 1 }); };
    const clearProcess = () => { setProcessFilter(''); updateFilters({ process: '', page: 1 }); };
    const clearUser = () => { setUserFilter(''); updateFilters({ user: '', page: 1 }); };

    const changeOperation = (value: string) => updateFilters({ operation: value, page: 1 });
    const changeStatus = (value: string) => updateFilters({ status: value, page: 1 });
    const changeDateFrom = (value: string) => updateFilters({ dateFrom: value, page: 1 });
    const changeDateTo = (value: string) => updateFilters({ dateTo: value, page: 1 });
    const changePageSize = (value: string) => updateFilters({ pageSize: Number(value), page: 1 });

    return {
        changeOperation, changeStatus, changeDateFrom, changeDateTo, changePageSize,
        hasError: Boolean(error), errorMessage, historyRows, clearUnit, clearProcess,
        clearUser, operationFilter, statusFilter, dateFrom, dateTo,
        tableScrollRef, tableRef, paginationRef, visibleRecords, totalItems,
        totalPages, handlePageChange, clearFilters, hasActiveFilters, unitFilter,
        setUnitFilter, processFilter, setProcessFilter, userFilter, setUserFilter,
        t, page, pageSize, isLoading, isFetching,
        refetch,
    };
};
