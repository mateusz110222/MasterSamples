import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children: React.ReactNode;
    maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    description,
    children,
    maxWidth = 'md'
}) => {
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
                className={`relative w-full ${maxWidthClasses} bg-brand-surface border border-brand-border/80 rounded-2xl shadow-2xl shadow-black/80 p-6 overflow-hidden z-10 space-y-5 text-brand-text my-auto ${
                    isExiting ? 'animate-modal-pop-out' : 'animate-modal-pop'
                }`}
            >
                <div className="flex items-start justify-between gap-4 pb-3 border-b border-brand-border/60">
                    <div>
                        <h3 id={titleId} className="text-lg font-bold tracking-tight text-brand-text">
                            {isOpen ? title : cachedContent.title}
                        </h3>
                        {(isOpen ? description : cachedContent.description) && (
                            <p id={descriptionId} className="text-xs text-brand-text-muted mt-1">
                                {isOpen ? description : cachedContent.description}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-brand-text-muted hover:text-brand-text hover:bg-brand-surface-high transition-all duration-200 hover:rotate-90 active:scale-90 cursor-pointer"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="max-h-[75vh] overflow-y-auto pr-1">
                    {isOpen ? children : cachedContent.children}
                </div>
            </div>
        </div>,
        document.body
    );
};
