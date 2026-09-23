import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMastersCsv, filterMasters, getActivePercentage, getPaginationItems, matchesCurrentUser, matchesProcess, sortMasters } from '../src/lib/masterUtils.ts';
import type { MasterUnit } from '../src/types';

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

test('active percentage stays below 100 when inactive masters remain', () => {
    assert.equal(getActivePercentage(1876, 1885), 99.5);
    assert.equal(getActivePercentage(9999, 10000), 99.9);
    assert.equal(getActivePercentage(0, 0), 0);
});

test('my processes matches the account uid or resolved full name', () => {
    const creator = 'Zielinski, Mateusz';
    const units = [
        master({ unit: 'FULL_NAME', user: creator }),
        master({ unit: 'OTHER', user: `${creator} 2` }),
        master({ unit: 'UID', user: 'matzielinski' }),
    ];
    const result = filterMasters(units, {
        searchTerm: '', process: '', status: '', activity: 'all',
        taskPreset: 'my_processes', currentUser: 'matzielinski', currentUserName: creator,
    });

    assert.deepEqual(result.map(item => item.unit), ['FULL_NAME', 'UID']);
    assert.equal(matchesCurrentUser('other', 'matzielinski', creator), false);
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

test('taskPreset filters correctly for action required, cycle and error limits, and blocked', () => {
    const units = [
        master({ unit: 'NORMAL', currentCounter: 10, maxCounter: 100, errorCounter: 0, isactive: 1 }),
        master({ unit: 'CYCLE_EXCEEDED', currentCounter: 100, maxCounter: 100, errorCounter: 0, isactive: 1 }),
        master({ unit: 'ERROR_EXCEEDED', currentCounter: 10, maxCounter: 100, errorCounter: 10, errorMaxCounter: 10, isactive: 1 }),
        master({ unit: 'BLOCKED_UNIT', currentCounter: 0, maxCounter: 100, errorCounter: 0, isactive: 2 }),
        master({ unit: 'CYCLE_80', currentCounter: 85, maxCounter: 100, errorCounter: 0, isactive: 1 }),
    ];

    const actionRequired = filterMasters(units, { searchTerm: '', process: '', status: '', activity: 'all', taskPreset: 'action_required' });
    assert.deepEqual(actionRequired.map(u => u.unit), ['CYCLE_EXCEEDED', 'ERROR_EXCEEDED', 'BLOCKED_UNIT']);

    const cycles80 = filterMasters(units, { searchTerm: '', process: '', status: '', activity: 'all', taskPreset: 'cycles_80' });
    assert.deepEqual(cycles80.map(u => u.unit), ['CYCLE_EXCEEDED', 'CYCLE_80']);

    const errorsExceeded = filterMasters(units, { searchTerm: '', process: '', status: '', activity: 'all', taskPreset: 'errors_exceeded' });
    assert.deepEqual(errorsExceeded.map(u => u.unit), ['ERROR_EXCEEDED']);

    const blocked = filterMasters(units, { searchTerm: '', process: '', status: '', activity: 'all', taskPreset: 'blocked' });
    assert.deepEqual(blocked.map(u => u.unit), ['BLOCKED_UNIT']);
});

test('getPaginationItems produces expected page numbers and ellipses', () => {
    assert.deepEqual(getPaginationItems(1, 1), [1]);
    assert.deepEqual(getPaginationItems(1, 5), [1, 2, 3, 4, 5]);
    assert.deepEqual(getPaginationItems(2, 10), [1, 2, 3, 4, 5, '...', 10]);
    assert.deepEqual(getPaginationItems(9, 10), [1, '...', 6, 7, 8, 9, 10]);
    assert.deepEqual(getPaginationItems(5, 10), [1, '...', 4, 5, 6, '...', 10]);
});
