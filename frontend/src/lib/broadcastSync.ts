import type { FisTarget, UserInfo } from '../types';
import type { Language } from '../i18n/LanguageContext';

export const BROADCAST_CHANNEL_NAME = 'master_samples_sync';
export const AUTH_STORAGE_KEY = 'master_dashboard_user_session';
export const LANGUAGE_STORAGE_KEY = 'master_samples_lang';
export const SELECTED_FIS_STORAGE_KEY = 'masterSamples.selectedFis';

export interface BroadcastStoredSession {
    user: UserInfo;
    token?: string;
    expiresAt?: string;
}

export type BroadcastSyncPayload =
    | { type: 'auth:logout' }
    | { type: 'auth:session'; session: BroadcastStoredSession }
    | { type: 'query:invalidate'; queryKeys: readonly (readonly unknown[])[] }
    | { type: 'lang:change'; language: Language }
    | { type: 'fis:change'; fis: FisTarget };

export type BroadcastSyncMessage = BroadcastSyncPayload & {
    senderId?: string;
    timestamp?: number;
};

const TAB_ID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;

export function getTabId(): string {
    return TAB_ID;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function isValidBroadcastMessage(value: unknown): value is BroadcastSyncMessage {
    if (!isRecord(value) || typeof value.type !== 'string') return false;
    switch (value.type) {
        case 'auth:logout':
            return true;
        case 'auth:session':
            return isRecord(value.session) && isRecord(value.session.user);
        case 'query:invalidate':
            return Array.isArray(value.queryKeys) && value.queryKeys.every(Array.isArray);
        case 'lang:change':
            return value.language === 'PL' || value.language === 'EN';
        case 'fis:change':
            return value.fis === 'FIS1' || value.fis === 'FIS2';
        default:
            return false;
    }
}

export function postBroadcastMessage(
    payload: BroadcastSyncPayload,
    options?: { senderId?: string },
): void {
    if (typeof BroadcastChannel === 'undefined') return;
    try {
        const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
        const message: BroadcastSyncMessage = {
            ...payload,
            senderId: options?.senderId ?? TAB_ID,
            timestamp: Date.now(),
        };
        channel.postMessage(message);
        channel.close();
    } catch {
        // Ignore BroadcastChannel errors in restricted environments
    }
}

export function subscribeBroadcast(
    listener: (message: BroadcastSyncMessage) => void,
    options?: { tabId?: string; listenStorage?: boolean },
): () => void {
    const currentTabId = options?.tabId ?? TAB_ID;
    const listenStorage = options?.listenStorage ?? true;
    let channel: BroadcastChannel | null = null;

    if (typeof BroadcastChannel !== 'undefined') {
        try {
            channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
            channel.onmessage = (event: MessageEvent<unknown>) => {
                if (!isValidBroadcastMessage(event.data)) return;
                if (event.data.senderId && event.data.senderId === currentTabId) return;
                listener(event.data);
            };
        } catch {
            channel = null;
        }
    }

    const canListenStorage = listenStorage
        && typeof window !== 'undefined'
        && typeof window.addEventListener === 'function';

    const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key === AUTH_STORAGE_KEY) {
            if (!event.newValue) {
                listener({ type: 'auth:logout' });
                return;
            }
            try {
                const parsed = JSON.parse(event.newValue) as BroadcastStoredSession;
                if (parsed && isRecord(parsed.user)) {
                    listener({ type: 'auth:session', session: parsed });
                } else {
                    listener({ type: 'auth:logout' });
                }
            } catch {
                listener({ type: 'auth:logout' });
            }
            return;
        }

        if (event.key === LANGUAGE_STORAGE_KEY && (event.newValue === 'PL' || event.newValue === 'EN')) {
            listener({ type: 'lang:change', language: event.newValue });
            return;
        }

        if (event.key === SELECTED_FIS_STORAGE_KEY && (event.newValue === 'FIS1' || event.newValue === 'FIS2')) {
            listener({ type: 'fis:change', fis: event.newValue });
        }
    };

    if (canListenStorage) {
        window.addEventListener('storage', onStorage);
    }

    return () => {
        if (channel) {
            try {
                channel.onmessage = null;
                channel.close();
            } catch {
                // Ignore close errors
            }
            channel = null;
        }
        if (canListenStorage && typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
            window.removeEventListener('storage', onStorage);
        }
    };
}
