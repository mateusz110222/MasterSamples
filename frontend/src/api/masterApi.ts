import { apiRequest, API_BASE, getSessionUser } from './client.ts';
import type { MasterUnit, HistoryRecord, ApiResponse, ResetType } from '../types';

export type FisTarget = 'FIS1' | 'FIS2';

const CREATE_MASTER_PATH = '/custom/matz/php/MasterDashboard.php';

export function getCreateMasterUrl(fis: FisTarget): string {
    const hostNumber = fis === 'FIS2' ? '2' : '1';
    return `http://plblofis${hostNumber}.global.borgwarner.net${CREATE_MASTER_PATH}`;
}

export function normalizeFisTarget(fis: unknown): FisTarget {
    return String(fis ?? '').trim().toUpperCase() === 'FIS2' ? 'FIS2' : 'FIS1';
}

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
    fis: FisTarget;
    forceUpdate?: boolean;
    user?: string;
    userName?: string;
    userGroups?: string[];
}

export interface CreateMasterResult {
    exists?: boolean;
    oldData?: Partial<MasterUnit>;
    newData?: Partial<MasterUnit>;
    unit?: string;
    operation?: string;
}

export interface DeleteMasterOptions {
    fisOnly?: boolean;
}

export const masterApi = {
    getMasters: async (filters: GetMastersFilters = {}): Promise<MasterUnit[]> => {
        const res = await apiRequest<MasterUnit[]>(API_BASE, { job: 'GetMasters', ...filters });
        return res.data || [];
    },

    createMaster: async (payload: CreateMasterPayload): Promise<ApiResponse<CreateMasterResult>> => {
        const session = getSessionUser();
        const bodyPayload = {
            ...payload,
            user: payload.user || session.uid || undefined,
            userName: payload.userName || session.name || undefined,
            userGroups: payload.userGroups || (session.groups.length > 0 ? session.groups : undefined),
        };
        return apiRequest(getCreateMasterUrl(payload.fis), { job: 'CreateMaster' }, {
            method: 'POST',
            body: JSON.stringify(bodyPayload)
        });
    },

    resetCounters: async (units: string | string[], resetType: ResetType = 'all'): Promise<ApiResponse<{ count: number; resetType: ResetType }>> => {
        const unitParam = Array.isArray(units) ? units.join(',') : units;
        return apiRequest(API_BASE, { job: 'ResetCounters' }, {
            method: 'POST',
            body: JSON.stringify({ units: unitParam, resetType }),
        });
    },

    blockMaster: async (units: string | string[]): Promise<ApiResponse> => {
        const unitParam = Array.isArray(units) ? units.join(',') : units;
        return apiRequest(API_BASE, { job: 'BlockMaster' }, {
            method: 'POST',
            body: JSON.stringify({ units: unitParam }),
        });
    },

    activateMaster: async (unit: string): Promise<ApiResponse> => {
        return apiRequest(API_BASE, { job: 'ActivateMaster' }, {
            method: 'POST',
            body: JSON.stringify({ unit }),
        });
    },

    deleteMaster: async (
        unit: string,
        fis: FisTarget,
        options?: DeleteMasterOptions,
    ): Promise<ApiResponse<{ affected_rows?: number; fis_deleted: boolean; fis_only?: boolean }>> => {
        const session = getSessionUser();
        const payload: Record<string, unknown> = {
            unit,
            fis,
            user: session.uid || undefined,
            userName: session.name || undefined,
            userGroups: session.groups.length > 0 ? session.groups : undefined,
        };
        if (options?.fisOnly) {
            payload.fisOnly = true;
        }
        return apiRequest(getCreateMasterUrl(fis), { job: 'DeleteMaster' }, {
            method: 'POST',
            body: JSON.stringify(payload),
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
    } = {}): Promise<{ records: HistoryRecord[]; total: number }> => {
        const res = await apiRequest<HistoryRecord[] | { records: HistoryRecord[]; total: number }>(API_BASE, { job: 'GetHistory', includeTotal: true, ...filters });
        if (Array.isArray(res.data)) {
            return { records: res.data, total: (filters.offset ?? 0) + res.data.length };
        }
        return { records: res.data?.records ?? [], total: res.data?.total ?? 0 };
    }
};
