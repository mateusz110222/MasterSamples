import React, { useState, useMemo } from 'react';
import { Engineer, MailItem } from '../types';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { Modal } from '../components/common/Modal';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { getErrorMessage } from '../lib/errors';
import { useEngineerActions, useEngineersQuery, useMailsQuery } from '../hooks/useEngineers';
import {
    Mail,
    Plus,
    Edit2,
    Trash2,
    Search,
    RefreshCw,
    Contact,
    Layers
} from 'lucide-react';

export const EngineersView: React.FC = () => {
    const { canEdit } = useAuth();
    const { t } = useLanguage();

    // Active tab: 'processes' (engineers records) or 'mails' (mail records)
    const [activeTab, setActiveTab] = useState<'processes' | 'mails'>('processes');
    const [searchTerm, setSearchTerm] = useState('');

    // --- State for process assignments ---
    const [editProcessTarget, setEditProcessTarget] = useState<Engineer | null>(null);
    const [editProcessMailValue, setEditProcessMailValue] = useState('');
    const [isAddProcessOpen, setIsAddProcessOpen] = useState(false);
    const [newProcessName, setNewProcessName] = useState('');
    const [newProcessMail, setNewProcessMail] = useState('');
    const [deleteProcessTarget, setDeleteProcessTarget] = useState<Engineer | null>(null);

    // --- State for standalone mail addresses (masterSample.mails) ---
    const [isAddMailOpen, setIsAddMailOpen] = useState(false);
    const [newMailName, setNewMailName] = useState('');
    const [newMailAddress, setNewMailAddress] = useState('');
    const [editMailTarget, setEditMailTarget] = useState<MailItem | null>(null);
    const [editMailName, setEditMailName] = useState('');
    const [editMailAddress, setEditMailAddress] = useState('');
    const [deleteMailTarget, setDeleteMailTarget] = useState<MailItem | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);

    // --- Queries ---
    const { data: engineers = [], isLoading: engLoading, isFetching: engFetching, refetch: refetchEngineers, error: engineersError } = useEngineersQuery();
    const { data: mails = [], isLoading: mailsLoading, isFetching: mailsFetching, refetch: refetchMails, error: mailsError } = useMailsQuery();

    // --- Process Mutations ---
    const {
        updateProcessMutation,
        addProcessMutation,
        deleteProcessMutation,
        addMailMutation,
        updateMailMutation,
        deleteMailMutation,
    } = useEngineerActions({
        onMutate: () => setActionError(null),
        onError: (error: unknown) => setActionError(getErrorMessage(error)),
        onProcessUpdated: () => setEditProcessTarget(null),
        onProcessAdded: () => {
            setIsAddProcessOpen(false);
            setNewProcessName('');
            setNewProcessMail('');
        },
        onProcessDeleted: () => setDeleteProcessTarget(null),
        onMailAdded: () => {
            setIsAddMailOpen(false);
            setNewMailName('');
            setNewMailAddress('');
        },
        onMailUpdated: () => setEditMailTarget(null),
        onMailDeleted: () => setDeleteMailTarget(null),
    });

    // Suggestion pool from the mail directory and existing engineer records
    const emailSuggestions = useMemo(() => {
        const set = new Set<string>();
        mails.forEach(m => { if (m.mail) set.add(m.mail.trim()); });
        engineers.forEach(e => { if (e.mail) set.add(e.mail.trim()); });
        return Array.from(set);
    }, [mails, engineers]);

    // Filtering
    const filteredEngineers = useMemo(() => {
        if (!searchTerm) return engineers;
        const s = searchTerm.toLowerCase();
        return engineers.filter(e =>
            e.process.toLowerCase().includes(s) ||
            (e.mail && e.mail.toLowerCase().includes(s))
        );
    }, [engineers, searchTerm]);

    const filteredMails = useMemo(() => {
        if (!searchTerm) return mails;
        const s = searchTerm.toLowerCase();
        return mails.filter(m =>
            m.name.toLowerCase().includes(s) ||
            m.mail.toLowerCase().includes(s)
        );
    }, [mails, searchTerm]);

    return (
        <div className="space-y-6">
            <ErrorBanner
                message={actionError ?? (engineersError ? getErrorMessage(engineersError) : mailsError ? getErrorMessage(mailsError) : null)}
                onDismiss={actionError ? () => setActionError(null) : undefined}
            />
            {/* Header info banner */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-5 shadow-lg flex items-start justify-between gap-4 flex-wrap hover-lift">
                <div className="flex items-start gap-4">
                    <div className="p-2.5 rounded-xl bg-brand-accent/15 border border-brand-accent/30 text-brand-accent shrink-0">
                        <Mail size={24} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-brand-text tracking-wide">
                            {t.engineersBannerTitle}
                        </h2>
                        <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                            {t.engineersBannerSub}
                        </p>
                    </div>
                </div>

                {canEdit && (
                    <div className="flex items-center gap-2.5">
                        {activeTab === 'processes' ? (
                            <button
                                type="button"
                                onClick={() => setIsAddProcessOpen(true)}
                                className="interactive-button inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text font-bold text-xs uppercase tracking-wider shadow-lg shadow-brand-accent/30 shrink-0 cursor-pointer"
                            >
                                <Plus size={16} />
                                <span>{t.btnAddProcessMail}</span>
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setIsAddMailOpen(true)}
                                className="interactive-button inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text font-bold text-xs uppercase tracking-wider shadow-lg shadow-brand-accent/30 shrink-0 cursor-pointer"
                            >
                                <Plus size={16} />
                                <span>{t.btnAddStandaloneMail}</span>
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Tab Navigation Pill Switcher */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="bg-brand-surface border border-brand-border p-1 rounded-2xl flex items-center gap-1 shadow-md">
                    <button
                        type="button"
                        onClick={() => setActiveTab('processes')}
                        className={`interactive-pill flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeTab === 'processes'
                                ? 'bg-brand-accent text-brand-text shadow-md shadow-brand-accent/20'
                                : 'text-brand-text-muted hover:text-brand-text'
                        }`}
                    >
                        <Layers size={15} />
                        <span>{t.tabProcessEngineers}</span>
                        <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-indigo-950 text-indigo-300 font-mono">
                            {engineers.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setActiveTab('mails')}
                        className={`interactive-pill flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            activeTab === 'mails'
                                ? 'bg-brand-accent text-brand-text shadow-md shadow-brand-accent/20'
                                : 'text-brand-text-muted hover:text-brand-text'
                        }`}
                    >
                        <Contact size={15} />
                        <span>{t.tabMailsDirectory}</span>
                        <span className="ml-1 px-1.5 py-0.5 rounded-md text-[10px] bg-indigo-950 text-indigo-300 font-mono">
                            {mails.length}
                        </span>
                    </button>
                </div>

                <button
                    type="button"
                    onClick={() => {
                        void refetchEngineers();
                        void refetchMails();
                    }}
                    disabled={engFetching || mailsFetching}
                    className="interactive-button flex items-center gap-2 px-3.5 py-2 rounded-xl bg-brand-surface border border-brand-border text-brand-text hover:text-brand-text hover:border-brand-text-muted/60 text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                    <RefreshCw size={14} className={engFetching || mailsFetching ? 'animate-spin text-brand-accent' : ''} />
                    <span>Odśwież</span>
                </button>
            </div>

            {/* Filter / Search Bar */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md flex items-center justify-between gap-4 flex-wrap">
                <div className="relative flex-1 min-w-65">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted" size={17} />
                    <input
                        type="text"
                        placeholder={t.searchProcessMailPlaceholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20 font-mono transition-all duration-200"
                    />
                </div>

                <div className="text-xs font-mono text-brand-text-muted">
                    Wyników: <strong className="text-brand-text">{activeTab === 'processes' ? filteredEngineers.length : filteredMails.length}</strong>
                </div>
            </div>

            {activeTab === 'processes' && (
                <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden">
                    <div className="max-h-[65dvh] overflow-auto">
                        <table className="sticky-header-table w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-brand-surface text-brand-text-muted font-mono text-[11px] uppercase tracking-wider border-b border-brand-border">
                                    <th className="py-3 px-4 font-semibold w-16">ID</th>
                                    <th className="py-3 px-4 font-semibold w-64">{t.thProcess}</th>
                                    <th className="py-3 px-4 font-semibold">{t.thEmailGroup}</th>
                                    {canEdit && <th className="py-3 px-4 font-semibold text-right pr-4 w-32">{t.thActions}</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border/60 text-brand-text font-mono text-xs">
                                {engLoading ? (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center text-brand-text-muted">
                                            <div className="inline-flex items-center gap-2">
                                                <RefreshCw className="animate-spin text-brand-accent" size={18} />
                                                <span>Ładowanie listy procesów i maili...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredEngineers.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                            Brak rekordów spełniających kryteria.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEngineers.map((eng, idx) => (
                                        <tr
                                            key={eng.id}
                                            style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
                                            className="animate-row-enter hover:bg-brand-surface-high transition-colors duration-150"
                                        >
                                            <td className="py-3 px-4 text-brand-text-muted/70 font-bold">
                                                #{eng.id}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-brand-text tracking-wide">
                                                {eng.process}
                                            </td>
                                            <td className="py-3 px-4">
                                                {eng.mail ? (
                                                    <span className="inline-flex items-center gap-1.5 text-brand-accent font-semibold font-mono">
                                                        <Mail size={14} className="text-brand-accent shrink-0" />
                                                        {eng.mail}
                                                    </span>
                                                ) : (
                                                    <span className="text-brand-text-muted/70 italic">{t.noMailAssigned}</span>
                                                )}
                                            </td>
                                            {canEdit && (
                                                <td className="py-3 px-4 text-right pr-4">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditProcessTarget(eng);
                                                                setEditProcessMailValue(eng.mail || '');
                                                            }}
                                                            className="interactive-button inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-accent/10 border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/20 text-xs font-semibold cursor-pointer"
                                                        >
                                                            <Edit2 size={13} />
                                                            <span>{t.edit}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteProcessTarget(eng)}
                                                            className="interactive-button p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                                                            title="Usuń konfigurację"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'mails' && (
                <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden">
                    <div className="max-h-[65dvh] overflow-auto">
                        <table className="sticky-header-table w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-brand-surface text-brand-text-muted font-mono text-[11px] uppercase tracking-wider border-b border-brand-border">
                                    <th className="py-3 px-4 font-semibold w-16">ID</th>
                                    <th className="py-3 px-4 font-semibold w-64">{t.thContactName}</th>
                                    <th className="py-3 px-4 font-semibold">{t.thEmailAddress}</th>
                                    {canEdit && <th className="py-3 px-4 font-semibold text-right pr-4 w-32">{t.thActions}</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border/60 text-brand-text font-mono text-xs">
                                {mailsLoading ? (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center text-brand-text-muted">
                                            <div className="inline-flex items-center gap-2">
                                                <RefreshCw className="animate-spin text-brand-accent" size={18} />
                                                <span>Ładowanie książki adresowej e-mail...</span>
                                            </div>
                                        </td>
                                    </tr>
                                ) : filteredMails.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                            Brak adresów e-mail w bazie. Kliknij &quot;Dodaj Nowy E-mail&quot;, aby dodać pierwszy rekord.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredMails.map((item, idx) => (
                                        <tr
                                            key={item.id}
                                            style={{ animationDelay: `${Math.min(idx * 25, 300)}ms` }}
                                            className="animate-row-enter hover:bg-brand-surface-high transition-colors duration-150"
                                        >
                                            <td className="py-3 px-4 text-brand-text-muted/70 font-bold">
                                                #{item.id}
                                            </td>
                                            <td className="py-3 px-4 font-bold text-brand-text tracking-wide">
                                                {item.name || '—'}
                                            </td>
                                            <td className="py-3 px-4">
                                                <span className="inline-flex items-center gap-1.5 text-brand-accent font-semibold font-mono">
                                                    <Mail size={14} className="text-brand-accent shrink-0" />
                                                    {item.mail}
                                                </span>
                                            </td>
                                            {canEdit && (
                                                <td className="py-3 px-4 text-right pr-4">
                                                    <div className="flex items-center justify-end gap-1.5">
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditMailTarget(item);
                                                                setEditMailName(item.name);
                                                                setEditMailAddress(item.mail);
                                                            }}
                                                            className="interactive-button inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-accent/10 border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/20 text-xs font-semibold cursor-pointer"
                                                        >
                                                            <Edit2 size={13} />
                                                            <span>{t.edit}</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteMailTarget(item)}
                                                            className="interactive-button p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                                                            title="Usuń kontakt"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* =========================================================================
             * MODALS FOR TAB 1: PROCESSES
             * ========================================================================= */}

            {/* MODAL 1: Edit Process Email */}
            <Modal
                isOpen={!!editProcessTarget}
                onClose={() => setEditProcessTarget(null)}
                title={`${t.editMailGroupTitle} ${editProcessTarget?.process}`}
                description="Zmień lub przypisz adres e-mail / grupę mailingową inżynierów dla tego procesu"
            >
                {editProcessTarget && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            updateProcessMutation.mutate({ process: editProcessTarget.process, mail: editProcessMailValue.trim() });
                        }}
                        className="space-y-4"
                    >
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                {t.emailAddressLabel}
                            </label>
                            <input
                                type="email"
                                required
                                placeholder="np. PLBLO_PDS_FCT@borgwarner.com"
                                value={editProcessMailValue}
                                onChange={(e) => setEditProcessMailValue(e.target.value)}
                                list="allSuggestions"
                                className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-xs focus:outline-none focus:border-brand-accent transition-colors"
                            />
                            <datalist id="allSuggestions">
                                {emailSuggestions.map(m => (
                                    <option key={m} value={m} />
                                ))}
                            </datalist>
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditProcessTarget(null)}
                                className="px-4 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text text-xs font-semibold transition-colors cursor-pointer"
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="submit"
                                disabled={updateProcessMutation.isPending}
                                className="px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text text-xs font-bold shadow-lg shadow-brand-accent/30 transition-all cursor-pointer"
                            >
                                {updateProcessMutation.isPending ? t.saving : t.saveChanges}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* MODAL 2: Add Process / Mail */}
            <Modal
                isOpen={isAddProcessOpen}
                onClose={() => setIsAddProcessOpen(false)}
                title={t.addProcessConfigTitle}
                description="Wprowadź nazwę procesu oraz powiązaną grupę mailową"
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!newProcessName.trim()) return;
                        addProcessMutation.mutate({ process: newProcessName.trim().toUpperCase(), mail: newProcessMail.trim() });
                    }}
                    className="space-y-4"
                >
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                            {t.processLabel} <span className="text-rose-400">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            placeholder="np. SMT3 lub ICT_LINE_C..."
                            value={newProcessName}
                            onChange={(e) => setNewProcessName(e.target.value.toUpperCase())}
                            className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-xs focus:outline-none focus:border-brand-accent transition-colors"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                            {t.emailAddressLabel}
                        </label>
                        <input
                            type="email"
                            placeholder="np. PLBLO_SMT_ENG@borgwarner.com"
                            value={newProcessMail}
                            onChange={(e) => setNewProcessMail(e.target.value)}
                            list="allSuggestions2"
                            className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-xs focus:outline-none focus:border-brand-accent transition-colors"
                        />
                        <datalist id="allSuggestions2">
                            {emailSuggestions.map(m => (
                                <option key={m} value={m} />
                            ))}
                        </datalist>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsAddProcessOpen(false)}
                            className="px-4 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text text-xs font-semibold transition-colors cursor-pointer"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={addProcessMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text text-xs font-bold shadow-lg shadow-brand-accent/30 transition-all cursor-pointer"
                        >
                            {addProcessMutation.isPending ? t.saving : 'Dodaj Konfigurację'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 3: Delete Process Confirmation */}
            <Modal
                isOpen={!!deleteProcessTarget}
                onClose={() => setDeleteProcessTarget(null)}
                title="Usuń Konfigurację Procesu"
                description={`Czy na pewno chcesz usunąć powiązanie dla procesu: ${deleteProcessTarget?.process}?`}
            >
                <div className="space-y-4">
                    <p className="text-sm text-brand-text">
                        Usunięcie rekordu z tabeli <span className="font-mono text-brand-text">engineers</span> spowoduje brak adresu docelowego dla powiadomień tego procesu.
                    </p>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setDeleteProcessTarget(null)}
                            className="px-4 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text text-sm font-semibold transition-colors cursor-pointer"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteProcessTarget && deleteProcessMutation.mutate(deleteProcessTarget.id)}
                            disabled={deleteProcessMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-brand-text text-sm font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                        >
                            {deleteProcessMutation.isPending ? t.deleting : t.delete}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* =========================================================================
             * MODALS FOR TAB 2: STANDALONE MAILS (mails table)
             * ========================================================================= */}

            {/* MODAL 4: Add New Standalone Mail */}
            <Modal
                isOpen={isAddMailOpen}
                onClose={() => setIsAddMailOpen(false)}
                title={t.addStandaloneMailTitle}
                description="Wprowadź dane nowego adresu e-mail lub grupy mailingowej do tabeli mails"
            >
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        if (!newMailAddress.trim()) return;
                        addMailMutation.mutate({
                            name: newMailName.trim() || newMailAddress.split('@')[0],
                            mail: newMailAddress.trim()
                        });
                    }}
                    className="space-y-4"
                >
                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                            {t.contactNameLabel}
                        </label>
                        <input
                            type="text"
                            placeholder={t.contactNamePlaceholder}
                            value={newMailName}
                            onChange={(e) => setNewMailName(e.target.value)}
                            className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-xs focus:outline-none focus:border-brand-accent transition-colors"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                            {t.emailAddressLabel} <span className="text-rose-400">*</span>
                        </label>
                        <input
                            type="email"
                            required
                            placeholder={t.emailAddressPlaceholder}
                            value={newMailAddress}
                            onChange={(e) => setNewMailAddress(e.target.value)}
                            className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-xs focus:outline-none focus:border-brand-accent transition-colors"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setIsAddMailOpen(false)}
                            className="px-4 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text text-xs font-semibold transition-colors cursor-pointer"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="submit"
                            disabled={addMailMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text text-xs font-bold shadow-lg shadow-brand-accent/30 transition-all cursor-pointer"
                        >
                            {addMailMutation.isPending ? t.saving : 'Dodaj E-mail'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* MODAL 5: Edit Standalone Mail */}
            <Modal
                isOpen={!!editMailTarget}
                onClose={() => setEditMailTarget(null)}
                title={t.editStandaloneMailTitle}
                description="Zaktualizuj nazwę lub adres e-mail w tabeli mails"
            >
                {editMailTarget && (
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            if (!editMailAddress.trim()) return;
                            updateMailMutation.mutate({
                                id: editMailTarget.id,
                                name: editMailName.trim(),
                                mail: editMailAddress.trim()
                            });
                        }}
                        className="space-y-4"
                    >
                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                {t.contactNameLabel}
                            </label>
                            <input
                                type="text"
                                placeholder={t.contactNamePlaceholder}
                                value={editMailName}
                                onChange={(e) => setEditMailName(e.target.value)}
                                className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-xs focus:outline-none focus:border-brand-accent transition-colors"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="block text-xs font-bold uppercase tracking-wider text-brand-text">
                                {t.emailAddressLabel} <span className="text-rose-400">*</span>
                            </label>
                            <input
                                type="email"
                                required
                                placeholder={t.emailAddressPlaceholder}
                                value={editMailAddress}
                                onChange={(e) => setEditMailAddress(e.target.value)}
                                className="w-full px-4 py-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-brand-text font-mono text-xs focus:outline-none focus:border-brand-accent transition-colors"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setEditMailTarget(null)}
                                className="px-4 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text text-xs font-semibold transition-colors cursor-pointer"
                            >
                                {t.cancel}
                            </button>
                            <button
                                type="submit"
                                disabled={updateMailMutation.isPending}
                                className="px-4 py-2 rounded-xl bg-brand-accent hover:bg-brand-accent text-brand-text text-xs font-bold shadow-lg shadow-brand-accent/30 transition-all cursor-pointer"
                            >
                                {updateMailMutation.isPending ? t.saving : t.saveChanges}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>

            {/* MODAL 6: Delete Standalone Mail Confirmation */}
            <Modal
                isOpen={!!deleteMailTarget}
                onClose={() => setDeleteMailTarget(null)}
                title={t.deleteMailTitle}
                description={t.deleteMailConfirm}
            >
                <div className="space-y-4">
                    <p className="text-sm text-brand-text">
                        Usunięcie adresu <strong className="text-brand-text font-mono">{deleteMailTarget?.mail}</strong> ({deleteMailTarget?.name}) z tabeli <span className="font-mono text-brand-accent">masterSample.mails</span>.
                    </p>
                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={() => setDeleteMailTarget(null)}
                            className="px-4 py-2 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:text-brand-text text-sm font-semibold transition-colors cursor-pointer"
                        >
                            {t.cancel}
                        </button>
                        <button
                            type="button"
                            onClick={() => deleteMailTarget && deleteMailMutation.mutate(deleteMailTarget.id)}
                            disabled={deleteMailMutation.isPending}
                            className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-brand-text text-sm font-bold shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
                        >
                            {deleteMailMutation.isPending ? t.deleting : t.delete}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};
