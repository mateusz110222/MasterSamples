import assert from 'node:assert/strict';
import test from 'node:test';
import { canEditFisBlocking } from '../src/lib/permissions.ts';
import type { UserInfo } from '../src/types';

const user = (groups: string[]): UserInfo => ({ uid: 'operator', name: 'Operator', groups, canEdit: true });

test('FIS override requires one of the two designated admin groups', () => {
    assert.equal(canEditFisBlocking(user(['admin_group'])), true);
    assert.equal(canEditFisBlocking(user(['fisadmin_group'])), true);
    assert.equal(canEditFisBlocking(user(['testeng', 'fisadmin_group'])), true);
    for (const groups of [[], ['support_group'], ['testeng'], ['proceng'], ['golden_samples'], ['ADMIN_GROUP']]) {
        assert.equal(canEditFisBlocking(user(groups)), false);
    }
});

test('guest, missing identity and read-only sessions cannot change FIS overrides', () => {
    assert.equal(canEditFisBlocking(null), false);
    assert.equal(canEditFisBlocking({ ...user(['admin_group']), isGuest: true }), false);
    assert.equal(canEditFisBlocking({ ...user(['admin_group']), uid: '' }), false);
    assert.equal(canEditFisBlocking({ ...user(['admin_group']), canEdit: false }), false);
});
