import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { syncSessionQueries } from '../src/lib/sessionSync.ts';
import {
    AUTH_STORAGE_KEY,
    LANGUAGE_STORAGE_KEY,
    SELECTED_FIS_STORAGE_KEY,
    postBroadcastMessage,
    subscribeBroadcast,
    type BroadcastSyncMessage,
} from '../src/lib/broadcastSync.ts';
import {
    applyStoredSession,
    fisApi,
    loadStoredSession,
    saveStoredSession,
} from '../src/api/fisApi.ts';
import { getSessionUser } from '../src/api/client.ts';
import { refreshMasterData } from '../src/lib/queryCache.ts';

function createMemoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
        get length() {
            return store.size;
        },
        clear: () => store.clear(),
        getItem: (key: string) => store.get(key) ?? null,
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        removeItem: (key: string) => {
            store.delete(key);
        },
        setItem: (key: string, value: string) => {
            store.set(key, String(value));
        },
    };
}

test('delayed auth notifications read the latest session without writes and refetch with its identity', async () => {
    const originalStorage = globalThis.localStorage;
    const storage = createMemoryStorage();
    const user = { uid: 'new-user', name: 'New User', email: '', groups: ['admin_group'], canEdit: true };
    storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user }));
    let writes = 0;
    globalThis.localStorage = {
        ...storage,
        setItem: () => { writes++; },
        removeItem: () => { writes++; },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(['identity'], 'old-user');
    const identities: string[] = [];
    const observer = new QueryObserver(client, {
        queryKey: ['identity'],
        queryFn: async () => {
            identities.push(getSessionUser().uid);
            return getSessionUser().uid;
        },
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
        // Both a delayed logout and an older login notification must use storage.
        for (let i = 0; i < 4; i++) {
            assert.equal(syncSessionQueries(client)?.user.uid, 'new-user');
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        assert.ok(identities.length > 0);
        assert.ok(identities.every(uid => uid === 'new-user'));
        assert.equal(writes, 0);
        assert.equal(JSON.parse(storage.getItem(AUTH_STORAGE_KEY)!).user.uid, 'new-user');

        storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ user, expiresAt: '2000-01-01T00:00:00Z' }));
        assert.equal(syncSessionQueries(client), null);
        assert.equal(getSessionUser().uid, '');
        storage.setItem(AUTH_STORAGE_KEY, '{invalid');
        assert.equal(syncSessionQueries(client), null);
        storage.removeItem(AUTH_STORAGE_KEY);
        assert.equal(syncSessionQueries(client), null);
        assert.equal(writes, 0);
    } finally {
        unsubscribe();
        client.clear();
        globalThis.localStorage = originalStorage;
    }
});

function waitForMessage(
    subscribeOpts: { tabId: string },
    predicate: (msg: BroadcastSyncMessage) => boolean,
): { promise: Promise<BroadcastSyncMessage>; unsubscribe: () => void } {
    let unsubscribe = () => {};
    const promise = new Promise<BroadcastSyncMessage>((resolve) => {
        unsubscribe = subscribeBroadcast((msg) => {
            if (predicate(msg)) {
                unsubscribe();
                resolve(msg);
            }
        }, subscribeOpts);
    });
    return { promise, unsubscribe };
}

test('clicking logout broadcasts auth:logout to all other open windows and clears session user', async () => {
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();

    const otherWindow = waitForMessage({ tabId: 'window-2' }, msg => msg.type === 'auth:logout');
    const sameWindowMessages: BroadcastSyncMessage[] = [];
    const unsubscribeSameWindow = subscribeBroadcast((msg) => {
        sameWindowMessages.push(msg);
    });

    try {
        saveStoredSession(
            {
                user: {
                    uid: 'jkowalski',
                    name: 'Jan Kowalski',
                    email: 'jkowalski@borgwarner.com',
                    groups: ['admin_group'],
                    canEdit: true,
                    isGuest: false,
                },
            },
            { broadcast: false },
        );
        assert.equal(getSessionUser().uid, 'jkowalski');

        fisApi.logout();

        const received = await otherWindow.promise;
        assert.equal(received.type, 'auth:logout');
        assert.equal(getSessionUser().uid, '');
        assert.equal(globalThis.localStorage.getItem(AUTH_STORAGE_KEY), null);
        assert.equal(sameWindowMessages.length, 0);
    } finally {
        otherWindow.unsubscribe();
        unsubscribeSameWindow();
        globalThis.localStorage = originalStorage;
    }
});

test('logging in broadcasts auth:session to other open windows and applies session headers', async () => {
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();

    const otherWindow = waitForMessage({ tabId: 'window-2' }, msg => msg.type === 'auth:session');

    try {
        saveStoredSession({
            user: {
                uid: 'mzielinski',
                name: 'Mateusz Zieliński',
                email: 'mzielinski@borgwarner.com',
                groups: ['admin_group', 'golden_samples'],
                canEdit: true,
                isGuest: false,
            },
            token: 'tok-123',
        });

        const received = await otherWindow.promise;
        assert.equal(received.type, 'auth:session');
        if (received.type === 'auth:session') {
            const applied = applyStoredSession(received.session);
            assert.equal(applied?.user.uid, 'mzielinski');
            assert.equal(getSessionUser().uid, 'mzielinski');
            assert.deepEqual(getSessionUser().groups, ['admin_group', 'golden_samples']);
        }
    } finally {
        otherWindow.unsubscribe();
        fisApi.logout();
        globalThis.localStorage = originalStorage;
    }
});

test('expired sessions automatically broadcast auth:logout when checked', async () => {
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = createMemoryStorage();

    const otherWindow = waitForMessage({ tabId: 'window-2' }, msg => msg.type === 'auth:logout');

    try {
        globalThis.localStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({
                user: {
                    uid: 'expired_user',
                    name: 'Expired User',
                    email: '',
                    groups: ['admin_group'],
                    canEdit: true,
                },
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
            }),
        );

        const loaded = loadStoredSession({ broadcastOnExpire: true });
        assert.equal(loaded, null);
        assert.equal(getSessionUser().uid, '');

        const received = await otherWindow.promise;
        assert.equal(received.type, 'auth:logout');
    } finally {
        otherWindow.unsubscribe();
        globalThis.localStorage = originalStorage;
    }
});

test('refreshMasterData broadcasts query:invalidate across windows', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const otherWindow = waitForMessage({ tabId: 'window-2' }, msg => msg.type === 'query:invalidate');

    try {
        await refreshMasterData(client);
        const received = await otherWindow.promise;
        assert.equal(received.type, 'query:invalidate');
        if (received.type === 'query:invalidate') {
            assert.deepEqual(received.queryKeys, [['masters'], ['history'], ['unitHistory']]);
        }
    } finally {
        otherWindow.unsubscribe();
        client.clear();
    }
});

test('storage events act as fallback for cross-window logout, language, and FIS changes', () => {
    const originalWindow = globalThis.window;
    const listeners = new Map<string, Set<(event: StorageEvent) => void>>();

    globalThis.window = {
        addEventListener: (type: string, handler: (event: StorageEvent) => void) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(handler);
        },
        removeEventListener: (type: string, handler: (event: StorageEvent) => void) => {
            listeners.get(type)?.delete(handler);
        },
    } as unknown as Window & typeof globalThis;

    const received: BroadcastSyncMessage[] = [];
    const unsubscribe = subscribeBroadcast((msg) => {
        received.push(msg);
    }, { tabId: 'window-storage' });

    const emitStorage = (key: string | null, newValue: string | null) => {
        for (const handler of listeners.get('storage') ?? []) {
            handler({ key, newValue } as StorageEvent);
        }
    };

    try {
        emitStorage(AUTH_STORAGE_KEY, null);
        emitStorage(LANGUAGE_STORAGE_KEY, 'EN');
        emitStorage(SELECTED_FIS_STORAGE_KEY, 'FIS2');
        postBroadcastMessage({ type: 'lang:change', language: 'PL' }, { senderId: 'window-storage' });

        assert.deepEqual(received, [
            { type: 'auth:logout' },
            { type: 'lang:change', language: 'EN' },
            { type: 'fis:change', fis: 'FIS2' },
        ]);
    } finally {
        unsubscribe();
        globalThis.window = originalWindow;
    }
});
