import React, { useEffect, useState } from 'react';
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
                setUser({
                    uid: '',
                    name: 'Gość',
                    email: '',
                    groups: [],
                    canEdit: false,
                    isGuest: true,
                });
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, []);

    const canEdit = Boolean(user?.canEdit);

    return (
        <AuthContext.Provider value={{ user, isLoading, canEdit, allowedGroups: ALLOWED_GROUPS }}>
            {children}
        </AuthContext.Provider>
    );
};
