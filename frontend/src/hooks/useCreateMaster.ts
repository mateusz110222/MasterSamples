import { formatMessage } from '../lib/templateText';
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fisApi } from '../api/fisApi';
import { FisTarget, normalizeFisTarget } from '../api/masterApi';
import type { MasterUnit } from '../types';
import { useLanguage } from '../i18n/useLanguage';
import type { TranslationsType } from '../i18n/LanguageContext';
import { getErrorMessage } from '../lib/errors';
import { ApiError } from '../api/client';
import { refreshMasterData } from '../lib/queryCache';
import { SELECTED_FIS_STORAGE_KEY, postBroadcastMessage, subscribeBroadcast } from '../lib/broadcastSync';
import { createMasterWithStructure } from '../lib/createMaster';
type Feedback = {
    type: 'success' | 'error';
    key: keyof TranslationsType;
    values?: Record<string, string | number>;
    serverMessage?: string;
    statusCode?: number;
};


const usageLimitPresets = [200, 500, 1000, 2000, 5000];
const errorLimitPresets = [50, 100, 250, 500, 1000];

export const useCreateMaster = () => {
    const { t, language } = useLanguage();
    const queryClient = useQueryClient();
    const localizedError = (error: unknown, fallback: string) => {
        if (language === 'PL') return getErrorMessage(error, fallback);
        if (error instanceof ApiError && error.statusCode > 0) {
            return `${fallback} ${formatMessage(t.httpErrorCode, { code: error.statusCode })}`;
        }
        return fallback;
    };

    // Mode: 'single' | 'multiple'
    const [mode, setMode] = useState<'single' | 'multiple'>('single');

    // Form state
    const [serialNumber, setSerialNumber] = useState('');
    const [singleProcess, setSingleProcess] = useState('');
    const [selectedProcesses, setSelectedProcesses] = useState<string[]>([]);
    const [multiSearchQuery, setMultiSearchQuery] = useState('');
    const [assignPn, setAssignPn] = useState(false);
    const [selectedPn, setSelectedPn] = useState('');
    const [pnRequiredError, setPnRequiredError] = useState(false);
    const [status, setStatus] = useState<'GOOD' | 'BAD'>('GOOD');
    const [maxCounter, setMaxCounter] = useState<number>(1000);
    const [maxErrors, setMaxErrors] = useState<number>(100);
    const [selectedFis, setSelectedFis] = useState<FisTarget>(() => {
        try {
            return window.localStorage.getItem(SELECTED_FIS_STORAGE_KEY) === 'FIS2' ? 'FIS2' : 'FIS1';
        } catch {
            return 'FIS1';
        }
    });

    const handleFisChange = (fis: FisTarget) => {
        if (fis === selectedFis) return;
        setSelectedFis(fis);
        setSingleProcess('');
        setSelectedProcesses([]);
        setMultiSearchQuery('');
        try {
            window.localStorage.setItem(SELECTED_FIS_STORAGE_KEY, fis);
        } catch {
            // Selection remains active for the current session when storage is unavailable.
        }
        postBroadcastMessage({ type: 'fis:change', fis });
    };

    // Existing unit update comparison modal
    const [existingModalData, setExistingModalData] = useState<{
        oldData: Partial<MasterUnit>;
        newData: Partial<MasterUnit>;
    } | null>(null);

    // Feedback state
    const [feedback, setFeedback] = useState<Feedback | null>(null);
    const feedbackMessage = feedback && (language === 'PL' && feedback.serverMessage
        ? feedback.serverMessage
        : formatMessage(t[feedback.key], feedback.values ?? {}));
    const feedbackStatus = feedback?.statusCode && language === 'EN'
        ? ` ${formatMessage(t.httpErrorCode, { code: feedback.statusCode })}`
        : '';

    // Fetch process tags (normalized to ProcessTagItem[])
    const { data: processTags = [], isLoading: tagsLoading, error: processTagsError } = useQuery({
        queryKey: ['processTags', selectedFis],
        queryFn: () => fisApi.getProcessTags(selectedFis),
        staleTime: 5 * 60 * 1000,
    });

    // Fetch PN / userkey2 tags when enabled
    const { data: pnTags = [], isLoading: pnLoading, error: pnError } = useQuery({
        queryKey: ['userKey2Tags', selectedFis],
        queryFn: () => fisApi.getUserKey2Tags(selectedFis),
        enabled: assignPn,
        staleTime: 5 * 60 * 1000,
    });

    // Filtered processes for multiple selection
    const filteredMultiTags = useMemo(() => {
        if (!multiSearchQuery.trim()) return processTags;
        const q = multiSearchQuery.toLowerCase().trim();
        return processTags.filter(tag => tag.key.toLowerCase().includes(q));
    }, [processTags, multiSearchQuery]);

    const createMutation = useMutation({
        mutationFn: createMasterWithStructure,
        onSuccess: (res, variables) => {
            if (res.data?.exists && !variables.forceUpdate) {
                setExistingModalData({
                    oldData: res.data.oldData ?? {},
                    newData: res.data.newData ?? {},
                });
                return;
            }

            if (res.status) {
                const isMigration = variables.forceUpdate && variables.oldFis && variables.oldFis !== variables.fis;
                setFeedback(isMigration
                    ? { type: 'success', key: 'masterMigrated', values: { unit: res.data?.unit ?? variables.unit, oldFis: variables.oldFis!, fis: variables.fis } }
                    : { type: 'success', key: 'masterSaved' });
                void refreshMasterData(queryClient);
                setExistingModalData(null);
                // Reset form
                setSerialNumber('');
                setAssignPn(false);
                setSelectedPn('');
                if (mode === 'single') setSingleProcess('');
                else {
                    setSelectedProcesses([]);
                    setMultiSearchQuery('');
                }
            } else {
                setFeedback({ type: 'error', key: 'masterSaveError', serverMessage: res.message });
            }
        },
        onError: (error: unknown) => {
            setFeedback({
                type: 'error',
                key: 'connectionError',
                serverMessage: getErrorMessage(error, t.connectionError),
                statusCode: error instanceof ApiError ? error.statusCode : undefined,
            });
        }
    });

    useEffect(() => {
        return subscribeBroadcast((message) => {
            // A preference from another tab must not alter an in-progress submission.
            if (serialNumber || singleProcess || selectedProcesses.length || assignPn || existingModalData || createMutation.isPending) return;
            if (message.type === 'fis:change' && message.fis !== selectedFis) {
                setSelectedFis(message.fis);
                setMultiSearchQuery('');
            }
        });
    }, [selectedFis, serialNumber, singleProcess, selectedProcesses.length, assignPn, existingModalData, createMutation.isPending]);

    const handleSubmit = (e: React.SyntheticEvent, forceUpdate = false) => {
        e.preventDefault();
        setFeedback(null);

        const sn = serialNumber.trim().toUpperCase();
        if (!sn) {
            setFeedback({ type: 'error', key: 'serialRequired' });
            return;
        }

        const proc = mode === 'single' ? singleProcess.trim() : selectedProcesses.join(',');
        if (!proc) {
            setFeedback({ type: 'error', key: 'processRequired' });
            return;
        }

        if (assignPn && !selectedPn.trim()) {
            setPnRequiredError(true);
            setFeedback({ type: 'error', key: 'pnValidation' });
            return;
        }

        const oldFis = (forceUpdate && existingModalData?.oldData?.FIS)
            ? normalizeFisTarget(existingModalData.oldData.FIS)
            : undefined;

        createMutation.mutate({
            unit: forceUpdate ? existingModalData?.newData.unit ?? sn : sn,
            process: proc,
            status,
            maxCounter,
            maxErrors,
            fis: selectedFis,
            userKey2: assignPn && selectedPn.trim() ? selectedPn.trim() : undefined,
            forceUpdate,
            oldFis,
        });
    };

    const toggleMultiProcess = (procKey: string) => {
        setSelectedProcesses(prev =>
            prev.includes(procKey) ? prev.filter(p => p !== procKey) : [...prev, procKey]
        );
    };

    const selectAllVisible = () => {
        const visibleKeys = filteredMultiTags.map(t => t.key);
        setSelectedProcesses(prev => Array.from(new Set([...prev, ...visibleKeys])));
    };

    const clearVisible = () => {
        const visibleKeys = new Set(filteredMultiTags.map(t => t.key));
        setSelectedProcesses(prev => prev.filter(k => !visibleKeys.has(k)));
    };


    const serialLengthLabel = formatMessage(t.serialLength, { count: serialNumber.trim().length });
    const selectedProcessesLabel = formatMessage(t.selectedProcessesCount, { count: selectedProcesses.length });
    const noProcessesLabel = formatMessage(t.noProcessesForQuery, { query: multiSearchQuery });
    const migrationDescription = formatMessage(t.fisMigrationDescription, { oldFis: existingModalData?.oldData.FIS ?? '', fis: existingModalData?.newData.FIS ?? selectedFis });
    const setPnAssignment = (nextChecked: boolean) => {
        setAssignPn(nextChecked); setPnRequiredError(false);
        if (!nextChecked) setSelectedPn('');
    };
    const choosePn = (pn: string) => { setSelectedPn(pn); setPnRequiredError(false); };
    const processErrorMessage = processTagsError ? localizedError(processTagsError, t.processLoadError) : null;
    const pnErrorMessage = pnError ? localizedError(pnError, t.pnLoadError) : null;
    const isMigration = Boolean(existingModalData?.oldData.FIS && existingModalData.newData.FIS && normalizeFisTarget(existingModalData.oldData.FIS) !== normalizeFisTarget(existingModalData.newData.FIS));
    const processChoices = filteredMultiTags.map(tag => ({ ...tag, selected: selectedProcesses.includes(tag.key) }));

    const changeSerialNumber = (value: string) => setSerialNumber(value.toUpperCase());
    const hasSerialNumber = Boolean(serialNumber.trim());
    const changeMaxCounter = (value: string) => { const limit = Number(value); if (usageLimitPresets.includes(limit)) setMaxCounter(limit); };
    const changeMaxErrors = (value: string) => { const limit = Number(value); if (errorLimitPresets.includes(limit)) setMaxErrors(limit); };
    const comparisonPn = (existingModalData?.newData as { userKey2?: string } | undefined)?.userKey2;

    return {
        errorLimitPresets, usageLimitPresets,
        changeSerialNumber, hasSerialNumber, changeMaxCounter, changeMaxErrors, comparisonPn,
        hasProcessTagsError: Boolean(processTagsError), setPnAssignment, choosePn, processErrorMessage,
        pnErrorMessage, isMigration, processChoices, serialLengthLabel, selectedProcessesLabel,
        noProcessesLabel, migrationDescription, handleFisChange, feedbackMessage, feedbackStatus,
        filteredMultiTags, createMutation, handleSubmit, toggleMultiProcess, selectAllVisible,
        clearVisible, mode, setMode, serialNumber, singleProcess,
        setSingleProcess, selectedProcesses, setSelectedProcesses, multiSearchQuery, setMultiSearchQuery,
        assignPn, selectedPn, pnRequiredError, status, setStatus,
        maxCounter, maxErrors, selectedFis,
        existingModalData, setExistingModalData, feedback, setFeedback, t,
        processTags, tagsLoading, pnTags, pnLoading, pnError,
    };
};
