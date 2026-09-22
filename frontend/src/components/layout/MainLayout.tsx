import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, UserCheck } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';

export const MainLayout: React.FC = () => {
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const location = useLocation();
    const { user, canEdit } = useAuth();
    const { language, setLanguage, t } = useLanguage();

    const getPageDetails = (pathname: string) => {
        switch (pathname) {
            case '/':
                return {
                    title: t.headerDashboardTitle,
                    sub: t.headerDashboardSub
                };
            case '/create':
                return {
                    title: t.headerCreateTitle,
                    sub: t.headerCreateSub
                };
            case '/blocked-machines':
                return {
                    title: t.headerBlockedTitle,
                    sub: t.headerBlockedSub
                };
            case '/admin/processes':
                return {
                    title: t.headerEngineersTitle,
                    sub: t.headerEngineersSub
                };
            case '/history':
                return {
                    title: t.headerHistoryTitle,
                    sub: t.headerHistorySub
                };
            default:
                return {
                    title: 'Master Samples Dashboard',
                    sub: 'Production Master Samples System'
                };
        }
    };

    const { title, sub } = getPageDetails(location.pathname);

    return (
        <div className="staff-screen flex min-h-screen flex-col bg-brand-bg font-sans text-brand-text selection:bg-brand-accent selection:text-brand-bg lg:flex-row">
            <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

            <main className="staff-main min-w-0 flex-1 space-y-6 p-4 sm:p-6 xl:p-8 w-full">
                <header className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-border/50 pb-4">
                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-xl border border-brand-border bg-brand-surface text-brand-accent transition-colors hover:bg-brand-surface-high lg:hidden"
                            aria-label="Open navigation"
                            aria-controls="mobile-navigation"
                            aria-expanded={mobileNavOpen}
                        >
                            <Menu size={22} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-extrabold text-brand-text">{title}</h1>
                            <p className="mt-1 text-xs font-medium text-brand-text-muted">{sub}</p>
                        </div>
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-4">
                        <div className="flex items-center rounded-xl border border-brand-border bg-brand-surface p-1 font-mono text-xs font-bold">
                            <button
                                type="button"
                                onClick={() => setLanguage('PL')}
                                className={`rounded-lg px-2.5 py-1 transition-colors ${
                                    language === 'PL' ? 'bg-brand-accent text-brand-text' : 'text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text'
                                }`}
                            >
                                PL
                            </button>
                            <button
                                type="button"
                                onClick={() => setLanguage('EN')}
                                className={`rounded-lg px-2.5 py-1 transition-colors ${
                                    language === 'EN' ? 'bg-brand-accent text-brand-text' : 'text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text'
                                }`}
                            >
                                EN
                            </button>
                        </div>

                        {user && (
                            <div className="flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-brand-border bg-brand-surface px-4 py-2">
                                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-brand-accent/30 bg-brand-accent/15 text-xs font-bold text-brand-accent">
                                    <UserCheck size={16} />
                                </div>
                                <div className="min-w-0 break-words text-left">
                                    <p className="flex items-center gap-1.5 text-xs font-black leading-tight text-brand-text">
                                        <span>{user.name || user.uid}</span>
                                        {canEdit && (
                                            <span className="rounded border border-emerald-500/30 bg-emerald-500/20 px-1 font-mono text-[10px] text-emerald-400">
                                                ADMIN
                                            </span>
                                        )}
                                    </p>
                                    <p className="font-mono text-[10px] leading-tight text-brand-text-muted">
                                        {user.email || (user.groups && user.groups.length > 0 ? user.groups.slice(0, 2).join(', ') : 'BLN - Production QA')}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                <div key={location.pathname} className="animate-page-enter">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};
