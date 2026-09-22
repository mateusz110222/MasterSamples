import type { ApiResponse } from '../types/index.ts';

export const API_BASE = '/custom/matz/php/MasterDashboard.php';
export const ROUTER_API_BASE = '/custom/matz/phpBB/router.php';
export const AUTH_API_BASE = '/custom/auth/GetUserName.php';

export class ApiError extends Error {
    readonly statusCode: number;
    readonly response?: ApiResponse<unknown>;

    constructor(
        message: string,
        statusCode: number,
        response?: ApiResponse<unknown>,
    ) {
        super(message);
        this.name = 'ApiError';
        this.statusCode = statusCode;
        this.response = response;
    }
}

let cachedSessionUser = '';

export function setSessionUser(uid: string): void {
    cachedSessionUser = uid.trim();
}

export function getSessionUser(): string {
    return cachedSessionUser;
}

export async function apiRequest<T = unknown>(
    url: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const urlObj = new URL(url, window.location.origin);
    const { headers, ...fetchOptions } = options;

    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
            urlObj.searchParams.append(key, String(val));
        }
    });

    const userHeaders: Record<string, string> = {};
    if (cachedSessionUser) {
        userHeaders['X-User'] = cachedSessionUser;
    }

    const response = await fetch(urlObj.toString(), {
        ...fetchOptions,
        headers: {
            'Accept': 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...userHeaders,
            ...headers,
        },
    });

    let payload: unknown;
    try {
        payload = await response.json();
    } catch {
        throw new ApiError(
            `Serwer zwrócił nieprawidłową odpowiedź (${response.status})`,
            response.status,
        );
    }

    const isEnvelope = typeof payload === 'object'
        && payload !== null
        && 'status' in payload
        && typeof (payload as { status?: unknown }).status === 'boolean';

    const result: ApiResponse<T> = isEnvelope
        ? payload as ApiResponse<T>
        : { status: response.ok, message: '', data: payload as T };

    if (!response.ok || !result.status) {
        throw new ApiError(
            result.message || `Błąd HTTP ${response.status}: ${response.statusText}`,
            response.status,
            result as ApiResponse<unknown>,
        );
    }

    return result;
}
