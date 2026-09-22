import React from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    PlusCircle,
    Cpu,
    Mail,
    History,
    X,
} from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';

interface SidebarProps {
    mobileOpen: boolean;
    onMobileClose: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ mobileOpen, onMobileClose }) => {
    const { canEdit } = useAuth();
    const { t } = useLanguage();

    const navItems = [
        { to: '/', label: t.navDashboard, icon: LayoutDashboard, exact: true },
        ...(canEdit ? [{ to: '/create', label: t.navCreate, icon: PlusCircle, exact: false }] : []),
        { to: '/blocked-machines', label: t.navBlocked, icon: Cpu, exact: false },
        ...(canEdit ? [{ to: '/admin/processes', label: t.navEngineers, icon: Mail, exact: false }] : []),
        { to: '/history', label: t.navHistory, icon: History, exact: false },
    ];

    const navigation = (onNavigate?: () => void) => (
        <nav className="flex-1 space-y-1 overflow-y-auto p-4">
            {navItems.map((item) => (
                <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                        `app-nav-link flex w-full items-center gap-3 rounded px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all ${
                            isActive
                                ? 'border-l-4 border-brand-accent bg-brand-accent/15 text-brand-accent'
                                : 'text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text'
                        }`
                    }
                >
                    <item.icon size={16} className="shrink-0" />
                    {item.label}
                </NavLink>
            ))}
        </nav>
    );

    return (
        <>
            <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-brand-border bg-brand-surface lg:flex">
                <div className="border-b border-brand-border p-6">
                    <span className="text-lg font-black tracking-wider text-brand-accent">MASTER SAMPLES</span>
                    <span className="mt-1 block font-mono text-[10px] font-semibold uppercase tracking-widest text-brand-text-muted">{t.brandSubtitle}</span>
                </div>
                {navigation()}
            </aside>

            {mobileOpen && (
                <div className="lg:hidden">
                    <button
                        type="button"
                        className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm"
                        onClick={onMobileClose}
                        aria-label="Close navigation"
                    />
                    <aside
                        id="mobile-navigation"
                        className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col border-r border-brand-border bg-brand-surface shadow-2xl animate-drawer-in"
                    >
                        <div className="flex items-center justify-between border-b border-brand-border p-5">
                            <span className="text-lg font-black tracking-wider text-brand-accent">MASTER SAMPLES</span>
                            <button
                                type="button"
                                onClick={onMobileClose}
                                className="flex size-10 items-center justify-center rounded-lg border border-brand-border text-brand-text-muted hover:bg-brand-surface-high hover:text-brand-text"
                                aria-label="Close navigation"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        {navigation(onMobileClose)}
                    </aside>
                </div>
            )}
        </>
    );
};
