import { apiRequest, API_BASE } from './client';
import { Engineer, MailItem, ApiResponse } from '../types';

export const engineerApi = {
    getEngineers: async (): Promise<Engineer[]> => {
        const res = await apiRequest<Engineer[]>(API_BASE, { job: 'GetEngineers' });
        return res.data || [];
    },

    updateEngineerMail: async (process: string, mail: string): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'UpdateEngineerMail', process, mail }, { method: 'POST' });
    },

    addEngineer: async (process: string, mail: string): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'AddEngineer' }, {
            method: 'POST',
            body: JSON.stringify({ process, mail })
        });
    },

    deleteEngineer: async (id: number): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'DeleteEngineer', id }, { method: 'POST' });
    },

    // Standalone mails directory (masterSample.mails table)
    getMails: async (): Promise<MailItem[]> => {
        const res = await apiRequest<MailItem[]>(API_BASE, { job: 'GetMails' });
        return res.data || [];
    },

    addMail: async (name: string, mail: string): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'AddMail' }, {
            method: 'POST',
            body: JSON.stringify({ name, mail })
        });
    },

    updateMail: async (id: number, name: string, mail: string): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'UpdateMail' }, {
            method: 'POST',
            body: JSON.stringify({ id, name, mail })
        });
    },

    deleteMail: async (id: number): Promise<ApiResponse<any>> => {
        return apiRequest(API_BASE, { job: 'DeleteMail', id }, { method: 'POST' });
    }
};
