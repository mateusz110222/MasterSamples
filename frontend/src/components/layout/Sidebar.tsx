import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
    LayoutDashboard, 
    PlusCircle, 
    Cpu, 
    Mail, 
    History, 
    X,
    ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';

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

    const content = (
        <div className="flex flex-col h-full bg-[#0d1322] border-r border-[#1e293b] text-[#f9fafb] w-64 p-4 select-none">
            <div className="space-y-6">
                {/* Brand / Logo (PalletX style) */}
                <div className="flex items-center justify-between px-3 pt-2 pb-4 border-b border-[#1e293b]">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <span className="font-extrabold text-base tracking-wider text-white block uppercase">
                                Master Samples
                            </span>
                            <span className="text-[10px] font-mono tracking-widest text-indigo-400 uppercase font-semibold">
                                {t.brandSubtitle}
                            </span>
                        </div>
                    </div>
                    {/* Close button on mobile */}
                    <button
                        onClick={onMobileClose}
                        className="lg:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg cursor-pointer"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Navigation Links (PalletX style: uppercase, icon on left) */}
                <nav className="space-y-1.5">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.exact}
                            onClick={onMobileClose}
                            className={({ isActive }) => `
                                group flex items-center gap-3 px-3.5 py-3 rounded-xl text-xs font-bold tracking-wide transition-all duration-200
                                ${isActive 
                                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 border border-indigo-400/30' 
                                    : 'text-slate-400 hover:text-white hover:bg-[#161f32] hover:translate-x-1'
                                }
                            `}
                        >
                            <item.icon size={17} className="transition-transform duration-200 group-hover:scale-110" />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </div>
        </div>
    );

    return (
        <>
            <aside className="hidden lg:block shrink-0 sticky top-0 h-screen z-30">
                {content}
            </aside>

            {mobileOpen && (
                <div className="fixed inset-0 z-50 lg:hidden flex">
                    <div
                        className="fixed inset-0 bg-black/80 backdrop-blur-xs animate-modal-backdrop"
                        onClick={onMobileClose}
                        aria-hidden="true"
                    />
                    <div className="relative z-10 animate-drawer-in">
                        {content}
                    </div>
                </div>
            )}
        </>
    );
};
