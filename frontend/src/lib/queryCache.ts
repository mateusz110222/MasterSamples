import type { QueryClient } from '@tanstack/react-query';
import { postBroadcastMessage } from './broadcastSync.ts';

export const invalidateAndBroadcast = (
    queryClient: QueryClient,
    queryKeys: readonly (readonly unknown[])[],
) => {
    postBroadcastMessage({ type: 'query:invalidate', queryKeys });
    return Promise.all(
        queryKeys.map(queryKey => queryClient.invalidateQueries({ queryKey })),
    );
};

export const refreshMasterData = (queryClient: QueryClient) =>
    invalidateAndBroadcast(queryClient, [['masters'], ['history'], ['unitHistory']]);

