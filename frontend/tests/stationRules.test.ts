import assert from 'node:assert/strict';
import test from 'node:test';
import { stationPrefixes, matchingStations, effectiveStationRule } from '../src/lib/stationRules.ts';
import type { StationBlockingRule } from '../src/api/stationBlockingApi.ts';

const tags = (names: string[]) => names.map(key => ({ key, description: key }));
const rule = (station: string, mode: 'single' | 'prefix', _legacyDisabled: boolean, FIS: 'FIS1' | 'FIS2' = 'FIS1'): StationBlockingRule => ({ station, mode, FIS, user: 'operator', date: '2026-10-06' });

test('FIS override covers future stations, wins over all rules and preserves FIS isolation', () => {
    const saved = [rule('FTS', 'prefix', false), rule('FTS001', 'single', false)];
    for (const disabled of [false, true]) {
        const override: StationBlockingRule = { station: 'ALL', mode: 'fis', FIS: 'FIS1', disabled, user: 'operator', date: '' };
        for (const rules of [[...saved, override], [override, ...saved]]) {
            assert.equal(effectiveStationRule(rules, 'FIS1', 'FTS001'), override);
            assert.equal(effectiveStationRule(rules, 'FIS1', 'FUTURE999'), override);
            assert.equal(effectiveStationRule(rules, 'FIS2', 'FTS001'), undefined);
        }
        assert.deepEqual(matchingStations(tags(['FTS001', 'OTHER001']), 'ALL', 'fis'), ['FTS001', 'OTHER001']);
    }
    assert.equal(effectiveStationRule(saved, 'FIS1', 'FTS001')?.mode, 'single');
    assert.equal(effectiveStationRule(saved, 'FIS1', 'FUTURE999'), undefined);
});

test('groups require two distinct numbered stations and preserve underscore prefixes', () => {
    assert.deepEqual(stationPrefixes(tags(['FTS001', 'FTS001', 'FTS002', 'FTS_TEST', 'FTS001_A', 'AMBIENT_H02', 'AMBIENT_H03', 'ALONE1', '123'])).map(tag => tag.key), ['AMBIENT_H', 'FTS']);
});
test('numbered substations collapse into the main APR and DAL family prefixes', () => {
    const options = tags(['APR028', 'APR028_1', 'APR028_2', 'APR029', 'DAL009', 'DAL009_1', 'DAL009_2', 'DAL010_1', 'DAL010_2', 'ARS03_1', 'ARS03_2', 'AUDI_DC_BUSBAR_ASM_3', 'AUDI_DC_BUSBAR_ASM_4']);
    assert.deepEqual(stationPrefixes(options).map(tag => tag.key), ['APR', 'ARS', 'AUDI_DC_BUSBAR_ASM', 'DAL']);
    assert.deepEqual(matchingStations(options, 'DAL', 'prefix'), ['DAL009', 'DAL009_1', 'DAL009_2', 'DAL010_1', 'DAL010_2']);
    assert.deepEqual(matchingStations(options, 'APR', 'prefix'), ['APR028', 'APR028_1', 'APR028_2', 'APR029']);
});
test('prefix previews include all literal matches, not just numbered names', () => {
    const options = tags(['FTS001', 'FTS_TEST', 'FTS001_A', 'FTS999', 'XFTS001', 'fts001', 'SMT_A1', 'SMTBA1']);
    assert.deepEqual(matchingStations(options, 'FTS', 'prefix'), ['FTS_TEST', 'FTS001', 'FTS001_A', 'FTS999']);
    assert.deepEqual(matchingStations(options, 'SMT_', 'prefix'), ['SMT_A1']);
    assert.deepEqual(matchingStations(options, 'FTS001', 'single'), ['FTS001']);
    assert.deepEqual(matchingStations(options, '', 'prefix'), []);
});
test('single exceptions override groups, longest prefix wins and FIS is isolated', () => {
    const rules = [rule('FT', 'prefix', false), rule('FTS', 'prefix', true), rule('FTS001', 'single', false)];
    assert.equal(effectiveStationRule(rules, 'FIS1', 'FTS001') !== undefined, true);
    assert.equal(effectiveStationRule(rules, 'FIS1', 'FTS002') !== undefined, true);
    assert.equal(effectiveStationRule(rules, 'FIS1', 'FTS999') !== undefined, true);
    assert.equal(effectiveStationRule(rules, 'FIS1', 'XFTS001'), undefined);
    assert.equal(effectiveStationRule(rules, 'FIS2', 'FTS001'), undefined);
    const withoutSingle = rules.filter(item => item.mode !== 'single');
    assert.equal(effectiveStationRule(withoutSingle, 'FIS1', 'FTS001') !== undefined, true);
    assert.equal(!!effectiveStationRule([], 'FIS1', 'FTS001'), false);
});
