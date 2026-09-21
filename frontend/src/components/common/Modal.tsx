import React, { useEffect } from 'react';
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
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const maxWidthClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl'
    }[maxWidth];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-sm animate-modal-backdrop">
            <div 
                className="fixed inset-0 cursor-pointer" 
                onClick={onClose} 
                aria-hidden="true" 
            />
            
            <div className={`relative w-full ${maxWidthClasses} bg-[#111827] border border-[#374151] rounded-2xl shadow-2xl shadow-black/60 p-6 overflow-hidden z-10 space-y-5 text-[#f9fafb] animate-modal-pop`}>
                <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#374151]/60">
                    <div>
                        <h3 className="text-lg font-bold tracking-tight text-white">{title}</h3>
                        {description && (
                            <p className="text-xs text-[#94a3b8] mt-1">{description}</p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-xl text-[#94a3b8] hover:text-white hover:bg-[#1f2937] transition-all duration-200 hover:rotate-90 active:scale-90 cursor-pointer"
                        aria-label="Close"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="max-h-[75vh] overflow-y-auto pr-1">
                    {children}
                </div>
            </div>
        </div>
    );
};
