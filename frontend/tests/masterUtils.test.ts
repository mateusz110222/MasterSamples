import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMastersCsv, filterMasters, matchesProcess, sortMasters } from '../src/lib/masterUtils.ts';
import type { MasterUnit } from '../src/types/index.ts';

const master = (overrides: Partial<MasterUnit> = {}): MasterUnit => ({
    id: 1,
    unit: 'ABC-1',
    process: 'SMT, AOI',
    status: 'GOOD',
    currentCounter: 2,
    maxCounter: 100,
    errorCounter: 1,
    errorMaxCounter: 10,
    globalCounter: 20,
    user: 'tester',
    isactive: 1,
    FIS: 'FIS1',
    ...overrides,
});

test('process matching compares complete comma-separated names', () => {
    assert.equal(matchesProcess('SMT2, AOI', 'SMT'), false);
    assert.equal(matchesProcess('SMT, AOI', 'SMT'), true);
});

test('filtering combines search, status and activity', () => {
    const result = filterMasters([master(), master({ id: 2, unit: 'XYZ', status: 'BAD', isactive: 2 })], {
        searchTerm: 'abc',
        process: 'SMT',
        status: 'GOOD',
        activity: 'active',
    });
    assert.deepEqual(result.map(item => item.unit), ['ABC-1']);
});

test('sorting does not mutate the source list', () => {
    const source = [master({ unit: 'B' }), master({ id: 2, unit: 'A' })];
    const sorted = sortMasters(source, 'unit', 'asc');
    assert.deepEqual(sorted.map(item => item.unit), ['A', 'B']);
    assert.deepEqual(source.map(item => item.unit), ['B', 'A']);
});

test('CSV escapes quotes and spreadsheet formulas', () => {
    const csv = buildMastersCsv([master({ unit: '=2+2', process: 'SMT, "AOI"' })]);
    assert.match(csv, /"'=2\+2"/);
    assert.match(csv, /"SMT, ""AOI"""/);
});
