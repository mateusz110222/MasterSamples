import { getLocalizedErrorMessage } from '../lib/errors';
import { useState, useMemo } from 'react';
import { Engineer, MailItem } from '../types';
import { useAuth } from '../auth/useAuth';
import { useLanguage } from '../i18n/useLanguage';
import { useEngineerActions, useEngineersQuery, useMailsQuery } from './useEngineers.ts';

export const useEngineersView = () => {
    const { canEdit } = useAuth();
    const { t, language } = useLanguage();

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
    const [actionError, setActionError] = useState<unknown>(null);

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
        onError: (error: unknown) => setActionError(error),
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


    const errorMessage = actionError ? getLocalizedErrorMessage(actionError, language, t.actionError) : engineersError ? getLocalizedErrorMessage(engineersError, language, t.engineersLoadError) : mailsError ? getLocalizedErrorMessage(mailsError, language, t.mailsLoadError) : null;
    const dismissError = () => setActionError(null);
    const refresh = () => { void refetchEngineers(); void refetchMails(); };
    const openProcessEditor = (engineer: Engineer) => { setEditProcessTarget(engineer); setEditProcessMailValue(engineer.mail || ''); };
    const openMailEditor = (mail: MailItem) => { setEditMailTarget(mail); setEditMailName(mail.name); setEditMailAddress(mail.mail); };
    const changeProcessName = (value: string) => setNewProcessName(value.toUpperCase());
    const updateProcess = () => { if (editProcessTarget && canEdit) updateProcessMutation.mutate({ process: editProcessTarget.process, mail: editProcessMailValue.trim() }); };
    const addProcess = () => { if (newProcessName.trim() && canEdit) addProcessMutation.mutate({ process: newProcessName.trim().toUpperCase(), mail: newProcessMail.trim() }); };
    const deleteProcess = () => { if (deleteProcessTarget && canEdit) deleteProcessMutation.mutate(deleteProcessTarget.id); };
    const addMail = () => { if (newMailAddress.trim() && canEdit) addMailMutation.mutate({ name: newMailName.trim() || newMailAddress.split('@')[0], mail: newMailAddress.trim() }); };
    const updateMail = () => { if (editMailTarget && editMailAddress.trim() && canEdit) updateMailMutation.mutate({ id: editMailTarget.id, name: editMailName.trim(), mail: editMailAddress.trim() }); };
    const deleteMail = () => { if (deleteMailTarget && canEdit) deleteMailMutation.mutate(deleteMailTarget.id); };

    return {
        refresh, openProcessEditor, openMailEditor, changeProcessName, updateProcess,
        addProcess, deleteProcess, addMail, updateMail, deleteMail,
        errorMessage, dismissError, emailSuggestions, filteredEngineers, filteredMails,
        activeTab, setActiveTab, searchTerm, setSearchTerm, editProcessTarget,
        setEditProcessTarget, editProcessMailValue, setEditProcessMailValue, isAddProcessOpen, setIsAddProcessOpen,
        newProcessName, newProcessMail, setNewProcessMail, deleteProcessTarget, setDeleteProcessTarget,
        isAddMailOpen, setIsAddMailOpen, newMailName, setNewMailName, newMailAddress,
        setNewMailAddress, editMailTarget, setEditMailTarget, editMailName, setEditMailName,
        editMailAddress, setEditMailAddress, deleteMailTarget, setDeleteMailTarget, actionError,
        canEdit, t, engineers, engLoading, engFetching,
        mails, mailsLoading, mailsFetching, updateProcessMutation, addProcessMutation,
        deleteProcessMutation, addMailMutation, updateMailMutation, deleteMailMutation,
    };
};
