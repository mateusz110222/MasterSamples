import React, { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserInfo } from '../types';
import {
    fisApi,
    ALLOWED_GROUPS,
    loadStoredSession,
} from '../api/fisApi';
import { subscribeBroadcast } from '../lib/broadcastSync';
import { syncSessionQueries } from '../lib/sessionSync';
import { AuthContext } from './auth-context';

function isSameUser(a: UserInfo | null, b: UserInfo | null): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
        a.uid === b.uid &&
        a.name === b.name &&
        a.email === b.email &&
        a.canEdit === b.canEdit &&
        Boolean(a.isGuest) === Boolean(b.isGuest) &&
        a.groups.length === b.groups.length &&
        a.groups.every((group, idx) => group === b.groups[idx])
    );
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const queryClient = useQueryClient();
    const [user, setUser] = useState<UserInfo | null>(null);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fisApi.getCurrentUser()
            .then((userData) => {
                const stored = loadStoredSession({ broadcastOnExpire: true });
                setExpiresAt(stored?.expiresAt ?? null);
                setUser(userData);
            })
            .catch(() => {
                setExpiresAt(null);
                setUser(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    const syncFromStorage = useCallback(() => {
        // Events are notifications, not authoritative snapshots: another tab may
        // already have replaced the session while this tab was suspended.
        // Loading applies API headers synchronously before any refetch can run.
        const stored = syncSessionQueries(queryClient);
        setExpiresAt(stored?.expiresAt ?? null);
        setUser(prev => isSameUser(prev, stored?.user ?? null) ? prev : stored?.user ?? null);
        setIsLoading(false);
    }, [queryClient]);

    useEffect(() => subscribeBroadcast((message) => {
        if (message.type === 'auth:logout' || message.type === 'auth:session') {
            syncFromStorage();
        }
    }), [syncFromStorage]);

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

        const onVisibilityChange = () => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                syncFromStorage();
            }
        };

        window.addEventListener('focus', syncFromStorage);
        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
            document.addEventListener('visibilitychange', onVisibilityChange);
        }
        return () => {
            window.removeEventListener('focus', syncFromStorage);
            if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
                document.removeEventListener('visibilitychange', onVisibilityChange);
            }
        };
    }, [syncFromStorage]);

    useEffect(() => {
        if (!expiresAt || typeof window === 'undefined') return;
        const expMs = Date.parse(expiresAt);
        if (!Number.isFinite(expMs)) return;
        const remainingMs = Math.max(0, expMs - Date.now());
        const timer = window.setTimeout(() => {
            syncFromStorage();
        }, Math.min(remainingMs, 2_147_483_647));
        return () => window.clearTimeout(timer);
    }, [expiresAt, syncFromStorage]);

    const login = useCallback(async (username: string, password: string) => {
        try {
            const loggedUser = await fisApi.login(username, password);
            const stored = loadStoredSession();
            setExpiresAt(stored?.expiresAt ?? null);
            setUser(loggedUser);
            return { status: true };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : '';
            return { status: false, message: msg };
        }
    }, []);

    const loginAsGuest = useCallback(() => {
        const guestUser = fisApi.loginAsGuest();
        setExpiresAt(null);
        setUser(guestUser);
    }, []);

    const logout = useCallback(() => {
        fisApi.logout();
        setExpiresAt(null);
        setUser(null);
    }, []);

    const canEdit = Boolean(user?.canEdit);
    const isGuest = Boolean(user?.isGuest || (user && !user.uid));
    const isAuthenticated = user !== null;

    return (
        <AuthContext.Provider
            value={{
                user,
                isLoading,
                canEdit,
                isGuest,
                isAuthenticated,
                allowedGroups: ALLOWED_GROUPS,
                login,
                loginAsGuest,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
