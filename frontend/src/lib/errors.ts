import { ApiError } from '../api/client';
import type { Language } from '../i18n/LanguageContext';

export const getErrorMessage = (error: unknown, fallback: string): string => {
    if (error instanceof ApiError || error instanceof Error) {
        return error.message || fallback;
    }
    return fallback;
};

export const getLocalizedErrorMessage = (error: unknown, language: Language, fallback: string): string => {
    if (language === 'PL') return getErrorMessage(error, fallback);
    return fallback;
};
