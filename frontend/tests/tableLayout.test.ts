import assert from 'node:assert/strict';
import test from 'node:test';
import { sampleTableCells } from '../src/lib/tableLayout.ts';

test('500-row tables use bounded measurements and retain unsampled long values', () => {
    const rows = Array.from({ length: 500 }, (_, row) =>
        Array.from({ length: 9 }, (_, column) => ({ textContent: `${row}:${column}` })));
    rows[100][3].textContent = 'Long process name outside the evenly spaced sample'.repeat(10);
    const cells = sampleTableCells(rows, 9);
    assert.ok(cells.length <= 16 * 9 + 9);
    assert.ok(cells.includes(rows[100][3]));
    assert.ok(cells.includes(rows[0][0]));
    assert.ok(cells.includes(rows[499][8]));
});

test('empty and small tables keep all available cells without duplicate measurements', () => {
    assert.deepEqual(sampleTableCells([], 9), []);
    const rows = [[{ textContent: 'A' }, { textContent: 'B' }]];
    assert.deepEqual(sampleTableCells(rows, 2), rows[0]);
});
