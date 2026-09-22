import { AlertTriangle, X } from 'lucide-react';

interface ErrorBannerProps {
    message?: string | null;
    onDismiss?: () => void;
}

export const ErrorBanner = ({ message, onDismiss }: ErrorBannerProps) => {
    if (!message) return null;

    return (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-400" />
            <span className="flex-1">{message}</span>
            {onDismiss && (
                <button type="button" onClick={onDismiss} className="text-rose-300 hover:text-white" aria-label="Zamknij komunikat">
                    <X size={16} />
                </button>
            )}
        </div>
    );
};
