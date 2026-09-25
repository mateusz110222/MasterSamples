import React, { useCallback, useEffect, useState } from 'react';
import { UserInfo } from '../types';
import { fisApi, ALLOWED_GROUPS } from '../api/fisApi';
import { AuthContext } from './auth-context';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<UserInfo | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fisApi.getCurrentUser()
            .then((userData) => {
                setUser(userData);
            })
            .catch(() => {
                setUser(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        try {
            const loggedUser = await fisApi.login(username, password);
            setUser(loggedUser);
            return { status: true };
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : 'Błąd logowania';
            return { status: false, message: msg };
        }
    }, []);

    const loginAsGuest = useCallback(() => {
        const guestUser = fisApi.loginAsGuest();
        setUser(guestUser);
    }, []);

    const logout = useCallback(() => {
        fisApi.logout();
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
