import type { QueryClient } from '@tanstack/react-query';
import { loadStoredSession } from '../api/fisApi.ts';

export function syncSessionQueries(queryClient: QueryClient) {
    const stored = loadStoredSession({ readOnly: true });
    void queryClient.cancelQueries();
    if (stored) void queryClient.invalidateQueries();
    return stored;
}
