import { ApiError } from '../api/client';

export const getErrorMessage = (error: unknown, fallback = 'Wystąpił nieoczekiwany błąd.'): string => {
    if (error instanceof ApiError || error instanceof Error) {
        return error.message || fallback;
    }
    return fallback;
};
