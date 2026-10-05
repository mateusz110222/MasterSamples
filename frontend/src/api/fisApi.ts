import { apiRequest, ROUTER_API_BASE, API_BASE, setSessionUser, clearSessionUser } from './client.ts';
import type { UserInfo, ProcessTagItem, FisTarget } from '../types';

interface UserInfoPayload {
    userId?: string;
    name?: string;
    email?: string;
    department?: string;
    groups?: unknown;
    canEdit?: unknown;
}

export const AUTH_STORAGE_KEY = 'master_dashboard_user_session';

export interface StoredSession {
    user: UserInfo;
    token?: string;
    expiresAt?: string;
}

export function saveStoredSession(session: StoredSession): void {
    try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
        if (session.user.uid) {
            setSessionUser(session.user.uid, session.user.name, session.user.groups);
        } else {
            clearSessionUser();
        }
    } catch (e) {
        console.warn('Could not save session to localStorage', e);
    }
}

export function loadStoredSession(): StoredSession | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as StoredSession;
        if (!parsed || !parsed.user) {
            localStorage.removeItem(AUTH_STORAGE_KEY);
            return null;
        }
        if (!parsed.user.uid || parsed.user.name === 'Gość') {
            parsed.user.isGuest = true;
        }
        if (parsed.expiresAt) {
            const exp = Date.parse(parsed.expiresAt);
            if (Number.isFinite(exp) && exp <= Date.now()) {
                localStorage.removeItem(AUTH_STORAGE_KEY);
                clearSessionUser();
                return null;
            }
        }
        if (parsed.user.uid) {
            setSessionUser(parsed.user.uid, parsed.user.name, parsed.user.groups);
        } else {
            clearSessionUser();
        }
        return parsed;
    } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        clearSessionUser();
        return null;
    }
}

export function removeStoredSession(): void {
    try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {}
    clearSessionUser();
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

export function getRouterUrl(fis: FisTarget = 'FIS1'): string {
    const isClientOnFis2 = typeof window !== 'undefined' && Boolean(window?.location?.hostname?.includes('plblofis2'));
    if (fis === 'FIS2') {
        return isClientOnFis2
            ? ROUTER_API_BASE
            : 'http://plblofis2.global.borgwarner.net/custom/matz/phpBB/router.php';
    }
    return isClientOnFis2
        ? 'http://plblofis1.global.borgwarner.net/custom/matz/phpBB/router.php'
        : ROUTER_API_BASE;
}

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
    getProcessTags: async (fis: FisTarget = 'FIS1'): Promise<ProcessTagItem[]> => {
        const res = await apiRequest<unknown>(getRouterUrl(fis), { job: 'GetProcessTags' });
        const list = Array.isArray(res.data) ? res.data : [];
        return list.map(normalizeProcessTag).filter(item => item.key !== '');
    },

    getUserKey2Tags: async (fis: FisTarget = 'FIS1'): Promise<string[]> => {
        const res = await apiRequest<unknown>(
            getRouterUrl(fis),
            { job: 'GetUserKey' },
            {
                method: 'POST',
                body: JSON.stringify({ job: 'GetUserKey', Key: '2', key: '2' }),
            }
        );
        const list = Array.isArray(res.data) ? res.data : [];
        const normalized = list.map((item: unknown) => {
            if (typeof item === 'object' && item !== null) {
                const r = item as Record<string, unknown>;
                return String(r.key ?? r.Key ?? r.name ?? r.tag ?? '').trim();
            }
            return String(item ?? '').trim();
        }).filter(Boolean);

        return Array.from(new Set(normalized)).sort((a, b) =>
            a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
        );
    },

    login: async (login: string, password: string): Promise<UserInfo> => {
        const res = await apiRequest<UserInfoPayload & { token?: string; expires_at?: string }>(
            API_BASE,
            { job: 'Login' },
            {
                method: 'POST',
                body: JSON.stringify({ login, password }),
            }
        );

        if (!res.status || !res.data) {
            throw new Error(res.message || '');
        }

        const d = res.data;
        let rawUid = (d.userId || login).trim();
        if (rawUid.includes('\\')) rawUid = rawUid.split('\\').pop() || rawUid;
        if (rawUid.includes('@')) rawUid = rawUid.split('@')[0];
        const cleanUid = rawUid.trim();
        const fullName = d.name || cleanUid;
        const groups: string[] = Array.isArray(d.groups) ? (d.groups as string[]) : [];
        const user: UserInfo = {
            uid: cleanUid,
            name: fullName,
            email: d.email || '',
            department: d.department || '',
            groups,
            canEdit: Boolean(d.canEdit),
            isGuest: false,
        };

        saveStoredSession({
            user,
            token: d.token,
            expiresAt: d.expires_at,
        });

        return user;
    },

    loginAsGuest: (): UserInfo => {
        const guestUser: UserInfo = {
            uid: '',
            name: 'Gość',
            email: '',
            groups: [],
            canEdit: false,
            isGuest: true,
        };

        saveStoredSession({
            user: guestUser,
        });

        return guestUser;
    },

    logout: (): void => {
        removeStoredSession();
    },

    getCurrentUser: async (): Promise<UserInfo | null> => {
        const stored = loadStoredSession();
        if (stored) {
            return stored.user;
        }
        return null;
    }
};
