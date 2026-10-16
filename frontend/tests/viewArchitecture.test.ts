import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const viewsDirectory = new URL('../src/views/', import.meta.url);

test('every page delegates state and business operations to a controller hook', () => {
    const files = readdirSync(viewsDirectory).filter(file => file.endsWith('View.tsx'));
    assert.ok(files.length > 0);
    for (const file of files) {
        const source = readFileSync(new URL(file, viewsDirectory), 'utf8');
        assert.match(source, /from ['"]\.\.\/hooks\/use\w+['"]/, `${file} has no controller hook`);
        assert.doesNotMatch(source, /\b(?:useState|useReducer|useEffect|useLayoutEffect|useMemo|useQuery|useQueries|useMutation|useQueryClient|useAuth|useNavigate|useSearchParams)\s*\(/, `${file} owns application state`);
        assert.doesNotMatch(source, /import\s+(?!type\b)[^;]+from\s+['"]\.\.\/api\//, `${file} accesses the API layer`);
        assert.doesNotMatch(source, /\.mutate(?:Async)?\s*\(|\.filter\s*\(|\.sort\s*\(|\.toUpperCase\s*\(/, `${file} performs business operations`);
    }
});
