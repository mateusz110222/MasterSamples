import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Mail, Search } from 'lucide-react';
import { useLanguage } from '../../i18n/useLanguage';

interface EmailComboboxProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    label: string;
    placeholder: string;
    required?: boolean;
}

export function EmailCombobox({ options, value, onChange, label, placeholder, required = false }: EmailComboboxProps) {
    const { t } = useLanguage();
    const inputId = useId();
    const listId = useId();
    const hintId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [isFiltering, setIsFiltering] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const filtered = useMemo(() => {
        const query = isFiltering ? value.trim().toLocaleLowerCase() : '';
        return query ? options.filter(option => option.toLocaleLowerCase().includes(query)) : options;
    }, [options, value, isFiltering]);

    useEffect(() => {
        if (isOpen && activeIndex >= 0) {
            listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
        }
    }, [activeIndex, isOpen]);

    const close = () => {
        setIsOpen(false);
        setActiveIndex(-1);
        setIsFiltering(false);
    };

    const choose = (email: string) => {
        onChange(email);
        close();
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            if (filtered.length > 0) {
                setActiveIndex(index => event.key === 'ArrowDown'
                    ? (index + 1) % filtered.length
                    : (index <= 0 ? filtered.length - 1 : index - 1));
            }
        } else if (event.key === 'Enter' && isOpen && filtered[activeIndex]) {
            event.preventDefault();
            choose(filtered[activeIndex]);
        } else if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            event.stopPropagation();
            close();
        }
    };

    return (
        <div className="space-y-2" onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) close();
        }}>
            <label htmlFor={inputId} className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                {label} {required && <span className="text-rose-400">*</span>}
            </label>
            <div className={`flex min-h-11 items-center gap-2.5 rounded-xl border bg-brand-surface-high px-3 transition-colors focus-within:border-brand-accent focus-within:ring-2 focus-within:ring-brand-accent/15 ${isOpen ? 'border-brand-accent ring-2 ring-brand-accent/15' : 'border-brand-border hover:border-brand-text-muted/50'}`}>
                <Mail size={17} aria-hidden="true" className={`shrink-0 ${isOpen ? 'text-brand-accent' : 'text-brand-text-muted/60'}`} />
                <input
                    ref={inputRef}
                    id={inputId}
                    type="email"
                    required={required}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? listId : undefined}
                    aria-describedby={hintId}
                    aria-activedescendant={isOpen && filtered[activeIndex] ? `${listId}-${activeIndex}` : undefined}
                    autoComplete="off"
                    placeholder={placeholder}
                    value={value}
                    onFocus={() => { setIsOpen(true); setIsFiltering(false); setActiveIndex(-1); }}
                    onClick={() => setIsOpen(true)}
                    onChange={event => { onChange(event.target.value); setIsFiltering(true); setIsOpen(true); setActiveIndex(-1); }}
                    onKeyDown={handleKeyDown}
                    className="min-w-0 flex-1 bg-transparent py-2.5 font-mono text-xs text-brand-text placeholder:text-brand-text-muted/50 outline-none"
                />
                <button
                    type="button"
                    tabIndex={-1}
                    aria-label={isOpen ? t.emailCloseList : t.emailOpenList}
                    aria-controls={isOpen ? listId : undefined}
                    aria-expanded={isOpen}
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => {
                        inputRef.current?.focus();
                        setIsOpen(!isOpen);
                        setIsFiltering(false);
                        setActiveIndex(-1);
                    }}
                    className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-brand-text-muted transition-colors hover:bg-brand-accent/15 hover:text-brand-text"
                >
                    <ChevronDown size={16} aria-hidden="true" className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>
            {isOpen && (
                <div className="animate-dropdown-in overflow-hidden rounded-xl border border-brand-border bg-brand-surface-high shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between border-b border-brand-border/60 px-3.5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">
                        <span>{t.emailSuggestions}</span>
                        <span className="rounded-md bg-brand-surface px-1.5 py-0.5 font-mono tabular-nums" aria-hidden="true">{filtered.length}</span>
                    </div>
                    <div ref={listRef} id={listId} role="listbox" aria-label={t.emailSuggestions} className="max-h-56 overflow-y-auto overscroll-contain p-1.5 [scrollbar-width:thin] [scrollbar-color:var(--color-brand-border)_transparent]">
                        {filtered.length === 0 ? (
                            <div role="status" className="flex items-center gap-2.5 px-2.5 py-4 text-xs text-brand-text-muted">
                                <Search size={16} aria-hidden="true" className="shrink-0" />
                                {t.emailNoMatches}
                            </div>
                        ) : filtered.map((email, index) => {
                            const selected = email.toLocaleLowerCase() === value.trim().toLocaleLowerCase();
                            const at = email.lastIndexOf('@');
                            return (
                                <div
                                    key={email}
                                    id={`${listId}-${index}`}
                                    role="option"
                                    aria-label={email}
                                    aria-selected={selected}
                                    onMouseDown={event => event.preventDefault()}
                                    onClick={() => choose(email)}
                                    className={`flex cursor-pointer items-center gap-3 rounded-lg border px-2.5 py-2.5 transition-colors ${index === activeIndex ? 'border-brand-accent/40 bg-brand-accent/20' : selected ? 'border-brand-accent/25 bg-brand-accent/10' : 'border-transparent hover:border-brand-border hover:bg-brand-surface'}`}
                                >
                                    <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-brand-accent/20 text-brand-accent' : 'bg-brand-surface text-brand-text-muted/60'}`}><Mail size={15} /></span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-mono text-xs font-semibold leading-relaxed text-brand-text [overflow-wrap:anywhere]">{at >= 0 ? email.slice(0, at) : email}</span>
                                        {at >= 0 && <span className="block text-[11px] leading-relaxed text-brand-text-muted/70 [overflow-wrap:anywhere]">{email.slice(at)}</span>}
                                    </span>
                                    {selected && <Check size={16} aria-hidden="true" className="shrink-0 text-brand-accent" />}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            <p id={hintId} className="text-[11px] leading-relaxed text-brand-text-muted/70">{t.emailCustomHint}</p>
        </div>
    );
}
