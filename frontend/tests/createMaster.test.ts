import assert from 'node:assert/strict';
import test from 'node:test';
import { masterApi, type MasterStructure, type CreateMasterPayload } from '../src/api/masterApi.ts';
import { createMasterWithStructure } from '../src/lib/createMaster.ts';
import { setSessionUser } from '../src/api/client.ts';

const layout = (unit = 'PANEL', exists = true, masterFis: 'FIS1' | 'FIS2' | null = null): MasterStructure => ({
    unit, requestedUnit: 'CHILD', children: exists ? ['CHILD'] : [], exists, masterFis, members: {},
});

test('structure API requests use the selected FIS, operator identity and expected snapshot', async () => {
    const originalFetch = globalThis.fetch;
    const originalWindow = globalThis.window;
    globalThis.window = { location: { origin: 'http://dashboard.test' } } as Window & typeof globalThis;
    const requests: { url: URL; body: Record<string, unknown>; headers: Headers }[] = [];
    globalThis.fetch = async (input, init) => {
        requests.push({ url: new URL(String(input)), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
        return new Response(JSON.stringify({ status: true, data: layout() }), { headers: { 'Content-Type': 'application/json' } });
    };
    try {
        setSessionUser('operator', 'Test Operator', ['golden_samples']);
        for (const fis of ['FIS1', 'FIS2'] as const) {
            const structure = await masterApi.inspectMasterStructure('CHILD', 'ICT', fis);
            await masterApi.deleteMasterStructure(structure, 'ICT', fis);
            const [inspect, remove] = requests.splice(0);
            assert.equal(inspect.url.hostname, fis === 'FIS1' ? 'plblofis1.global.borgwarner.net' : 'plblofis2.global.borgwarner.net');
            assert.equal(remove.url.hostname, inspect.url.hostname);
            assert.equal(inspect.url.searchParams.get('job'), 'InspectMasterStructure');
            assert.equal(remove.url.searchParams.get('job'), 'DeleteMasterStructure');
            assert.deepEqual(inspect.body, { unit: 'CHILD', process: 'ICT', fis });
            assert.deepEqual(remove.body, { unit: 'PANEL', process: 'ICT', fis, expectedStructure: structure });
            assert.equal(remove.headers.get('X-User'), 'operator');
        }
    } finally {
        setSessionUser('', '', []);
        globalThis.fetch = originalFetch;
        globalThis.window = originalWindow;
    }
});
const payload: CreateMasterPayload = { unit: 'CHILD', process: 'ICT', fis: 'FIS2', status: 'GOOD', maxCounter: 1000, maxErrors: 50 };

test('creating and migrating panels resolves the canonical SN before deleting anything', async () => {
    const original = { ...masterApi };
    const events: string[] = [];
    let target = layout('PANEL', true);
    const source = layout('PANEL', true, 'FIS1');
    let failAt = '';
    masterApi.inspectMasterStructure = async (_unit, _process, fis) => {
        events.push(`inspect:${fis}`);
        return fis === 'FIS2' ? target : source;
    };
    masterApi.createMaster = async request => {
        const step = request.previewOnly ? 'preview' : 'create';
        events.push(step);
        if (failAt === step) throw new Error(`${step} failed`);
        if (request.previewOnly) {
            assert.equal(request.sourceStructure, source);
            return { status: true, message: '', data: { structure: target } };
        }
        if (request.forceUpdate) assert.equal(request.expectedTargetStructure, target);
        return { status: true, message: '', data: request.forceUpdate ? { unit: 'PANEL' } : {
            exists: true, unit: 'PANEL', oldData: { unit: 'PANEL', FIS: 'FIS1' }, newData: { unit: 'PANEL', FIS: 'FIS2' },
        } };
    };
    masterApi.deleteMasterStructure = async structure => {
        events.push('delete');
        assert.equal(structure, source);
        if (failAt === 'delete') throw new Error('delete failed');
    };
    try {
        await createMasterWithStructure(payload);
        assert.deepEqual(events.splice(0), ['inspect:FIS2', 'create']);
        target = layout('CHILD', false);
        const conflict = await createMasterWithStructure(payload);
        assert.equal(conflict.data?.newData?.unit, 'PANEL');
        assert.deepEqual(events.splice(0), ['inspect:FIS2', 'inspect:FIS1', 'create']);
        const confirmed = { ...payload, unit: 'PANEL', forceUpdate: true, oldFis: 'FIS1' as const };
        await createMasterWithStructure(confirmed);
        assert.deepEqual(events.splice(0), ['inspect:FIS1', 'preview', 'delete', 'create']);
        failAt = 'preview';
        await assert.rejects(createMasterWithStructure(confirmed), /preview failed/);
        assert.deepEqual(events.splice(0), ['inspect:FIS1', 'preview']);
        failAt = 'delete';
        await assert.rejects(createMasterWithStructure(confirmed), /delete failed/);
        assert.deepEqual(events.splice(0), ['inspect:FIS1', 'preview', 'delete']);
        failAt = 'create';
        await assert.rejects(createMasterWithStructure(confirmed), /PANEL.*FIS1.*FIS2/);
        assert.deepEqual(events.splice(0), ['inspect:FIS1', 'preview', 'delete', 'create']);
    } finally {
        Object.assign(masterApi, original);
    }
});

test('migrating an ordinary master absent from source WIP creates it without source deletion', async () => {
    const original = { ...masterApi };
    const events: string[] = [];
    const source = layout('PANEL', false, 'FIS1');
    const target = layout('PANEL', false);
    masterApi.inspectMasterStructure = async () => {
        events.push('inspect');
        return source;
    };
    masterApi.deleteMasterStructure = async () => {
        throw new Error('An absent ordinary source must not be deleted');
    };
    masterApi.createMaster = async request => {
        events.push(request.previewOnly ? 'preview' : 'create');
        return { status: true, message: '', data: { structure: target, unit: 'PANEL' } };
    };
    try {
        const request = { ...payload, unit: 'PANEL', process: 'FCT', forceUpdate: true, oldFis: 'FIS1' as const };
        await createMasterWithStructure(request);
        assert.deepEqual(events.splice(0), ['inspect', 'preview', 'create']);
        await assert.rejects(createMasterWithStructure({ ...request, process: 'ICT' }), /Brak mastera/);
        assert.deepEqual(events, ['inspect']);
    } finally {
        Object.assign(masterApi, original);
    }
});
