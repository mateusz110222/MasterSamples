import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { createServer } from 'vite';

test('page hooks preserve seeded data, URL filters, routing and admin access', async () => {
    const server = await createServer({ configFile: false, ssr: { external: ['react', 'react-dom', 'react-router', '@tanstack/react-query'] }, optimizeDeps: { noDiscovery: true, include: [] }, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom' });
    const originalStorage = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => 'PL' } as Storage;
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
    try {
        const { LanguageProvider } = await server.ssrLoadModule('/src/i18n/LanguageContext.tsx');
        const { AuthContext } = await server.ssrLoadModule('/src/auth/auth-context.ts');
        const master = { id: 1, unit: 'SN-001', process: 'SMT, AOI', status: 'GOOD', currentCounter: 90, maxCounter: 100, errorCounter: 1, errorMaxCounter: 10, globalCounter: 91, user: 'operator', isactive: 1, FIS: 'FIS1' };
        client.setQueryData(['masters'], [master]);
        client.setQueryData(['blockedMachines', 'FIS1'], [{ machine: 'CON01', filename: 'CON01_MASTER', prefix: 'MASTER', FIS: 'FIS1' }]);
        client.setQueryData(['blockedMachines', 'FIS2'], []);
        client.setQueryData(['engineers'], [{ id: 1, process: 'SMT', mail: 'operator@example.test' }]);
        client.setQueryData(['mails'], [{ id: 1, name: 'Operator', mail: 'operator@example.test' }]);
        client.setQueryData(['processTags', 'FIS1'], [{ key: 'SMT', description: 'SMT' }]);
        client.setQueryData(['stationTags', 'FIS1'], [{ key: 'CON01', description: 'CON01' }]);
        client.setQueryData(['stationTags', 'FIS2'], []);
        client.setQueryData(['stationBlocking', 'FIS1'], [{ station: 'ALL', mode: 'fis', disabled: true, FIS: 'FIS1', user: 'operator', date: '' }]);
        client.setQueryData(['stationBlocking', 'FIS2'], []);
        const historyKey = JSON.stringify(['', '', '', '', '', '', '', 50]);
        client.setQueryData(['history', historyKey, 1], { records: [{ unit: 'CON01', operation: 'DisableStationBlocking', process: 'BLOCKING_POLICY:fis', status: 'DISABLED', FIS: 'FIS1', user: 'operator', date: '2026-10-09' }], total: 1 });
        let captured: any;
        let activeHook: () => unknown;
        function Probe() { captured = activeHook(); return null; }
        const admin = { uid: 'operator', name: 'Operator', groups: ['admin_group'], canEdit: true };
        const auth = { user: admin, canEdit: true, isGuest: false, isAuthenticated: true, isLoading: false };
        function inspect(hook: () => unknown, route = '/') {
            activeHook = hook;
            renderToString(createElement(MemoryRouter, { initialEntries: [route] }, createElement(QueryClientProvider, { client }, createElement(AuthContext.Provider, { value: auth }, createElement(LanguageProvider, null, createElement(Probe))))));
            return captured;
        }
        const dashboard = inspect((await server.ssrLoadModule('/src/hooks/useDashboard.ts')).useDashboard, '/?process=AOI');
        assert.equal(dashboard.stats.total, 1);
        assert.equal(dashboard.selectedProcess, 'AOI');
        assert.equal(dashboard.dashboardRows[0].usagePercent, 90);
        assert.equal(dashboard.dashboardRows[0].isLimitExceeded, false);
        const history = inspect((await server.ssrLoadModule('/src/hooks/useHistory.ts')).useHistory);
        assert.equal(history.historyRows[0].dashboardUrl, '/admin/station-blocking');
        assert.equal(history.historyRows[0].fisHistoryUrl, null);
        assert.equal(history.historyRows[0].statusLabel, 'Blokowanie wyłączone');
        const blockingHook = (await server.ssrLoadModule('/src/hooks/useStationBlocking.ts')).useStationBlocking;
        const blocking = inspect(blockingHook);
        assert.equal(blocking.overrideCards[0].current, 'off');
        assert.equal(blocking.overrideCards[0].options.find((option: any) => option.value === 'on').disabled, false);
        auth.user = { ...admin, groups: ['testeng'] };
        const readOnlyOverride = inspect(blockingHook);
        assert.equal(readOnlyOverride.overrideCards.every((card: any) => card.options.every((option: any) => option.disabled)), true);
        const blocked = inspect((await server.ssrLoadModule('/src/hooks/useBlockedMachines.ts')).useBlockedMachines);
        assert.equal(blocked.filteredMachines[0].machine, 'CON01');
        const engineers = inspect((await server.ssrLoadModule('/src/hooks/useEngineersView.ts')).useEngineersView);
        assert.deepEqual(engineers.emailSuggestions, ['operator@example.test']);
        const create = inspect((await server.ssrLoadModule('/src/hooks/useCreateMaster.ts')).useCreateMaster);
        assert.equal(create.selectedFis, 'FIS1');
        assert.equal(create.processTags[0].key, 'SMT');
        const docs = inspect((await server.ssrLoadModule('/src/hooks/useDocumentation.ts')).useDocumentation, '/documentation?section=station-locks');
        assert.equal(docs.selected.id, 'station-locks');
        assert.ok(docs.sectionGroups.every((group: any) => group.sections.every((section: any) => section.group === group.group)));
        const login = inspect((await server.ssrLoadModule('/src/hooks/useLogin.ts')).useLogin);
        assert.equal(login.canSubmit, false);
    } finally {
        client.clear();
        globalThis.localStorage = originalStorage;
        await server.close();
    }
});
