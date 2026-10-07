import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('all named CSS animations have keyframes, including drawer enter and exit', () => {
    const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    const defined = new Set(Array.from(css.matchAll(/@keyframes\s+([\w-]+)/g), match => match[1]));
    const used = Array.from(css.matchAll(/animation:\s*([\w-]+)/g), match => match[1]);
    for (const name of used) if (name !== 'none') assert.ok(defined.has(name), `Missing @keyframes ${name}`);
    for (const name of ['drawerIn', 'drawerOut', 'dropdownIn', 'dropdownOut']) assert.ok(defined.has(name));
});
