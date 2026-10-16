import { formatMessage } from '../../lib/templateText';
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useLanguage } from '../../i18n/useLanguage';
import { useExitPresence } from '../../hooks/useExitPresence';
import { X, Search, ChevronDown } from 'lucide-react';

export const PnCombobox = ({
    options,
    value,
    onChange,
    label,
    placeholder,
    isLoading,
    hasError,
    invalid,
}: {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder: string;
    isLoading: boolean;
    hasError: boolean;
    invalid: boolean;
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
            ? options.filter(option => option.toLocaleLowerCase().includes(search))
            : options;
    }, [options, query]);
    const visibleOptions = filtered.slice(0, 150);

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
        setQuery(key);
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
                setActiveIndex(event.key === 'ArrowDown' ? (options.length ? 0 : -1) : Math.min(options.length, 150) - 1);
            } else if (visibleOptions.length > 0) {
                setActiveIndex(index => event.key === 'ArrowDown'
                    ? (index + 1) % visibleOptions.length
                    : (index <= 0 ? visibleOptions.length - 1 : index - 1));
            }
        } else if (event.key === 'Enter' && isOpen) {
            event.preventDefault();
            // A highlighted suggestion wins; otherwise keep the number typed by the user.
            choose(activeIndex >= 0 ? visibleOptions[activeIndex] : query.trim());
        } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            setIsOpen(false);
            setQuery(value);
            setActiveIndex(-1);
        }
    };

    return (
        <div ref={containerRef} className={`relative ${listMounted ? 'z-30' : 'z-10'}`} onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsOpen(false);
                setQuery(value);
            }
        }}>
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-brand-text">
                {label} <span className="text-rose-400">*</span>
            </label>
            <div className={`flex h-12 items-center rounded-xl border bg-brand-surface-high px-3 transition-colors ${invalid ? 'border-rose-400 ring-2 ring-rose-400/20' : isOpen ? 'border-brand-accent ring-2 ring-brand-accent/20' : 'border-brand-border hover:border-brand-text-muted/60'}`}>
                <Search size={16} className="mr-2 shrink-0 text-brand-text-muted" aria-hidden="true" />
                <input
                    ref={inputRef}
                    id={inputId}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-invalid={invalid}
                    aria-controls={listId}
                    aria-activedescendant={isOpen && activeIndex >= 0 && visibleOptions[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
                    autoComplete="off"
                    value={isOpen ? query : value}
                    placeholder={placeholder}
                    onFocus={() => { setIsOpen(true); setQuery(value); setActiveIndex(-1); }}
                    onChange={event => {
                        setQuery(event.target.value);
                        onChange(event.target.value);
                        setIsOpen(true);
                        setActiveIndex(-1);
                    }}
                    onKeyDown={handleKeyDown}
                    className="min-w-0 flex-1 bg-transparent font-mono text-sm text-brand-text placeholder-brand-text-muted outline-none disabled:opacity-60"
                />
                {(value || query) && (
                    <button
                        type="button"
                        aria-label={t.pnClear}
                        title={t.pnClear}
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
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label={isOpen ? t.pnCloseList : t.pnOpenList}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => {
                        if (isOpen) {
                            setIsOpen(false);
                        } else {
                            inputRef.current?.focus();
                            setQuery('');
                            setIsOpen(true);
                        }
                        setActiveIndex(-1);
                    }}
                    className="ml-1 rounded-md p-1 text-brand-text-muted hover:bg-brand-border hover:text-brand-text"
                >
                    <ChevronDown size={17} className={isOpen ? 'rotate-180' : ''} />
                </button>
            </div>
            {listMounted && (
                <div id={listId} role="listbox" inert={!isOpen} aria-hidden={!isOpen} aria-label={t.pnList} className={`absolute z-50 mt-1.5 max-h-64 w-full overflow-y-auto rounded-xl border border-brand-border bg-brand-surface-high p-1.5 shadow-2xl shadow-black/60 ${isOpen ? 'animate-dropdown-in' : 'animate-dropdown-out'}`}>
                    {filtered.length === 0 ? (
                        <p className="px-3 py-3 text-sm text-brand-text-muted">
                            {isLoading ? t.pnLoadingManual : hasError ? t.pnUnavailableManual : t.pnNoMatchesManual}
                        </p>
                    ) : (
                        visibleOptions.map((pn, index) => (
                            <div
                                key={pn}
                                id={`${listId}-option-${index}`}
                                role="option"
                                aria-selected={pn === value}
                                onMouseDown={event => event.preventDefault()}
                                onClick={() => choose(pn)}
                                className={`cursor-pointer rounded-lg px-3 py-2 text-sm ${index === activeIndex ? 'bg-brand-accent/30 text-white' : 'text-brand-text hover:bg-brand-accent/20'}`}
                            >
                                <span className="font-mono font-bold">{pn}</span>
                            </div>
                        ))
                    )}
                    {filtered.length > 150 && (
                        <p className="px-3 py-2 text-xs text-brand-text-muted font-mono text-center border-t border-brand-border/40">
                            {formatMessage(t.pnMoreResults, { count: filtered.length - 150 })}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};
