import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import type { ProcessTagItem } from '../../types';
import { useLanguage } from '../../i18n/useLanguage';
import { useExitPresence } from '../../hooks/useExitPresence';

export const TagCombobox = ({
    options,
    value,
    onChange,
    label,
    placeholder,
    isLoading,
    hasError,
    messages,
}: {
    options: ProcessTagItem[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder: string;
    isLoading: boolean;
    hasError: boolean;
    messages?: { loading: string; empty: string; list: string; clear: string; open: string; close: string };
}) => {
    const { t } = useLanguage();
    const inputId = useId();
    const listId = useId();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const listMounted = useExitPresence(isOpen, 120);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(-1);
    const filtered = useMemo(() => {
        const search = query.trim().toLocaleLowerCase();
        return search
            ? options.filter(option => option.key.toLocaleLowerCase().includes(search))
            : options;
    }, [options, query]);

    useEffect(() => {
        if (!isOpen) return;
        const closeOnOutsideClick = (event: PointerEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsideClick);
        return () => document.removeEventListener('pointerdown', closeOnOutsideClick);
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && activeIndex >= 0) {
            document.getElementById(`${listId}-option-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, isOpen, listId]);

    const choose = (key: string) => {
        onChange(key);
        setQuery('');
        setIsOpen(false);
        setActiveIndex(-1);
    };

    const handleClear = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        onChange('');
        setQuery('');
        setIsOpen(false);
        setActiveIndex(-1);
        inputRef.current?.blur();
    };

    const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!isOpen) {
                setIsOpen(true);
                setQuery('');
                setActiveIndex(event.key === 'ArrowDown' ? 0 : options.length - 1);
            } else if (filtered.length > 0) {
                setActiveIndex(index => event.key === 'ArrowDown'
                    ? (index + 1) % filtered.length
                    : (index <= 0 ? filtered.length - 1 : index - 1));
            }
        } else if (event.key === 'Enter' && isOpen) {
            event.preventDefault();
            const option = filtered[activeIndex >= 0 ? activeIndex : 0];
            if (option) choose(option.key);
        } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            setIsOpen(false);
            setQuery('');
            setActiveIndex(-1);
        }
    };

    return (
        <div ref={containerRef} className={`relative ${listMounted ? 'z-40' : 'z-20'}`} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) setIsOpen(false);
        }}>
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-brand-text">
                {label} <span className="text-rose-400">*</span>
            </label>
            <div className={`flex h-12 items-center rounded-xl border bg-brand-surface-high px-3 transition-colors ${isOpen ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-brand-border hover:border-brand-text-muted/60'}`}>
                <Search size={16} className="mr-2 shrink-0 text-brand-text-muted" aria-hidden="true" />
                <input
                    ref={inputRef}
                    id={inputId}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    aria-activedescendant={isOpen && activeIndex >= 0 && filtered[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
                    autoComplete="off"
                    title={value || undefined}
                    value={isOpen ? query : value}
                    placeholder={isLoading ? (messages?.loading ?? t.loadingProcesses) : placeholder}
                    disabled={isLoading || hasError}
                    onFocus={() => { setIsOpen(true); setQuery(''); setActiveIndex(-1); }}
                    onPointerDown={() => {
                        if (document.activeElement === inputRef.current) {
                            setIsOpen(open => !open);
                            setQuery('');
                            setActiveIndex(-1);
                        }
                    }}
                    onChange={event => { setQuery(event.target.value); setIsOpen(true); setActiveIndex(-1); }}
                    onKeyDown={handleKeyDown}
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-brand-text placeholder-brand-text-muted outline-none disabled:opacity-60"
                />
                {(value || query) && (
                    <button
                        type="button"
                        aria-label={(messages?.clear ?? t.processClear)}
                        title={(messages?.clear ?? t.processClear)}
                        onMouseDown={event => {
                            event.preventDefault();
                            event.stopPropagation();
                        }}
                        onClick={handleClear}
                        className="rounded-md p-1 text-brand-text-muted hover:bg-brand-border hover:text-brand-text cursor-pointer transition-colors"
                    >
                        <X size={16} />
                    </button>
                )}
                <button type="button" tabIndex={-1} aria-label={isOpen ? (messages?.close ?? t.processCloseList) : (messages?.open ?? t.processOpenList)} onMouseDown={event => event.preventDefault()} onClick={() => { inputRef.current?.focus(); setIsOpen(!isOpen); setQuery(''); setActiveIndex(-1); }} className="ml-1 rounded-md p-1 text-brand-text-muted hover:bg-brand-border hover:text-brand-text"><ChevronDown size={17} className={isOpen ? 'rotate-180' : ''} /></button>
            </div>
            {listMounted && (
                <div id={listId} role="listbox" inert={!isOpen} aria-hidden={!isOpen} aria-label={(messages?.list ?? t.processList)} className={`absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-brand-border bg-brand-surface-high p-1.5 shadow-2xl shadow-black/60 ${isOpen ? 'animate-dropdown-in' : 'animate-dropdown-out'}`}>
                    {filtered.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-brand-text-muted">{isLoading ? (messages?.loading ?? t.loadingProcesses) : (messages?.empty ?? t.processNoMatches)}</p>
                    ) : filtered.map((option, index) => (
                        <div
                            key={option.key}
                            id={`${listId}-option-${index}`}
                            role="option"
                            aria-selected={option.key === value}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => choose(option.key)}
                            title={option.key}
                            className={`cursor-pointer rounded-lg px-3 py-2 text-sm whitespace-normal [overflow-wrap:anywhere] ${index === activeIndex ? 'bg-brand-accent/30 text-white' : 'text-brand-text hover:bg-brand-accent/20'}`}
                        >
                            <span className="font-mono font-bold">{option.key}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
