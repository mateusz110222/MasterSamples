import { ApiResponse } from '../types';

export const API_BASE = '/custom/matz/php/MasterDashboard.php';
export const ROUTER_API_BASE = '/custom/matz/phpBB/router.php';
export const AUTH_API_BASE = '/custom/auth/GetUserName.php';

export async function apiRequest<T = any>(
    url: string,
    params: Record<string, string | number | boolean | undefined> = {},
    options: RequestInit = {}
): Promise<ApiResponse<T>> {
    const urlObj = new URL(url, window.location.origin);

    Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
            urlObj.searchParams.append(key, String(val));
        }
    });

    const response = await fetch(urlObj.toString(), {
        headers: {
            'Accept': 'application/json',
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers,
        },
        ...options,
    });

    if (!response.ok && response.status !== 400 && response.status !== 404) {
        throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const data: ApiResponse<T> = await response.json();
    return data;
}
