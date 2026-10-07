import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useLanguage } from '../../i18n/useLanguage';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    description?: React.ReactNode;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
    appearance?: 'default' | 'panel';
    headerIcon?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    description,
    children,
    maxWidth = 'md',
    appearance = 'default',
    headerIcon,
}) => {
    const { t } = useLanguage();
    const dialogRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    const titleId = useId();
    const descriptionId = useId();

    const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
    const [isMounted, setIsMounted] = React.useState(isOpen);
    const [isExiting, setIsExiting] = React.useState(false);
    const [cachedContent, setCachedContent] = React.useState({ title, description, children });

    if (isOpen) {
        if (!isMounted) setIsMounted(true);
        if (isExiting) setIsExiting(false);
        if (
            cachedContent.title !== title ||
            cachedContent.description !== description ||
            cachedContent.children !== children
        ) {
            setCachedContent({ title, description, children });
        }
    }

    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (!isOpen && isMounted) {
            setIsExiting(true);
        }
    }

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (isExiting) {
            const timer = setTimeout(() => {
                setIsMounted(false);
                setIsExiting(false);
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [isExiting]);

    useEffect(() => {
        if (!isMounted) return;

        const previouslyFocused = document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onCloseRef.current();
                return;
            }

            if (e.key === 'Tab' && dialogRef.current) {
                const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
                ));
                if (focusable.length === 0) {
                    e.preventDefault();
                    dialogRef.current.focus();
                    return;
                }

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const animationFrame = window.requestAnimationFrame(() => dialogRef.current?.focus());

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.cancelAnimationFrame(animationFrame);
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = originalOverflow;
            previouslyFocused?.focus();
        };
    }, [isMounted]);

    if (!isMounted) return null;

    const maxWidthClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl'
    }[maxWidth];

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-sm ${
            isExiting ? 'animate-modal-backdrop-out' : 'animate-modal-backdrop'
        }`}>
            <div
                className="fixed inset-0 cursor-pointer"
                onClick={onClose}
                aria-hidden="true"
            />

            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                aria-describedby={description ? descriptionId : undefined}
                tabIndex={-1}
                className={`relative w-full ${maxWidthClasses} bg-brand-surface border border-brand-border/80 shadow-2xl shadow-black/80 overflow-hidden z-10 text-brand-text my-auto ${appearance === 'panel' ? 'rounded-3xl' : 'rounded-2xl p-6 space-y-5'} ${
                    isExiting ? 'animate-modal-pop-out' : 'animate-modal-pop'
                }`}
            >
                <div className={`flex justify-between gap-4 border-b border-brand-border/60 ${appearance === 'panel' ? 'items-center bg-brand-surface-high p-6' : 'items-start pb-3'}`}>
                    <div className={`flex min-w-0 flex-1 gap-2.5 ${appearance === 'panel' ? 'items-center' : 'items-start'}`}>
                        {headerIcon && <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-brand-accent/20 bg-brand-accent/10 text-brand-accent shadow-inner">{headerIcon}</span>}
                        <div className="min-w-0 flex-1">
                        <h3 id={titleId} className={appearance === 'panel' ? 'text-sm font-black uppercase tracking-widest text-brand-text break-words' : 'text-lg font-bold tracking-tight text-brand-text'}>
                            {isOpen ? title : cachedContent.title}
                        </h3>
                        {(isOpen ? description : cachedContent.description) && (
                            <p id={descriptionId} className="text-xs text-brand-text-muted mt-1">
                                {isOpen ? description : cachedContent.description}
                            </p>
                        )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-brand-text-muted transition-all duration-200 active:scale-90 cursor-pointer ${appearance === 'panel' ? 'hover:text-red-400 hover:bg-red-500/10' : 'hover:text-brand-text hover:bg-brand-surface-high hover:rotate-90'}`}
                        aria-label={t.closeDialog}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className={`max-h-[75vh] overflow-y-auto ${appearance === 'panel' ? 'p-6' : 'pr-1'}`}>
                    {isOpen ? children : cachedContent.children}
                </div>
            </div>
        </div>,
        document.body
    );
};
