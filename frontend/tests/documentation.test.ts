import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { getDocumentation, searchDocumentation } from '../src/documentation/content.ts';

test('documentation searches body text, tables and API examples with accent-insensitive multiword queries', () => {
    const sections = getDocumentation('PL');
    assert.ok(searchDocumentation(sections, 'licznik globalny').some(section => section.id === 'master-actions'));
    assert.ok(searchDocumentation(sections, 'bledow').some(section => section.id === 'counters'));
    assert.ok(searchDocumentation(sections, 'SetStationBlocking prefix').some(section => section.id === 'architecture'));
    assert.ok(searchDocumentation(sections, 'BRAK   UPRAWNIEN').some(section => section.id === 'getting-started'));
    assert.deepEqual(searchDocumentation(sections, 'nonexistent-documentation-term'), []);
    assert.equal(searchDocumentation(sections, '  ').length, sections.length);
});

test('language changes preserve deep-link identifiers and search only the selected language', () => {
    const polish = getDocumentation('PL');
    const english = getDocumentation('EN');
    assert.deepEqual(polish.map(section => section.id), english.map(section => section.id));
    assert.equal(new Set(polish.map(section => section.id)).size, polish.length);
    assert.ok(searchDocumentation(english, 'reached limits').some(section => section.id === 'counters'));
    assert.deepEqual(searchDocumentation(english, 'pierwsze kroki'), []);
    assert.equal(polish.find(section => section.id === 'create-master')?.link?.edit, true);
});

test('standalone HTML embeds current bilingual content and executable script without external resources', () => {
    execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-documentation.mjs', import.meta.url)), '--check']);
    const html = readFileSync(new URL('../../docs/MasterSamples.html', import.meta.url), 'utf8');
    const payload = html.match(/<script id="offline-content" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(payload);
    assert.deepEqual(JSON.parse(payload), JSON.parse(JSON.stringify({ PL: getDocumentation('PL'), EN: getDocumentation('EN') })));
    const executable = html.match(/<\/script><script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(executable);
    assert.doesNotThrow(() => new Script(executable));
    assert.doesNotMatch(html, /<(?:script|img|iframe)[^>]+src\s*=|<link\b[^>]+href\s*=|@import\b|url\(\s*['"]?https?:/i);
    assert.ok(html.includes('001_initial_schema.sql'));
    assert.ok(html.includes('loadcstpkgs'));
    assert.doesNotMatch(html, /20261006_station_blocking|20260930_history_fis/);
});
