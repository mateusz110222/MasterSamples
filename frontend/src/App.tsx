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
import { LoginView } from './views/LoginView';
import { RequireAuth } from './auth/RequireAuth';
import { RequireEdit } from './auth/RequireEdit';

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
                            <Route path="/login" element={<LoginView />} />
                            <Route
                                element={
                                    <RequireAuth>
                                        <MainLayout />
                                    </RequireAuth>
                                }
                            >
                                <Route path="/" element={<DashboardView />} />
                                <Route path="/create" element={<RequireEdit><CreateMasterView /></RequireEdit>} />
                                <Route path="/blocked-machines" element={<BlockedMachinesView />} />
                                <Route path="/admin/processes" element={<RequireEdit><EngineersView /></RequireEdit>} />
                                <Route path="/history" element={<HistoryView />} />
                            </Route>
                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Router>
                </AuthProvider>
            </LanguageProvider>
        </QueryClientProvider>
    );
};

export default App;
