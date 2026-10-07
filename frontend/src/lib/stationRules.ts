import type { StationBlockingRule, StationRuleMode } from '../api/stationBlockingApi.ts';
import type { FisTarget, ProcessTagItem } from '../types/index.ts';

export function stationPrefixes(tags: ProcessTagItem[]): ProcessTagItem[] {
    const counts = new Map<string, number>();
    for (const name of new Set(tags.map(tag => tag.key))) {
        // The first sequence number identifies the family, including substation
        // suffixes: APR028_1 -> APR, DAL009_2 -> DAL, AMBIENT_H02 -> AMBIENT_H.
        const match = name.match(/^([^0-9]+)[0-9]/);
        const prefix = match?.[1].replace(/[_.-]+$/, '');
        if (prefix) counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
    }
    return Array.from(counts).filter(([, count]) => count >= 2)
        .map(([key]) => ({ key, description: key })).sort((a, b) => a.key.localeCompare(b.key));
}

export function matchingStations(tags: ProcessTagItem[], selector: string, mode: StationRuleMode): string[] {
    if (!selector) return [];
    return Array.from(new Set(tags.map(tag => tag.key).filter(name => mode === 'single' ? name === selector : name.startsWith(selector))))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function effectiveStationRule(rules: StationBlockingRule[], fis: FisTarget, station: string): StationBlockingRule | undefined {
    const local = rules.filter(rule => rule.FIS === fis);
    return local.find(rule => rule.mode === 'single' && rule.station === station)
        ?? local.filter(rule => rule.mode === 'prefix' && station.startsWith(rule.station))
            .sort((a, b) => b.station.length - a.station.length)[0];
}
