import { useMemo, useState } from 'react';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { stationBlockingApi, type StationBlockingRule, type StationRuleMode } from '../api/stationBlockingApi';
import { fisApi } from '../api/fisApi';
import type { FisTarget } from '../types';
import { useLanguage } from '../i18n/useLanguage';
import { useAuth } from '../auth/useAuth';
import { getLocalizedErrorMessage } from '../lib/errors';
import { canEditFisBlocking } from '../lib/permissions';
import { invalidateAndBroadcast } from '../lib/queryCache';
import { effectiveStationRule, matchingStations, stationPrefixes } from '../lib/stationRules';

const targets: FisTarget[] = ['FIS1', 'FIS2'];
export type FisBlockingSetting = 'on' | 'off' | 'inherit';

export const useStationBlocking = () => {
    const { t, language } = useLanguage();
    const { user } = useAuth();
    const canEditOverride = canEditFisBlocking(user);
    const queryClient = useQueryClient();
    const [fis, setFis] = useState<FisTarget>('FIS1');
    const [station, setStation] = useState('');
    const [previewRule, setPreviewRule] = useState<StationBlockingRule | null>(null);
    const [mode, setMode] = useState<StationRuleMode>('single');
    const stationTags = useQuery({ queryKey: ['stationTags', fis], queryFn: () => fisApi.getStationTags(fis), staleTime: 300000 });
    const [validation, setValidation] = useState<string | null>(null);
    const [pending, setPending] = useState<{ station: string; fis: FisTarget; mode: StationRuleMode; action: 'set' | 'delete'; disabled?: boolean } | null>(null);
    const options = useMemo(() => mode === 'single' ? stationTags.data ?? [] : stationPrefixes(stationTags.data ?? []), [mode, stationTags.data]);
    const matches = matchingStations(stationTags.data ?? [], station, mode);
    const previewFis = pending?.fis ?? fis;
    const previewTags = useQuery({ queryKey: ['stationTags', previewFis], queryFn: () => fisApi.getStationTags(previewFis), staleTime: 300000 });
    const queries = useQueries({ queries: targets.map(target => ({
        queryKey: ['stationBlocking', target], queryFn: () => stationBlockingApi.list(target),
    })) });
    const allRules = queries.flatMap(query => query.data ?? []);
    const rows = allRules.filter(rule => rule.mode !== 'fis');
    const errors = queries.map((query, index) => query.error ? `${targets[index]}: ${getLocalizedErrorMessage(query.error, language, t.actionError)}` : '').filter(Boolean).join(' · ');
    const mutation = useMutation({
        mutationFn: (change: NonNullable<typeof pending>) => {
            if (change.mode === 'fis' && !canEditOverride) throw new Error(t.stationFisPermission);
            return change.action === 'delete' ? stationBlockingApi.remove(change.station, change.fis, change.mode) : stationBlockingApi.set(change.station, change.fis, change.mode, change.disabled);
        },
        onSuccess: async () => {
            await invalidateAndBroadcast(queryClient, [['stationBlocking'], ['history']]);
            setStation('');
            setPending(null);
        },
    });
    const scopeLabel = (value: StationRuleMode) => value === 'fis' ? t.stationFisScope : value === 'single' ? t.stationRuleSingle : t.stationRulePrefix;
    const previewMatches = pending ? matchingStations(previewTags.data ?? [], pending.station, pending.mode) : [];
    const nextRules = pending ? allRules.filter(rule => !(rule.FIS === pending.fis && rule.mode === pending.mode && rule.station === pending.station)) : [...allRules];
    if (pending?.action === 'set') nextRules.push({ station: pending.station, FIS: pending.fis, mode: pending.mode, disabled: pending.disabled, user: '', date: '' });
    const selectedQuery = queries[targets.indexOf(fis)];
    const isSaving = mutation.isPending;
    const canSaveRule = Boolean(station) && !isSaving && !stationTags.isPending && !stationTags.error && !selectedQuery.isPending && !selectedQuery.error;
    const canConfirm = Boolean(pending) && !isSaving && !(pending?.mode === 'fis' && !canEditOverride)
        && !queries[targets.indexOf(pending?.fis ?? fis)].isPending && !queries[targets.indexOf(pending?.fis ?? fis)].error;

    const chooseFis = (value: FisTarget) => { setFis(value); setStation(''); setValidation(null); };
    const chooseMode = (value: StationRuleMode) => { setMode(value); setStation(''); setValidation(null); };
    const chooseStation = (value: string) => { setStation(value); setValidation(null); };
    const prepareSave = () => {
        if (!canSaveRule) return;
        const name = station.trim();
        if (!options.some(tag => tag.key === name)) { setValidation(t.stationSelectRequired); return; }
        if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(name)) { setValidation(t.stationBlockingInvalid); return; }
        setValidation(null);
        mutation.reset();
        setPending({ station: name, fis, mode, action: 'set' });
    };
    const prepareDelete = (rule: StationBlockingRule) => {
        if (isSaving || (rule.mode === 'fis' && !canEditOverride)) return;
        mutation.reset();
        setPending({ station: rule.station, fis: rule.FIS, mode: rule.mode, action: 'delete' });
    };
    const prepareOverride = (target: FisTarget, value: FisBlockingSetting) => {
        const query = queries[targets.indexOf(target)];
        if (!canEditOverride || isSaving || query.isPending || query.error) return;
        mutation.reset();
        setPending({ station: 'ALL', fis: target, mode: 'fis', action: value === 'inherit' ? 'delete' : 'set', disabled: value === 'off' });
    };
    const closeConfirmation = () => { if (!isSaving) setPending(null); };
    const confirm = () => { if (pending && canConfirm) mutation.mutate(pending); };
    const refreshRules = () => { void Promise.all(queries.map(query => query.refetch())); };
    const refreshStations = () => { void stationTags.refetch(); };

    const overrideCards = targets.map((target, index) => {
        const override = allRules.find(rule => rule.FIS === target && rule.mode === 'fis');
        const current: FisBlockingSetting = override ? override.disabled ? 'off' : 'on' : 'inherit';
        const query = queries[index];
        const stateKnown = !query.isPending && !query.error;
        return {
            fis: target, current, stateKnown,
            statusLabel: query.isPending ? t.stationLoading : query.error ? t.actionError : current === 'on' ? t.stationRuleEnabled : current === 'off' ? t.stationRuleDisabled : t.stationFisInherit,
            options: (['on', 'off', 'inherit'] as const).map(value => ({
                value,
                label: value === 'on' ? t.stationFisOn : value === 'off' ? t.stationFisOff : t.stationFisInherit,
                selected: stateKnown && current === value,
                disabled: !canEditOverride || isSaving || !stateKnown || current === value,
                select: () => prepareOverride(target, value),
            })),
        };
    });
    const confirmation = pending ? {
        actionLabel: pending.mode === 'fis' ? pending.action === 'delete' ? t.stationFisInherit : pending.disabled ? t.stationFisOff : t.stationFisOn : pending.action === 'delete' ? t.stationRuleDelete : t.stationRuleEnabled,
        scopeLabel: scopeLabel(pending.mode),
        selector: pending.mode === 'fis' ? t.stationFisScope : pending.station + (pending.mode === 'prefix' ? '*' : ''),
        fis: pending.fis,
        info: pending.mode === 'fis' ? t.stationFisInfo : pending.action === 'delete' ? t.stationRuleDeleteInfo : pending.mode === 'prefix' ? t.stationRuleFuture : null,
        isPreviewLoading: previewTags.isPending,
        previewError: previewTags.error ? t.stationRulePreviewUnavailable : null,
        stations: previewMatches.map(name => {
            const rule = effectiveStationRule(nextRules, pending.fis, name);
            const overridden = rule && (rule.mode !== pending.mode || rule.station !== pending.station);
            return {
                name,
                enabled: Boolean(rule && !rule.disabled),
                overrideLabel: overridden ? t.stationRuleOverride + ': ' + scopeLabel(rule.mode) + ' ' + rule.station : null,
            };
        }),
    } : null;

    return {
        t, targets, fis, mode, station, options, matches, canEditOverride,
        overrideCards,
        rows: rows.map(row => ({ ...row, scopeLabel: scopeLabel(row.mode), isPrefix: row.mode === 'prefix' })),
        stationFieldLabel: mode === 'single' ? t.stationBlockingName : t.stationRuleSelector,
        stationEmptyLabel: mode === 'prefix' ? t.stationRuleNoGroups : t.stationNoMatches,
        showPrefixPreview: mode === 'prefix' && Boolean(station),
        previewRule, confirmation,
        errorMessage: errors || null,
        formError: stationTags.error ? getLocalizedErrorMessage(stationTags.error, language, t.stationLoadError) : validation,
        mutationError: mutation.error ? getLocalizedErrorMessage(mutation.error, language, t.actionError) : null,
        isStationLoading: stationTags.isPending,
        hasStationError: Boolean(stationTags.error),
        isRulesFetching: queries.some(query => query.isFetching),
        emptyRulesLabel: queries.some(query => query.isPending) ? t.stationLoading : errors ? t.actionError : t.stationRuleEmpty,
        canSaveRule, canConfirm, isSaving,
        chooseFis, chooseMode, chooseStation,
        prepareSave, prepareDelete, closeConfirmation, confirm,
        openPreview: setPreviewRule,
        closePreview: () => setPreviewRule(null),
        refreshRules, refreshStations,
    };
};
