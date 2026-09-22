import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiRequest } from '../src/api/client.ts';

const installBrowserMocks = (response: Response) => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'https://example.test' } } as Window & typeof globalThis;
    globalThis.fetch = async () => response;

    return () => {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    };
};

test('API errors reject instead of reaching mutation onSuccess', async () => {
    const restore = installBrowserMocks(new Response(JSON.stringify({
        status: false,
        message: 'Brak uprawnień',
        data: null,
    }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
    }));

    try {
        await assert.rejects(
            apiRequest('/api', { job: 'DeleteMaster' }, { method: 'POST' }),
            (error: unknown) => error instanceof ApiError
                && error.statusCode === 403
                && error.message === 'Brak uprawnień',
        );
    } finally {
        restore();
    }
});

test('raw JSON endpoints are normalized to the common envelope', async () => {
    const restore = installBrowserMocks(new Response(JSON.stringify(['SMT', 'AOI']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    }));

    try {
        const result = await apiRequest<string[]>('/router');
        assert.equal(result.status, true);
        assert.deepEqual(result.data, ['SMT', 'AOI']);
    } finally {
        restore();
    }
});
