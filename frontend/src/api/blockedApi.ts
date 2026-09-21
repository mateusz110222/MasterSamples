import { apiRequest, API_BASE } from './client';
import { BlockedMachine, ApiResponse } from '../types';

export const blockedApi = {
    getBlockedMachines: async (): Promise<BlockedMachine[]> => {
        const res = await apiRequest<BlockedMachine[]>(API_BASE, { job: 'GetBlockedMachines' });
        return res.data || [];
    },

    deleteBlockedMachine: async (filename: string): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'DeleteBlockedMachine', filename }, { method: 'POST' });
    }
};
