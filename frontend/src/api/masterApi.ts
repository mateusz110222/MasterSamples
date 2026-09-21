import { apiRequest, API_BASE } from './client';
import { MasterUnit, HistoryRecord, ApiResponse, ResetType } from '../types';

export interface GetMastersFilters {
    status?: string;
    process?: string;
    isactive?: number;
    search?: string;
}

export interface CreateMasterPayload {
    unit: string;
    process: string;
    status: 'GOOD' | 'BAD';
    maxCounter: number;
    maxErrors: number;
    user: string;
    forceUpdate?: boolean;
}

export const masterApi = {
    getMasters: async (filters: GetMastersFilters = {}): Promise<MasterUnit[]> => {
        const res = await apiRequest<MasterUnit[]>(API_BASE, { job: 'GetMasters', ...filters });
        return res.data || [];
    },

    checkMaster: async (unit: string): Promise<{ exists: boolean; unit: MasterUnit | null }> => {
        const res = await apiRequest<{ exists: boolean; unit: MasterUnit | null }>(API_BASE, { job: 'CheckMaster', unit });
        return res.data;
    },

    createMaster: async (payload: CreateMasterPayload): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'CreateMaster' }, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    resetCounters: async (units: string | string[], resetType: ResetType = 'all', user: string): Promise<ApiResponse<any>> => {
        const unitParam = Array.isArray(units) ? units.join(',') : units;
        return apiRequest(API_BASE, { job: 'ResetCounters', units: unitParam, resetType, user }, { method: 'POST' });
    },

    blockMaster: async (units: string | string[], user: string): Promise<ApiResponse<any>> => {
        const unitParam = Array.isArray(units) ? units.join(',') : units;
        return apiRequest(API_BASE, { job: 'BlockMaster', units: unitParam, user }, { method: 'POST' });
    },

    activateMaster: async (unit: string, user: string): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'ActivateMaster', unit, user }, { method: 'POST' });
    },

    deleteMaster: async (unit: string, user: string): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'DeleteMaster', unit, user }, { method: 'POST' });
    },

    getMasterHistory: async (unit: string): Promise<HistoryRecord[]> => {
        const res = await apiRequest<HistoryRecord[]>(API_BASE, { job: 'GetMasterHistory', unit });
        return res.data || [];
    },

    getHistory: async (filters: { unit?: string; operation?: string; user?: string; limit?: number; offset?: number } = {}): Promise<HistoryRecord[]> => {
        const res = await apiRequest<HistoryRecord[]>(API_BASE, { job: 'GetHistory', ...filters });
        return res.data || [];
    }
};
