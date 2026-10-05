import type { QueryClient } from '@tanstack/react-query';

export const refreshMasterData = (queryClient: QueryClient) => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['masters'] }),
    queryClient.invalidateQueries({ queryKey: ['history'] }),
    queryClient.invalidateQueries({ queryKey: ['unitHistory'] }),
]);
