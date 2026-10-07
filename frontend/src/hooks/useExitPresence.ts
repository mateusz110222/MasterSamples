import { useEffect, useState } from 'react';

/** Keep an overlay mounted until its CSS exit animation finishes. */
export function useExitPresence(open: boolean, duration = 200): boolean {
    const [previousOpen, setPreviousOpen] = useState(open);
    const [mounted, setMounted] = useState(open);
    if (previousOpen !== open) {
        setPreviousOpen(open);
        if (open) setMounted(true);
    }
    useEffect(() => {
        if (open || !mounted) return;
        const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : duration;
        const timer = window.setTimeout(() => setMounted(false), delay);
        return () => window.clearTimeout(timer);
    }, [open, mounted, duration]);
    return open || mounted;
}
