import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';

interface RequireEditProps {
    children: ReactNode;
}

export const RequireEdit = ({ children }: RequireEditProps) => {
    const { canEdit, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="flex min-h-40 items-center justify-center text-sm text-brand-text-muted">
                Sprawdzanie uprawnień…
            </div>
        );
    }

    return canEdit ? children : <Navigate to="/" replace />;
};
