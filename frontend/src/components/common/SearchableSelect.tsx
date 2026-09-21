import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X, Check } from 'lucide-react';

export interface SelectOption {
    value: string;
    label: string;
    description?: string;
}

interface SearchableSelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    emptyText?: string;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = '-- Wybierz opcję --',
    disabled = false,
    required = false,
    className = '',
    emptyText = 'Brak pasujących wyników'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Currently selected option
    const selectedOption = useMemo(() => {
        return options.find(opt => opt.value === value) || null;
    }, [options, value]);

    // Filter options based on search query
    const filteredOptions = useMemo(() => {
        if (!searchQuery.trim()) return options;
        const q = searchQuery.toLowerCase().trim();
        return options.filter(opt => 
            opt.value.toLowerCase().includes(q) || 
            opt.label.toLowerCase().includes(q) ||
            (opt.description && opt.description.toLowerCase().includes(q))
        );
    }, [options, searchQuery]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearchQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Scroll highlighted item into view
    useEffect(() => {
        if (isOpen && highlightedIndex >= 0 && listRef.current) {
            const items = listRef.current.querySelectorAll('[role="option"]');
            if (items[highlightedIndex]) {
                (items[highlightedIndex] as HTMLElement).scrollIntoView({ block: 'nearest' });
            }
        }
    }, [highlightedIndex, isOpen]);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
        setSearchQuery('');
        setHighlightedIndex(-1);
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        onChange('');
        setSearchQuery('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                e.preventDefault();
                setIsOpen(true);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
                    handleSelect(filteredOptions[highlightedIndex].value);
                } else if (filteredOptions.length > 0) {
                    handleSelect(filteredOptions[0].value);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                setSearchQuery('');
                break;
        }
    };

    return (
        <div ref={containerRef} className={`relative select-none ${className}`} onKeyDown={handleKeyDown}>
            {/* Hidden input for HTML form validation */}
            {required && (
                <input
                    type="text"
                    tabIndex={-1}
                    value={value}
                    required={required}
                    onChange={() => {}}
                    className="opacity-0 absolute inset-0 pointer-events-none w-full h-full"
                />
            )}

            {/* Trigger Button */}
            <div
                onClick={() => !disabled && setIsOpen(prev => !prev)}
                className={`w-full min-h-[46px] px-3.5 py-2.5 bg-[#1f2937] border rounded-xl flex items-center justify-between gap-2 text-sm font-mono transition-all cursor-pointer ${
                    disabled 
                        ? 'opacity-50 cursor-not-allowed border-[#374151]' 
                        : isOpen 
                            ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md' 
                            : 'border-[#374151] hover:border-slate-500'
                }`}
            >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {selectedOption ? (
                        <div className="flex items-baseline gap-2 truncate">
                            <span className="font-bold text-white">{selectedOption.value}</span>
                            {selectedOption.description && selectedOption.description !== selectedOption.value && (
                                <span className="text-xs text-slate-400 font-sans truncate">
                                    — {selectedOption.description}
                                </span>
                            )}
                        </div>
                    ) : (
                        <span className="text-slate-500 font-sans">{placeholder}</span>
                    )}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                    {selectedOption && !disabled && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-1 text-slate-400 hover:text-white rounded-md transition-colors"
                            title="Wyczyść wybór"
                        >
                            <X size={14} />
                        </button>
                    )}
                    <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`} />
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 left-0 right-0 mt-1.5 bg-[#161f32] border border-[#374151] rounded-xl shadow-2xl overflow-hidden animate-scale-in">
                    {/* Search Input */}
                    <div className="p-2 border-b border-[#374151]/80 bg-[#111827]">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchQuery}
                                onChange={(e) => {
                                    setSearchQuery(e.target.value);
                                    setHighlightedIndex(0);
                                }}
                                placeholder="Wpisz, aby filtrować procesy..."
                                className="w-full pl-9 pr-8 py-2 bg-[#1f2937] border border-[#374151] rounded-lg text-xs text-white placeholder-slate-400 font-mono focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono px-1 pt-1.5 flex justify-between">
                            <span>Pasuje: {filteredOptions.length} z {options.length}</span>
                            {searchQuery && <span>Naciśnij Enter, aby wybrać</span>}
                        </div>
                    </div>

                    {/* Options List */}
                    <div ref={listRef} className="max-h-60 overflow-y-auto p-1.5 space-y-0.5" role="listbox">
                        {filteredOptions.length === 0 ? (
                            <div className="py-6 text-center text-xs text-slate-400 font-sans">
                                {emptyText} &quot;{searchQuery}&quot;
                            </div>
                        ) : (
                            filteredOptions.map((opt, idx) => {
                                const isSelected = opt.value === value;
                                const isHighlighted = idx === highlightedIndex;

                                return (
                                    <div
                                        key={opt.value}
                                        role="option"
                                        aria-selected={isSelected}
                                        onClick={() => handleSelect(opt.value)}
                                        onMouseEnter={() => setHighlightedIndex(idx)}
                                        className={`px-3 py-2 rounded-lg text-xs font-mono flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                            isSelected
                                                ? 'bg-indigo-600 text-white font-bold'
                                                : isHighlighted
                                                    ? 'bg-[#1f2937] text-white'
                                                    : 'text-slate-300 hover:bg-[#1f2937] hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-baseline gap-2 truncate">
                                            <span className="font-bold">{opt.value}</span>
                                            {opt.description && opt.description !== opt.value && (
                                                <span className={`text-[11px] font-sans truncate ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                                    — {opt.description}
                                                </span>
                                            )}
                                        </div>

                                        {isSelected && (
                                            <Check size={15} className="shrink-0 text-white" />
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
