import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fisApi } from '../api/fisApi';
import type { StationBlockingRule } from '../api/stationBlockingApi';
import { matchingStations } from '../lib/stationRules';
import { getLocalizedErrorMessage } from '../lib/errors';
import { useLanguage } from '../i18n/useLanguage';

export const useRuleMachinesPreview = (rule: StationBlockingRule | null) => {
    const { t, language } = useLanguage();
    const [search, setSearch] = useState('');
    const [identity, setIdentity] = useState('');
    const nextIdentity = rule ? `${rule.FIS}:${rule.mode}:${rule.station}` : '';
    if (identity !== nextIdentity) { setIdentity(nextIdentity); setSearch(''); }
    const fis = rule?.FIS ?? 'FIS1';
    const tags = useQuery({ queryKey: ['stationTags', fis], queryFn: () => fisApi.getStationTags(fis), enabled: !!rule, staleTime: 300000 });
    const names = rule ? matchingStations(tags.data ?? [], rule.station, rule.mode) : [];
    const visible = names.filter(name => name.toLowerCase().includes(search.trim().toLowerCase()));
    const descriptions = new Map(tags.data?.map(tag => [tag.key, tag.description]) ?? []);

    return {
        t, fis, search, setSearch,
        selector: rule ? rule.station + (rule.mode === 'prefix' ? '*' : '') : '',
        countLabel: search.trim() ? `${visible.length} / ${names.length}` : String(names.length),
        stations: visible.map(name => ({ name, description: descriptions.get(name) !== name ? descriptions.get(name) : null })),
        isLoading: tags.isPending,
        isFetching: tags.isFetching,
        hasError: Boolean(tags.error),
        errorMessage: tags.error ? getLocalizedErrorMessage(tags.error, language, t.stationLoadError) : null,
        refresh: () => { void tags.refetch(); },
    };
};
