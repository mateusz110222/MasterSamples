import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './auth/AuthContext';
import { LanguageProvider } from './i18n/LanguageContext';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardView } from './views/DashboardView';
import { CreateMasterView } from './views/CreateMasterView';
import { BlockedMachinesView } from './views/BlockedMachinesView';
import { EngineersView } from './views/EngineersView';
import { HistoryView } from './views/HistoryView';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 10000,
        },
    },
});

export const App: React.FC = () => {
    return (
        <QueryClientProvider client={queryClient}>
            <LanguageProvider>
                <AuthProvider>
                    <Router>
                        <Routes>
                            <Route path="/" element={<MainLayout />}>
                                <Route index element={<DashboardView />} />
                                <Route path="create" element={<CreateMasterView />} />
                                <Route path="blocked-machines" element={<BlockedMachinesView />} />
                                <Route path="admin/processes" element={<EngineersView />} />
                                <Route path="history" element={<HistoryView />} />
                                <Route path="*" element={<Navigate to="/" replace />} />
                            </Route>
                        </Routes>
                    </Router>
                </AuthProvider>
            </LanguageProvider>
        </QueryClientProvider>
    );
};

export default App;
