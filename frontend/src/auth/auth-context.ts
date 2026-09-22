import { createContext } from 'react';
import { ALLOWED_GROUPS } from '../api/fisApi';
import type { UserInfo } from '../types';

export interface AuthContextType {
    user: UserInfo | null;
    isLoading: boolean;
    canEdit: boolean;
    allowedGroups: string[];
}

export const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    canEdit: false,
    allowedGroups: ALLOWED_GROUPS,
});
