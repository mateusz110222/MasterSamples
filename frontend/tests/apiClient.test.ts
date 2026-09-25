import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiRequest, setSessionUser } from '../src/api/client.ts';
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

test('history pagination reads total count and keeps older array responses usable', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'https://example.test' } } as Window & typeof globalThis;
    let requestedUrl = '';
    let responseData: unknown = { records: [{ id: 1 }], total: 126 };
    globalThis.fetch = async (input) => {
        requestedUrl = String(input);
        return new Response(JSON.stringify({ status: true, message: 'OK', data: responseData }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        const first = await masterApi.getHistory({ limit: 51, offset: 50 });
        assert.equal(new URL(requestedUrl).searchParams.get('includeTotal'), 'true');
        assert.equal(first.total, 126);
        assert.equal(first.records.length, 1);

        responseData = [{ id: 2 }];
        const legacy = await masterApi.getHistory({ limit: 51, offset: 50 });
        assert.equal(legacy.total, 51);
        assert.equal(legacy.records.length, 1);
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
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

        await masterApi.deleteMaster('TEST-001', 'FIS1', { fisOnly: true });
        assert.equal(
            requestedUrl,
            'http://plblofis1.global.borgwarner.net/custom/matz/php/MasterDashboard.php?job=DeleteMaster',
        );
        assert.deepEqual(JSON.parse(requestedBody), { unit: 'TEST-001', fis: 'FIS1', fisOnly: true });
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});

test('session user, name, and groups are forwarded in headers and payload', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'http://dashboard.test' } } as Window & typeof globalThis;

    let sentHeaders: Record<string, string> = {};
    let sentBody: Record<string, unknown> = {};

    globalThis.fetch = async (_input, init) => {
        sentHeaders = (init?.headers ?? {}) as Record<string, string>;
        sentBody = init?.body ? JSON.parse(String(init.body)) : {};
        return new Response(JSON.stringify({ status: true, message: 'OK', data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        setSessionUser('matzielinski', 'Mateusz Zieliński', ['golden_samples', 'testeng']);

        await masterApi.createMaster({
            unit: 'TEST-002',
            process: 'SMT',
            status: 'GOOD',
            maxCounter: 500,
            maxErrors: 10,
            fis: 'FIS2',
        });

        assert.equal(sentHeaders['X-User'], 'matzielinski');
        assert.equal(sentHeaders['X-User-Name'], encodeURIComponent('Mateusz Zieliński'));
        assert.equal(decodeURIComponent(sentHeaders['X-User-Name']), 'Mateusz Zieliński');
        assert.equal(sentHeaders['X-User-Groups'], 'golden_samples%2Ctesteng');
        assert.equal(sentBody.user, 'matzielinski');
        assert.equal(sentBody.userName, 'Mateusz Zieliński');
        assert.deepEqual(sentBody.userGroups, ['golden_samples', 'testeng']);

        // Reset session
        setSessionUser('', '', []);
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});
