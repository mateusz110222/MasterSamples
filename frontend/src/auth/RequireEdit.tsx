import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from './useAuth';
import { useLanguage } from '../i18n/useLanguage';

interface RequireEditProps {
    children: ReactNode;
}

export const RequireEdit = ({ children }: RequireEditProps) => {
    const { canEdit, isLoading } = useAuth();
    const { t } = useLanguage();

    if (isLoading) {
        return (
            <div className="flex min-h-40 items-center justify-center text-sm text-brand-text-muted">
                {t.accessChecking}
            </div>
        );
    }

    return canEdit ? children : <Navigate to="/" replace />;
};
