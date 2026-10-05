import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError, apiRequest, setSessionUser } from '../src/api/client.ts';
import { getCreateMasterUrl, masterApi } from '../src/api/masterApi.ts';
import { fisApi, getFisUnitHistoryUrl } from '../src/api/fisApi.ts';
import { blockedApi } from '../src/api/blockedApi.ts';

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

test('history links use the event FIS and escape the unit number', () => {
    assert.equal(getFisUnitHistoryUrl('SN&1', 'FIS2'), 'http://plblofis2.global.borgwarner.net/std_public/unithistory?unit=SN%261');
    assert.equal(getFisUnitHistoryUrl('SN&1', 'FIS1'), 'http://plblofis1.global.borgwarner.net/std_public/unithistory?unit=SN%261');
});

test('blocked machine lists retain the FIS for identical filenames and unlock on the selected host', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'http://dashboard.test' } } as Window & typeof globalThis;
    const requests: { url: URL; body?: string; method?: string }[] = [];
    globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        requests.push({ url, body: init?.body ? String(init.body) : undefined, method: init?.method });
        return new Response(JSON.stringify({ status: true, message: 'OK', data:
            url.searchParams.get('job') === 'GetBlockedMachines'
                ? [{ id: 'SPI_MASTER', filename: 'SPI_MASTER', machine: 'SPI', prefix: 'MASTER', blockedAt: null, size: 0 }]
                : null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    try {
        const [fis1, fis2] = await Promise.all([
            blockedApi.getBlockedMachines('FIS1'), blockedApi.getBlockedMachines('FIS2'),
        ]);
        assert.equal(fis1[0].FIS, 'FIS1');
        assert.equal(fis2[0].FIS, 'FIS2');
        assert.equal(fis1[0].filename, fis2[0].filename);
        assert.equal(requests[0].url.hostname, 'plblofis1.global.borgwarner.net');
        assert.equal(requests[1].url.hostname, 'plblofis2.global.borgwarner.net');
        await blockedApi.deleteBlockedMachine(fis2[0].filename, fis2[0].FIS);
        assert.equal(requests[2].url.hostname, 'plblofis2.global.borgwarner.net');
        assert.equal(requests[2].url.searchParams.get('job'), 'DeleteBlockedMachine');
        assert.equal(requests[2].method, 'POST');
        assert.deepEqual(JSON.parse(requests[2].body!), { filename: 'SPI_MASTER' });
        await blockedApi.deleteBlockedMachine(fis1[0].filename, fis1[0].FIS);
        assert.equal(requests[3].url.hostname, 'plblofis1.global.borgwarner.net');
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});

test('process tags come from the selected FIS on either dashboard host', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    const requestedUrls: URL[] = [];
    globalThis.fetch = async (input) => {
        const url = new URL(String(input));
        requestedUrls.push(url);
        const key = url.hostname.includes('plblofis2') ? 'FIS2_ONLY' : 'FIS1_ONLY';
        return new Response(JSON.stringify([{ key }, { key: '' }]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        for (const host of ['plblofis1', 'plblofis2']) {
            globalThis.window = { location: {
                hostname: `${host}.global.borgwarner.net`,
                origin: `http://${host}.global.borgwarner.net`,
            } } as Window & typeof globalThis;
            for (const fis of ['FIS1', 'FIS2'] as const) {
                assert.deepEqual(await fisApi.getProcessTags(fis), [{
                    key: `${fis}_ONLY`, description: `${fis}_ONLY`,
                }]);
                const url = requestedUrls.at(-1)!;
                assert.equal(url.hostname, `${fis.toLowerCase().replace('fis', 'plblofis')}.global.borgwarner.net`);
                assert.equal(url.pathname, '/custom/matz/phpBB/router.php');
                assert.equal(url.searchParams.get('job'), 'GetProcessTags');
            }
        }
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});

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

test('createMaster forwards userKey2 (PN) when provided', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'http://dashboard.test' } } as Window & typeof globalThis;

    let sentBody: Record<string, unknown> = {};
    globalThis.fetch = async (_input, init) => {
        sentBody = init?.body ? JSON.parse(String(init.body)) : {};
        return new Response(JSON.stringify({ status: true, message: 'OK', data: {} }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        await masterApi.createMaster({
            unit: 'TEST-PN-001',
            process: 'SMT',
            status: 'GOOD',
            maxCounter: 500,
            maxErrors: 10,
            fis: 'FIS1',
            userKey2: 'PN-998877',
        });

        assert.equal(sentBody.userKey2, 'PN-998877');
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});

test('getUserKey2Tags queries GetUserKey router endpoint with Key 2', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'http://dashboard.test' } } as Window & typeof globalThis;

    let requestedUrl = '';
    let requestedBody: Record<string, unknown> = {};

    globalThis.fetch = async (input, init) => {
        requestedUrl = String(input);
        requestedBody = init?.body ? JSON.parse(String(init.body)) : {};
        return new Response(JSON.stringify({
            status: true,
            message: 'OK',
            data: [{ key: 'PN-002' }, { key: 'PN-001' }, { key: 'PN-002' }],
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    };

    try {
        const pns = await fisApi.getUserKey2Tags('FIS2');
        assert.ok(requestedUrl.includes('plblofis2.global.borgwarner.net/custom/matz/phpBB/router.php'));
        assert.ok(requestedUrl.includes('job=GetUserKey'));
        assert.equal(requestedBody.Key, '2');
        assert.deepEqual(pns, ['PN-001', 'PN-002']);
    } finally {
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});
