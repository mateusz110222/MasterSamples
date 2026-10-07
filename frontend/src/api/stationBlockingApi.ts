import { apiRequest } from './client.ts';
import { getCreateMasterUrl } from './masterApi.ts';
import type { FisTarget } from '../types';

export type StationRuleMode = 'single' | 'prefix';
export interface StationBlockingRule { station: string; mode: StationRuleMode; FIS: FisTarget; user: string; date: string }

export const stationBlockingApi = {
    list: async (fis: FisTarget): Promise<StationBlockingRule[]> => {
        const response = await apiRequest<StationBlockingRule[]>(getCreateMasterUrl(fis), { job: 'GetStationBlockingRules', fis });
        return response.data ?? [];
    },
    set: (station: string, fis: FisTarget, mode: StationRuleMode = 'single') => apiRequest(getCreateMasterUrl(fis), { job: 'SetStationBlocking' }, {
        method: 'POST', body: JSON.stringify({ station, fis, mode }),
    }),
    remove: (station: string, fis: FisTarget, mode: StationRuleMode) => apiRequest(getCreateMasterUrl(fis), { job: 'DeleteStationBlockingRule' }, {
        method: 'POST', body: JSON.stringify({ station, fis, mode }),
    }),
};
