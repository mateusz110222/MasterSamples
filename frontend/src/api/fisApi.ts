import { apiRequest, ROUTER_API_BASE, AUTH_API_BASE, API_BASE, setSessionUser } from './client';
import { UserInfo, ProcessTagItem } from '../types';

interface UserInfoPayload {
    userId?: string;
    name?: string;
    email?: string;
    groups?: unknown;
    canEdit?: unknown;
}

const normalizeProcessTag = (item: unknown): ProcessTagItem => {
    if (typeof item === 'object' && item !== null) {
        const r = item as Record<string, unknown>;
        const key = String(r.key ?? r.name ?? r.tag ?? '');
        return { key, description: String(r.description ?? key) };
    }
    const val = String(item ?? '');
    return { key: val, description: val };
};

export const ALLOWED_GROUPS = [
    'admin_group',
    'support_group',
    'fisadmin_group',
    'testeng',
    'proceng',
    'golden_samples',
];

export const FIS1_HOST = 'plblofis1.global.borgwarner.net';
export const FIS2_HOST = 'plblofis2.global.borgwarner.net';

/**
 * Returns the full Unit History URL for a given master unit.
 * Uses plblofis2.global.borgwarner.net if FIS is 2, otherwise plblofis1.global.borgwarner.net.
 */
export function getFisUnitHistoryUrl(unit: string, fis?: string | number): string {
    const fisStr = String(fis ?? '').trim().toLowerCase();
    const isFis2 = fisStr.includes('2');
    const host = isFis2 ? FIS2_HOST : FIS1_HOST;
    return `http://${host}/std_public/unithistory?unit=${encodeURIComponent(unit)}`;
}

export const fisApi = {
    getProcessTags: async (): Promise<ProcessTagItem[]> => {
        const res = await apiRequest<unknown>(ROUTER_API_BASE, { job: 'GetProcessTags' });
        const list = Array.isArray(res.data) ? res.data : [];
        return list.map(normalizeProcessTag).filter(item => item.key !== '');
    },

    getCurrentUser: async (): Promise<UserInfo> => {
        let cleanUid = '';

        // 1. Fetch authenticated userId from /custom/auth/GetUserName.php
        try {
            const res = await fetch(AUTH_API_BASE);
            if (res.ok) {
                const data = await res.json();
                cleanUid = data?.user || '';
            }
        } catch (e) {
            console.warn('[Auth] Could not reach GetUserName.php', e);
        }

        setSessionUser(cleanUid, cleanUid ? undefined : 'Gość', []);

        if (!cleanUid) {
            return {
                uid: '',
                name: 'Gość',
                email: '',
                groups: [],
                canEdit: false,
                isGuest: true
            };
        }

        // 2. Fetch full user info and permissions directly from the database via MasterDashboard.php?job=GetUserInfo
        try {
            const infoRes = await apiRequest<UserInfoPayload>(API_BASE, { job: 'GetUserInfo', userId: cleanUid });
            if (infoRes && infoRes.status && infoRes.data) {
                const d = infoRes.data;
                const groups: string[] = Array.isArray(d.groups) ? d.groups : [];
                const fullName = d.name || cleanUid;
                setSessionUser(cleanUid, fullName, groups);
                return {
                    uid: d.userId || cleanUid,
                    name: fullName,
                    email: d.email || '',
                    groups,
                    canEdit: Boolean(d.canEdit),
                    isGuest: false
                };
            }
        } catch (e) {
            console.warn('[Auth] Could not fetch user details from the database', e);
        }

        setSessionUser(cleanUid, cleanUid, []);
        return {
            uid: cleanUid,
            name: cleanUid,
            email: '',
            groups: [],
            canEdit: false,
            isGuest: true
        };
    }
};
