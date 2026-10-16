import { RefreshCw, Search } from 'lucide-react';
import type { StationBlockingRule } from '../../api/stationBlockingApi';
import { useRuleMachinesPreview } from '../../hooks/useRuleMachinesPreview';
import { Modal } from '../common/Modal';
import { ErrorBanner } from '../common/ErrorBanner';
import { Badge } from '../common/Badge';

export const RuleMachinesModal = ({ rule, onClose }: { rule: StationBlockingRule | null; onClose: () => void }) => {
    const { t, fis, search, setSearch, selector, countLabel, stations, isLoading, isFetching, hasError, errorMessage, refresh } = useRuleMachinesPreview(rule);

    return <Modal isOpen={!!rule} onClose={onClose} title={t.stationRulePreview} maxWidth="lg">
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-border bg-brand-bg px-4 py-3">
                <strong className="break-all font-mono text-base text-brand-text">{selector}</strong>
                <Badge variant={fis === 'FIS2' ? 'info' : 'neutral'}>{fis}</Badge>
            </div>
            <p className="text-sm leading-relaxed text-brand-text-muted">{t.stationRuleFuture}</p>
            <label className="relative block"><span className="sr-only">{t.blockedSearchPlaceholder}</span><Search size={16} className="absolute left-3 top-3.5 text-brand-text-muted" aria-hidden="true" />
                <input autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} placeholder={t.blockedSearchPlaceholder} className="h-11 w-full rounded-xl border border-brand-border bg-brand-surface-high pl-10 pr-3 text-sm text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-accent/30" />
            </label>
            <div className="flex items-center justify-between gap-2 text-sm text-brand-text-muted"><span>{t.stationRuleMatches}: <strong className="text-brand-text">{countLabel}</strong></span>
                <button type="button" onClick={refresh} disabled={isFetching} className="interactive-button inline-flex items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold disabled:opacity-50"><RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />{t.btnRefreshMasters}</button>
            </div>
            <ErrorBanner message={errorMessage} />
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {isLoading ? <li className="py-8 text-center text-sm text-brand-text-muted">{t.stationLoading}</li> : !hasError && stations.length === 0 ? <li className="py-8 text-center text-sm text-brand-text-muted">{t.stationNoMatches}</li> : stations.map(item => <li key={item.name} className="rounded-xl border border-brand-border/60 bg-brand-bg px-4 py-3">
                    <span className="break-all font-mono text-sm font-semibold text-brand-text">{item.name}</span>
                    {item.description && <p className="mt-1 break-words text-sm text-brand-text-muted">{item.description}</p>}
                </li>)}
            </ul>
        </div>
    </Modal>;
};
