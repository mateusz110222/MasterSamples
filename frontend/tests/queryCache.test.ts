import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { refreshMasterData } from '../src/lib/queryCache.ts';

test('master changes invalidate inactive history pages and refetch open unit history', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity } } });
    client.setQueryData(['masters'], ['old master']);
    client.setQueryData(['history', 'filters', 1], ['old page']);
    client.setQueryData(['unitHistory', 'SN1'], ['old event']);
    client.setQueryData(['processTags'], ['SMT']);
    const observer = new QueryObserver(client, {
        queryKey: ['unitHistory', 'SN1'],
        queryFn: async () => ['new event'],
    });
    const unsubscribe = observer.subscribe(() => {});
    try {
        await refreshMasterData(client);
        assert.equal(client.getQueryState(['masters'])?.isInvalidated, true);
        assert.equal(client.getQueryState(['history', 'filters', 1])?.isInvalidated, true);
        assert.deepEqual(client.getQueryData(['unitHistory', 'SN1']), ['new event']);
        assert.equal(client.getQueryState(['processTags'])?.isInvalidated, false);
    } finally {
        unsubscribe();
        client.clear();
    }
});
