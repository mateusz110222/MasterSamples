import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useLanguage } from '../i18n/useLanguage';
import { useAuth } from '../auth/useAuth';
import { getDocumentation, searchDocumentation } from '../documentation/content';
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


export const useDocumentation = () => {
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


    const sectionGroups = (['guide', 'technical'] as const).map(group => ({ group, label: group === 'guide' ? ui.guide : ui.technical, sections: sections.filter(section => section.group === group) }));
    const clearSearch = () => { setQuery(''); searchRef.current?.focus(); };
    const focusSearch = () => { searchRef.current?.focus(); searchRef.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); };
    const previousSection = sections[index - 1] ?? null;
    const nextSection = sections[index + 1] ?? null;
    const canOpenSelectedLink = !selected.link?.edit || canEdit;

    return {
        sectionGroups, clearSearch, focusSearch, previousSection, nextSection,
        canOpenSelectedLink, ui, sections, matches, selected,
        index, articleRef, mobileContentsRef, searchRef, searching,
        selectSection, query, setQuery, language,
    };
};
