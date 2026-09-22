import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterApi, normalizeFisTarget } from '../api/masterApi';
import type { MasterUnit, ResetType } from '../types';

interface MasterActionCallbacks {
    onResetSuccess: () => void;
    onBlockSuccess: () => void;
    onDeleteSuccess: () => void;
    onMutate: () => void;
    onError: (error: unknown) => void;
}

export const useMastersQuery = () => useQuery({
    queryKey: ['masters'],
    queryFn: () => masterApi.getMasters(),
    refetchInterval: 30_000,
});

export const useMasterHistoryQuery = (unit?: string) => useQuery({
    queryKey: ['unitHistory', unit],
    queryFn: () => unit ? masterApi.getMasterHistory(unit) : Promise.resolve([]),
    enabled: Boolean(unit),
});

export const useMasterActions = (callbacks: MasterActionCallbacks) => {
    const queryClient = useQueryClient();
    const refreshMasters = () => queryClient.invalidateQueries({ queryKey: ['masters'] });

    const resetMutation = useMutation({
        mutationFn: ({ units, type }: { units: string[]; type: ResetType }) => masterApi.resetCounters(units, type),
        onMutate: callbacks.onMutate,
        onSuccess: async () => {
            await refreshMasters();
            callbacks.onResetSuccess();
        },
        onError: callbacks.onError,
    });

    const blockMutation = useMutation({
        mutationFn: ({ units, block }: { units: string[]; block: boolean }) =>
            block ? masterApi.blockMaster(units) : masterApi.activateMaster(units[0]),
        onMutate: callbacks.onMutate,
        onSuccess: async () => {
            await refreshMasters();
            callbacks.onBlockSuccess();
        },
        onError: callbacks.onError,
    });

    const deleteMutation = useMutation({
        mutationFn: (master: MasterUnit) => masterApi.deleteMaster(master.unit, normalizeFisTarget(master.FIS)),
        onMutate: callbacks.onMutate,
        onSuccess: async () => {
            await refreshMasters();
            callbacks.onDeleteSuccess();
        },
        onError: callbacks.onError,
    });

    return { resetMutation, blockMutation, deleteMutation };
};
