import React from 'react';

export type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'purple';

interface BadgeProps {
    variant?: BadgeVariant;
    children: React.ReactNode;
    className?: string;
    size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
    variant = 'neutral',
    children,
    className = '',
    size = 'sm'
}) => {
    const variantStyles = {
        success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
        danger: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
        warning: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        info: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
        purple: 'bg-brand-accent/15 text-brand-accent border-brand-accent/30',
        neutral: 'bg-brand-surface-high text-brand-text border-brand-border',
    }[variant];

    const sizeStyles = {
        sm: 'text-[11px] px-2 py-0.5',
        md: 'text-xs px-2.5 py-1',
    }[size];

    return (
        <span className={`inline-flex items-center gap-1 font-semibold rounded-md border tracking-wide font-mono transition-transform duration-150 hover:scale-105 select-none ${variantStyles} ${sizeStyles} ${className}`}>
            {children}
        </span>
    );
};
