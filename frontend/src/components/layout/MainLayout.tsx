import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Menu, User } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';

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
        <div className="flex min-h-screen bg-[#070b14] text-[#f9fafb] font-sans antialiased selection:bg-indigo-600 selection:text-white">
            <Sidebar mobileOpen={mobileNavOpen} onMobileClose={() => setMobileNavOpen(false)} />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar matching PalletX */}
                <header className="sticky top-0 z-20 bg-[#0c1220]/95 backdrop-blur-md border-b border-[#1e293b] px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setMobileNavOpen(true)}
                            className="lg:hidden p-2 rounded-xl border border-[#1e293b] bg-[#161f32] text-slate-300 hover:text-white cursor-pointer"
                            aria-label="Open navigation"
                        >
                            <Menu size={20} />
                        </button>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">{title}</h1>
                            <p className="text-xs text-slate-400 font-medium mt-0.5 hidden sm:block">{sub}</p>
                        </div>
                    </div>

                    {/* Top Right: Language Switcher & PalletX User Profile Card */}
                    <div className="flex items-center gap-3">
                        {/* Language Switcher Pill (PalletX style) */}
                        <div className="flex items-center bg-[#161f32] border border-[#1e293b] rounded-xl p-1 text-xs font-mono font-bold">
                            <button
                                type="button"
                                onClick={() => setLanguage('PL')}
                                className={`interactive-pill px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                    language === 'PL' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                PL PL
                            </button>
                            <button
                                type="button"
                                onClick={() => setLanguage('EN')}
                                className={`interactive-pill px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                                    language === 'EN' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                GB EN
                            </button>
                        </div>

                        {/* User Profile Card (PalletX style) */}
                        {user && (
                            <div className="flex items-center gap-3 bg-[#111827] border border-[#1e293b] px-3.5 py-2 rounded-xl shadow-md hover-lift transition-all">
                                <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-xs shrink-0">
                                    <User size={16} />
                                </div>
                                <div className="text-left leading-tight hidden md:block">
                                    <p className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                                        <span>{user.name || user.uid}</span>
                                        {canEdit && (
                                            <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1 rounded font-mono border border-emerald-500/30">
                                                ADMIN
                                            </span>
                                        )}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                                        {user.email || (user.groups && user.groups.length > 0 ? user.groups.slice(0, 2).join(', ') : 'BLN - Production QA')}
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </header>

                {/* Main View Area */}
                <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto space-y-6">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
