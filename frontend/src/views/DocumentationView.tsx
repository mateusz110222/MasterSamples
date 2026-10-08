import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ArrowDown, ArrowLeft, ArrowRight, BookOpen, ChevronDown, Code2, Info, List, Search, ShieldCheck, X } from 'lucide-react';
import { useLanguage } from '../i18n/useLanguage';
import { useAuth } from '../auth/useAuth';
import { getDocumentation, searchDocumentation } from '../documentation/content';
import type { DocBlock } from '../documentation/content';
import '../documentation/documentation.css';

const labels = {
    PL: {
        title: 'Dokumentacja',
        search: 'Szukaj instrukcji, operacji, endpointu…', clear: 'Wyczyść wyszukiwanie', contents: 'W tym przewodniku',
        guide: 'Przewodnik użytkownika', technical: 'Dla zespołu IT',
        start: 'Zacznij tutaj', startSub: 'Dostęp, role i pierwsze kroki', locks: 'Zrozum blokady', locksSub: 'Master, maszyna i reguły stacji',
        integration: 'Poznaj integrację', integrationSub: 'FIS, API i przepływ danych', results: 'Wyniki wyszukiwania',
        empty: 'Nie znaleziono rozdziału', emptySub: 'Spróbuj krótszej frazy, np. „reset”, „FIS” albo „BREQ”.',
        note: 'Warto wiedzieć', readOnly: 'Ta operacja wymaga uprawnień zapisu.', prev: 'Poprzedni rozdział', next: 'Następny rozdział',
        reference: 'Dokumentacja aplikacji', chapter: 'Rozdział', resultCount: 'Znalezione rozdziały:',
    },
    EN: {
        title: 'Documentation',
        search: 'Search guides, operations, endpoints…', clear: 'Clear search', contents: 'In this guide',
        guide: 'User guide', technical: 'For the IT team',
        start: 'Start here', startSub: 'Access, roles and first steps', locks: 'Understand locks', locksSub: 'Masters, machines and station rules',
        integration: 'Explore integration', integrationSub: 'FIS, APIs and data flow', results: 'Search results',
        empty: 'No chapter found', emptySub: 'Try a shorter phrase, such as “reset”, “FIS” or “BREQ”.',
        note: 'Good to know', readOnly: 'This operation requires write access.', prev: 'Previous chapter', next: 'Next chapter',
        reference: 'Application documentation', chapter: 'Chapter', resultCount: 'Matching chapters:',
    },
};

function DocumentationBlock({ block, noteLabel }: { block: DocBlock; noteLabel: string }) {
    if (block.kind === 'heading') return <h4 className="doc-subheading">{block.text}</h4>;
    if (block.kind === 'paragraph') return <p className="doc-paragraph">{block.text}</p>;
    if (block.kind === 'note') return <aside className="doc-note"><Info size={18} aria-hidden="true" /><div><strong>{noteLabel}</strong><p>{block.text}</p></div></aside>;
    if (block.kind === 'code') return <pre className="doc-code" tabIndex={0}><code>{block.text}</code></pre>;
    if (block.kind === 'steps') return <ol className="doc-steps">{block.items.map((item, index) => <li key={index}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{item}</p></li>)}</ol>;
    if (block.kind === 'flow') return <ol className="doc-flow" aria-label={block.items.join(' → ')}>{block.items.map((item, index) => <li key={index}><span className="doc-flow-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><span>{item}</span>{index < block.items.length - 1 && <ArrowRight size={16} aria-hidden="true" />}</li>)}</ol>;
    if (block.kind === 'table') return <div className="doc-table-scroll" role="region" aria-label={block.headers.join(' / ')} tabIndex={0}><table className="doc-table"><thead><tr>{block.headers.map(header => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{block.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th scope="row" key={cellIndex}>{cell}</th> : <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
    return null;
}

export function DocumentationView() {
    const { language } = useLanguage();
    const { canEdit } = useAuth();
    const ui = labels[language];
    const [params, setParams] = useSearchParams();
    const [query, setQuery] = useState('');
    const sections = useMemo(() => getDocumentation(language), [language]);
    const matches = useMemo(() => searchDocumentation(sections, query), [sections, query]);
    const selected = sections.find(section => section.id === params.get('section')) ?? sections[0];
    const index = sections.findIndex(section => section.id === selected.id);
    const articleRef = useRef<HTMLElement>(null);
    const mobileContentsRef = useRef<HTMLDetailsElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const focusRequested = useRef(false);
    const searching = Boolean(query.trim());

    useEffect(() => {
        if (!focusRequested.current || searching) return;
        focusRequested.current = false;
        articleRef.current?.focus({ preventScroll: true });
        articleRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }, [selected.id, searching]);

    const selectSection = (id: string) => {
        focusRequested.current = true;
        setQuery('');
        if (mobileContentsRef.current) mobileContentsRef.current.open = false;
        const next = new URLSearchParams(params);
        next.set('section', id);
        setParams(next);
        // Selecting the current chapter should still bring it into view.
        if (selected.id === id && !searching) {
            focusRequested.current = false;
            articleRef.current?.focus({ preventScroll: true });
            articleRef.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
        }
    };

    const contents = (prefix: string) => <nav aria-label={ui.contents}>{(['guide', 'technical'] as const).map(group => <div className="doc-toc-group" key={group}><p>{group === 'guide' ? ui.guide : ui.technical}</p>{sections.filter(section => section.group === group).map(section => <button key={`${prefix}-${section.id}`} type="button" onClick={() => selectSection(section.id)} aria-current={!searching && selected.id === section.id ? 'page' : undefined} className={`doc-toc-link ${!searching && selected.id === section.id ? 'is-active' : ''}`}><span className="doc-toc-dot" />{section.title}</button>)}</div>)}</nav>;

    const shortcuts = [
        { id: 'getting-started', icon: BookOpen, title: ui.start, sub: ui.startSub, tone: 'indigo' },
        { id: 'station-locks', icon: ShieldCheck, title: ui.locks, sub: ui.locksSub, tone: 'teal' },
        { id: 'architecture', icon: Code2, title: ui.integration, sub: ui.integrationSub, tone: 'amber' },
    ];

    return <div className="documentation" lang={language.toLowerCase()}>
        <section className="doc-toolbar" aria-labelledby="documentation-title">
            <h2 id="documentation-title"><BookOpen size={19} aria-hidden="true" />{ui.title}</h2>
            <div className="doc-search-wrap"><Search size={20} aria-hidden="true" /><label className="sr-only" htmlFor="documentation-search">{ui.search}</label><input ref={searchRef} id="documentation-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={ui.search} autoComplete="off" />{query && <button type="button" aria-label={ui.clear} onClick={() => { setQuery(''); searchRef.current?.focus(); }}><X size={18} /></button>}</div>
        </section>

        <div className="doc-shortcuts">{shortcuts.map(card => <button className={`doc-shortcut doc-tone-${card.tone}`} type="button" key={card.id} onClick={() => selectSection(card.id)}><span className="doc-shortcut-icon"><card.icon size={21} strokeWidth={1.7} /></span><span className="doc-shortcut-copy"><strong>{card.title}</strong><span>{card.sub}</span></span><ArrowRight size={17} aria-hidden="true" /></button>)}</div>

        <details ref={mobileContentsRef} className="doc-mobile-toc"><summary><List size={18} aria-hidden="true" />{ui.contents}<ChevronDown size={16} aria-hidden="true" /></summary>{contents('mobile')}</details>

        <div className="doc-layout">
            <aside className="doc-desktop-toc"><div className="doc-toc-sticky"><div className="doc-toc-heading"><List size={15} aria-hidden="true" />{ui.contents}</div>{contents('desktop')}<div className="doc-toc-footer"><BookOpen size={15} aria-hidden="true" /><span>Master Samples<br />{ui.reference}</span></div></div></aside>
            <div className="doc-content">
                {searching ? <section className="doc-results" aria-labelledby="documentation-results"><p className="doc-eyebrow">{ui.results}</p><h3 id="documentation-results">{query}</h3><p className="doc-result-count" role="status">{ui.resultCount} {matches.length}</p>{matches.length ? <div className="doc-result-list">{matches.map(section => <button type="button" className="doc-result" key={section.id} onClick={() => selectSection(section.id)}><span><small>{section.group === 'guide' ? ui.guide : ui.technical}</small><strong>{section.title}</strong><span>{section.description}</span></span><ArrowRight size={20} aria-hidden="true" /></button>)}</div> : <div className="doc-empty"><Search size={30} aria-hidden="true" /><h4>{ui.empty}</h4><p>{ui.emptySub}</p><button type="button" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>{ui.clear}<ArrowRight size={16} aria-hidden="true" /></button></div>}</section> : <>
                    <article ref={articleRef} tabIndex={-1} className="doc-article" aria-labelledby="documentation-chapter-title">
                        <header className="doc-article-header"><p className="doc-eyebrow">{selected.group === 'guide' ? ui.guide : ui.technical}<span className="doc-chapter-number">{ui.chapter} {String(index + 1).padStart(2, '0')} / {sections.length}</span></p><h3 id="documentation-chapter-title">{selected.title}</h3><p>{selected.description}</p></header>
                        <div className="doc-article-body">{selected.blocks.map((block, blockIndex) => <DocumentationBlock key={`${selected.id}-${blockIndex}`} block={block} noteLabel={ui.note} />)}</div>
                        {selected.link && <footer className="doc-article-action">{!selected.link.edit || canEdit ? <Link to={selected.link.to}>{selected.link.label}<ArrowRight size={17} aria-hidden="true" /></Link> : <p><Info size={16} aria-hidden="true" />{ui.readOnly}</p>}</footer>}
                    </article>
                    <nav className="doc-pagination" aria-label={ui.contents}>{index > 0 ? <button type="button" onClick={() => selectSection(sections[index - 1].id)}><ArrowLeft size={18} aria-hidden="true" /><span><small>{ui.prev}</small><strong>{sections[index - 1].title}</strong></span></button> : <div />}{index < sections.length - 1 && <button type="button" className="doc-next" onClick={() => selectSection(sections[index + 1].id)}><span><small>{ui.next}</small><strong>{sections[index + 1].title}</strong></span><ArrowRight size={18} aria-hidden="true" /></button>}</nav>
                    <button className="doc-back-to-search" type="button" onClick={() => { searchRef.current?.focus(); searchRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }}><Search size={14} aria-hidden="true" />{ui.search}<ArrowDown size={14} className="rotate-180" aria-hidden="true" /></button>
                </>}
            </div>
        </div>
    </div>;
}
