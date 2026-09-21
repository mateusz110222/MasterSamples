import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
    title: string;
    value: string | number;
    subtext?: string;
    icon: LucideIcon;
    trend?: 'up' | 'down' | 'neutral';
    colorScheme?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'slate';
}

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    subtext,
    icon: Icon,
    colorScheme = 'indigo'
}) => {
    const colorStyles = {
        indigo: {
            bg: 'bg-indigo-500/10',
            border: 'border-indigo-500/20',
            iconColor: 'text-indigo-400',
            hoverBorder: 'hover:border-indigo-500/40'
        },
        emerald: {
            bg: 'bg-emerald-500/10',
            border: 'border-emerald-500/20',
            iconColor: 'text-emerald-400',
            hoverBorder: 'hover:border-emerald-500/40'
        },
        amber: {
            bg: 'bg-amber-500/10',
            border: 'border-amber-500/20',
            iconColor: 'text-amber-400',
            hoverBorder: 'hover:border-amber-500/40'
        },
        rose: {
            bg: 'bg-rose-500/10',
            border: 'border-rose-500/20',
            iconColor: 'text-rose-400',
            hoverBorder: 'hover:border-rose-500/40'
        },
        slate: {
            bg: 'bg-slate-800/40',
            border: 'border-slate-700/50',
            iconColor: 'text-slate-400',
            hoverBorder: 'hover:border-slate-600'
        }
    }[colorScheme];

    return (
        <div className={`bg-[#111827] border ${colorStyles.border} ${colorStyles.hoverBorder} p-5 rounded-2xl shadow-lg hover-lift group flex flex-col justify-between cursor-default`}>
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 group-hover:text-slate-300 transition-colors">{title}</span>
                <div className={`p-2.5 rounded-xl ${colorStyles.bg} border ${colorStyles.border} transition-transform duration-300 group-hover:scale-110`}>
                    <Icon className={colorStyles.iconColor} size={20} />
                </div>
            </div>
            <div className="mt-4">
                <div className="text-3xl font-extrabold text-white tracking-tight font-mono transition-transform duration-200 group-hover:translate-x-0.5">{value}</div>
                {subtext && <p className="text-xs text-slate-400 mt-1 font-medium">{subtext}</p>}
            </div>
        </div>
    );
};
