import { useState, useMemo } from 'react';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { blockedApi } from '../api/blockedApi';
import type { BlockedMachine, FisTarget } from '../types';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { getLocalizedErrorMessage } from '../lib/errors';
import { invalidateAndBroadcast } from '../lib/queryCache';
const fisTargets: FisTarget[] = ['FIS1', 'FIS2'];
export const useBlockedMachines = () => {
    const { canEdit } = useAuth();
    const { t, language } = useLanguage();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [deleteTarget, setDeleteTarget] = useState<BlockedMachine | null>(null);
    const [actionError, setActionError] = useState<unknown>(null);

    const machineQueries = useQueries({
        queries: fisTargets.map(fis => ({
            queryKey: ['blockedMachines', fis],
            queryFn: () => blockedApi.getBlockedMachines(fis),
            refetchInterval: 30000,
        })),
    });
    const machines = machineQueries.flatMap(query => query.data ?? []);
    const isLoading = machineQueries.every(query => query.isPending);
    const isFetching = machineQueries.some(query => query.isFetching);
    const machinesError = machineQueries.map((query, index) => query.error
        ? `${fisTargets[index]}: ${getLocalizedErrorMessage(query.error, language, t.blocksLoadError)}`
        : '').filter(Boolean).join(' · ');
    const refetch = () => Promise.all(machineQueries.map(query => query.refetch()));

    const deleteMutation = useMutation({
        mutationFn: (machine: BlockedMachine) => blockedApi.deleteBlockedMachine(machine.filename, machine.FIS),
        onMutate: () => setActionError(null),
        onSuccess: () => {
            void invalidateAndBroadcast(queryClient, [['blockedMachines'], ['history']]);
            setDeleteTarget(null);
        },
        onError: (error: unknown) => setActionError(error),
    });

    const filteredMachines = useMemo(() => {
        if (!searchTerm) return machines;
        const s = searchTerm.toLowerCase();
        return machines.filter(m =>
            m.machine.toLowerCase().includes(s) ||
            m.prefix.toLowerCase().includes(s) ||
            m.filename.toLowerCase().includes(s) ||
            m.FIS.toLowerCase().includes(s)
        );
    }, [machines, searchTerm]);


    const errorMessage = actionError ? getLocalizedErrorMessage(actionError, language, t.actionError) : machinesError || null;
    const dismissError = () => setActionError(null);
    const confirmUnblock = () => { if (deleteTarget && canEdit) deleteMutation.mutate(deleteTarget); };
    return {
        confirmUnblock, errorMessage, dismissError, machines, isLoading,
        isFetching, machinesError, refetch, deleteMutation, filteredMachines,
        searchTerm, setSearchTerm, deleteTarget, setDeleteTarget, actionError,
        canEdit, t,
    };
};
