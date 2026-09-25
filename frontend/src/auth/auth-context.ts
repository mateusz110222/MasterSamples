import { createContext } from 'react';
import { ALLOWED_GROUPS } from '../api/fisApi';
import type { UserInfo } from '../types';

export interface AuthContextType {
    user: UserInfo | null;
    isLoading: boolean;
    canEdit: boolean;
    isGuest: boolean;
    isAuthenticated: boolean;
    allowedGroups: string[];
    login: (username: string, password: string) => Promise<{ status: boolean; message?: string }>;
    loginAsGuest: () => void;
    logout: () => void;
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    canEdit: false,
    isGuest: false,
    isAuthenticated: false,
    allowedGroups: ALLOWED_GROUPS,
    login: async () => ({ status: false, message: 'Not implemented' }),
    loginAsGuest: () => {},
    logout: () => {},
});
