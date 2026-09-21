import React from 'react';

interface ProgressBarProps {
    current: number;
    max: number;
    type?: 'counter' | 'error';
    showLabels?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
    current,
    max,
    type = 'counter',
    showLabels = true
}) => {
    const validMax = max > 0 ? max : 1;
    const percentage = Math.min(100, Math.max(0, Math.round((current / validMax) * 100)));

    let colorClass = 'bg-emerald-500';
    let textClass = 'text-emerald-400';

    if (type === 'counter') {
        if (percentage >= 90) {
            colorClass = 'bg-rose-500';
            textClass = 'text-rose-400';
        } else if (percentage >= 75) {
            colorClass = 'bg-amber-500';
            textClass = 'text-amber-400';
        } else {
            colorClass = 'bg-indigo-500';
            textClass = 'text-indigo-400';
        }
    } else {
        // Error counter
        if (current > 0) {
            colorClass = percentage >= 80 ? 'bg-rose-600' : 'bg-amber-500';
            textClass = percentage >= 80 ? 'text-rose-400' : 'text-amber-400';
        } else {
            colorClass = 'bg-slate-600';
            textClass = 'text-slate-400';
        }
    }

    return (
        <div className="w-full space-y-1">
            {showLabels && (
                <div className="flex justify-between items-center text-xs font-mono">
                    <span className="text-slate-300 font-medium">
                        {current} <span className="text-slate-500">/ {max}</span>
                    </span>
                    <span className={`font-bold transition-colors duration-300 ${textClass}`}>
                        {percentage}%
                    </span>
                </div>
            )}
            <div className="w-full h-2 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50 p-[1px]">
                <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${colorClass} ${
                        percentage >= 80 ? 'shadow-xs shadow-current' : ''
                    }`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};
