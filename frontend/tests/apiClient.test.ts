import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiRequest } from '../src/api/client.ts';
import { getCreateMasterUrl, masterApi } from '../src/api/masterApi.ts';

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

test('FIS operations target the selected host and include the FIS value', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'http://dashboard.test' } } as Window & typeof globalThis;

    let requestedUrl = '';
    let requestedBody = '';
    globalThis.fetch = async (input, init) => {
        requestedUrl = String(input);
        requestedBody = String(init?.body ?? '');
        return new Response(JSON.stringify({ status: true, message: 'OK', data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        assert.equal(
            getCreateMasterUrl('FIS1'),
            'http://plblofis1.global.borgwarner.net/custom/matz/php/MasterDashboard.php',
        );
        assert.equal(
            getCreateMasterUrl('FIS2'),
            'http://plblofis2.global.borgwarner.net/custom/matz/php/MasterDashboard.php',
        );

        await masterApi.createMaster({
            unit: 'TEST-001',
            process: 'AOI',
            status: 'GOOD',
            maxCounter: 1000,
            maxErrors: 50,
            fis: 'FIS2',
        });

        assert.equal(
            requestedUrl,
            'http://plblofis2.global.borgwarner.net/custom/matz/php/MasterDashboard.php?job=CreateMaster',
        );
        assert.equal(JSON.parse(requestedBody).fis, 'FIS2');

        await masterApi.deleteMaster('TEST-001', 'FIS2');
        assert.equal(
            requestedUrl,
            'http://plblofis2.global.borgwarner.net/custom/matz/php/MasterDashboard.php?job=DeleteMaster',
        );
        assert.deepEqual(JSON.parse(requestedBody), { unit: 'TEST-001', fis: 'FIS2' });
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});
