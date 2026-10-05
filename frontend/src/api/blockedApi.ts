import { apiRequest } from './client.ts';
import { getCreateMasterUrl } from './masterApi.ts';
import type { BlockedMachine, ApiResponse, FisTarget } from '../types';

export const blockedApi = {
    getBlockedMachines: async (fis: FisTarget = 'FIS1'): Promise<BlockedMachine[]> => {
        const res = await apiRequest<Omit<BlockedMachine, 'FIS'>[]>(getCreateMasterUrl(fis), { job: 'GetBlockedMachines' });
        return (res.data || []).map(machine => ({ ...machine, FIS: fis }));
    },

    deleteBlockedMachine: async (filename: string, fis: FisTarget): Promise<ApiResponse> => {
        return apiRequest(getCreateMasterUrl(fis), { job: 'DeleteBlockedMachine' }, {
            method: 'POST',
            body: JSON.stringify({ filename }),
        });
    }
};
