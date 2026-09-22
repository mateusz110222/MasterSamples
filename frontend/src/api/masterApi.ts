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
    fis?: 'FIS1' | 'FIS2';
    forceUpdate?: boolean;
}

export interface CreateMasterResult {
    exists?: boolean;
    oldData?: Partial<MasterUnit>;
    newData?: Partial<MasterUnit>;
    unit?: string;
    operation?: string;
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

    createMaster: async (payload: CreateMasterPayload, apiUrl?: string): Promise<ApiResponse<CreateMasterResult>> => {
        return apiRequest(apiUrl ?? API_BASE, { job: 'CreateMaster' }, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    resetCounters: async (units: string | string[], resetType: ResetType = 'all'): Promise<ApiResponse<{ count: number; resetType: ResetType }>> => {
        const unitParam = Array.isArray(units) ? units.join(',') : units;
        return apiRequest(API_BASE, { job: 'ResetCounters' }, {
            method: 'POST',
            body: JSON.stringify({ units: unitParam, resetType }),
        });
    },

    blockMaster: async (units: string | string[]): Promise<ApiResponse<unknown>> => {
        const unitParam = Array.isArray(units) ? units.join(',') : units;
        return apiRequest(API_BASE, { job: 'BlockMaster' }, {
            method: 'POST',
            body: JSON.stringify({ units: unitParam }),
        });
    },

    activateMaster: async (unit: string): Promise<ApiResponse<unknown>> => {
        return apiRequest(API_BASE, { job: 'ActivateMaster' }, {
            method: 'POST',
            body: JSON.stringify({ unit }),
        });
    },

    deleteMaster: async (unit: string): Promise<ApiResponse<{ affected_rows: number }>> => {
        return apiRequest(API_BASE, { job: 'DeleteMaster' }, {
            method: 'POST',
            body: JSON.stringify({ unit }),
        });
    },

    getMasterHistory: async (unit: string): Promise<HistoryRecord[]> => {
        const res = await apiRequest<HistoryRecord[]>(API_BASE, { job: 'GetMasterHistory', unit });
        return res.data || [];
    },

    getHistory: async (filters: {
        unit?: string;
        operation?: string;
        user?: string;
        process?: string;
        status?: string;
        dateFrom?: string;
        dateTo?: string;
        limit?: number;
        offset?: number;
    } = {}): Promise<HistoryRecord[]> => {
        const res = await apiRequest<HistoryRecord[]>(API_BASE, { job: 'GetHistory', ...filters });
        return res.data || [];
    }
};
