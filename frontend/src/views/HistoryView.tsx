import React from 'react';
import { Link } from 'react-router';
import { Badge } from '../components/common/Badge';
import { ErrorBanner } from '../components/common/ErrorBanner';
import { Pagination } from '../components/common/Pagination';
import { Search, RefreshCw, RotateCcw, Calendar, X, ExternalLink } from 'lucide-react';
import { useHistory } from '../hooks/useHistory';

export const HistoryView: React.FC = () => {
    const {
        operationFilter, statusFilter, dateFrom, dateTo, tableScrollRef,
        tableRef, paginationRef, visibleRecords, totalItems, totalPages,
        handlePageChange, clearFilters, hasActiveFilters, unitFilter, setUnitFilter,
        processFilter, setProcessFilter, userFilter, setUserFilter, t,
        page, pageSize, isLoading, isFetching, refetch,
        hasError, errorMessage, historyRows, clearUnit, clearProcess,
        clearUser, changeOperation, changeStatus, changeDateFrom, changeDateTo,
        changePageSize,
    } = useHistory();
    return (
        <div className="space-y-6">
            <ErrorBanner message={errorMessage} />

            {/* Filter Bar with Date Range, Status & Process */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl p-4 shadow-md space-y-3">
                <div className="flex flex-wrap items-end gap-3">
                    {/* SN Search */}
                    <div className="space-y-1 flex-1 min-w-42.5">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.historySnLabel}
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={15} />
                            <input
                                type="text"
                                placeholder={t.historySnPlaceholder}
                                value={unitFilter}
                                onChange={(e) => setUnitFilter(e.target.value)}
                                className="w-full h-9 pl-9 pr-7 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {unitFilter && (
                                <button
                                    type="button"
                                    onClick={clearUnit}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-text-muted hover:text-white"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Process Search */}
                    <div className="space-y-1 min-w-37.5">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.processLabel}
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={t.historyProcessPlaceholder}
                                value={processFilter}
                                onChange={(e) => setProcessFilter(e.target.value)}
                                className="w-full h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {processFilter && (
                                <button
                                    type="button"
                                    onClick={clearProcess}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-text-muted hover:text-white"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Operation Filter */}
                    <div className="space-y-1 min-w-40">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.thOperation}
                        </label>
                        <select
                            value={operationFilter}
                            onChange={(e) => changeOperation(e.target.value)}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent font-mono transition-colors hover:border-brand-text-muted/60 cursor-pointer"
                        >
                            <option value="">{t.allOperations}</option>
                            <option value="Create">{t.opCreate}</option>
                            <option value="Update">{t.opUpdate}</option>
                            <option value="Reset">{t.opReset}</option>
                            <option value="ResetCycles">{t.opResetCycles}</option>
                            <option value="ResetErrors">{t.opResetErrors}</option>
                            <option value="Block">{t.opBlock}</option>
                            <option value="Activate">{t.opActivate}</option>
                            <option value="UnlockStation">{t.opUnlockStation}</option>
                            <option value="DisableStationBlocking">{t.opDisableStationBlocking}</option>
                            <option value="EnableStationBlocking">{t.opEnableStationBlocking}</option>
                            <option value="DeleteStationBlockingRule">{t.opDeleteStationBlockingRule}</option>
                            <option value="Delete">{t.opDelete}</option>
                        </select>
                    </div>

                    {/* Status Filter */}
                    <div className="space-y-1 min-w-27.5">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.thStatus}
                        </label>
                        <select
                            value={statusFilter}
                            onChange={(e) => changeStatus(e.target.value)}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text focus:outline-none focus:border-brand-accent font-mono transition-colors hover:border-brand-text-muted/60 cursor-pointer"
                        >
                            <option value="">{t.allStatuses}</option>
                            <option value="GOOD">{t.goodStatusLabel}</option>
                            <option value="BAD">{t.badStatusLabel}</option>
                        </select>
                    </div>

                    {/* Date From */}
                    <div className="space-y-1 min-w-33.75">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted items-center gap-1">
                            <Calendar size={11} className="text-brand-accent" />
                            <span>{t.filterDateFrom}</span>
                        </label>
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => changeDateFrom(e.target.value)}
                            className="h-9 px-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer"
                        />
                    </div>

                    {/* Date To */}
                    <div className="space-y-1 min-w-33.75">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted items-center gap-1">
                            <Calendar size={11} className="text-brand-accent" />
                            <span>{t.filterDateTo}</span>
                        </label>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => changeDateTo(e.target.value)}
                            className="h-9 px-2.5 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer"
                        />
                    </div>

                    {/* User Search */}
                    <div className="space-y-1 min-w-35">
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.historyUser}
                        </label>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={t.historyOperatorPlaceholder}
                                value={userFilter}
                                onChange={(e) => setUserFilter(e.target.value)}
                                className="w-full h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text placeholder-brand-text-muted/60 focus:outline-none focus:border-brand-accent font-mono transition-all"
                            />
                            {userFilter && (
                                <button
                                    type="button"
                                    onClick={clearUser}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-brand-text-muted hover:text-white"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Rows per page */}
                    <div className="space-y-1">
                        <label htmlFor="history-page-size" className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">
                            {t.rowsPerPage}
                        </label>
                        <select
                            id="history-page-size"
                            value={pageSize}
                            onChange={(event) => changePageSize(event.target.value)}
                            className="h-9 px-3 bg-brand-surface-high border border-brand-border rounded-xl text-xs text-brand-text font-mono focus:outline-none focus:border-brand-accent cursor-pointer"
                        >
                            {[15, 25, 50, 100, 250, 500].map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                    </div>

                    {/* Clear Filters Button */}
                    <button
                        type="button"
                        onClick={clearFilters}
                        disabled={!hasActiveFilters}
                        className={`interactive-button h-9 px-3.5 rounded-xl border text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all duration-200 ${
                            hasActiveFilters
                                ? 'bg-indigo-500/20 border-brand-accent text-indigo-300 hover:bg-indigo-500/30'
                                : 'opacity-40 cursor-not-allowed bg-brand-surface-high border-brand-border text-brand-text-muted'
                        }`}
                        title={t.historyClearAll}
                    >
                        <RotateCcw size={13} />
                        <span>{t.historyClear}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="interactive-button h-9 px-3.5 rounded-xl bg-brand-surface-high border border-brand-border text-brand-text hover:border-brand-text-muted/60 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={isFetching ? 'animate-spin text-brand-accent' : ''} />
                        <span>{t.refresh}</span>
                    </button>
                </div>

                <div className="flex items-center justify-between text-xs text-brand-text-muted font-mono pt-1 border-t border-brand-border/60">
                    <span>
                        {hasError ? t.historyCountError : isLoading ? t.historyLoadingCount : t.historyCount.replace('{count}', String(totalItems))}
                    </span>
                    {hasActiveFilters && (
                        <span className="text-brand-accent font-medium">{t.historyActiveFilters}</span>
                    )}
                </div>
            </div>

            {/* History Table */}
            <div className="bg-brand-surface border border-brand-border rounded-2xl shadow-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table ref={tableRef} className="split-scroll-table text-left text-[13px] border-collapse">
                        <thead>
                            <tr className="bg-brand-surface text-brand-text-muted font-mono text-xs uppercase tracking-wider border-b border-brand-border">
                                <th className="py-3 px-4 font-semibold">{t.historyDateTime}</th>
                                <th className="py-3 px-4 font-semibold">{t.historySerialUnit}</th>
                                <th className="py-3 px-4 font-semibold">{t.thOperation}</th>
                                <th className="py-3 px-4 font-semibold">{t.processLabel}</th>
                                <th className="py-3 px-4 font-semibold text-center">{t.thStatus}</th>
                                <th className="py-3 px-4 font-semibold">{t.historyCycles}</th>
                                <th className="py-3 px-4 font-semibold">{t.historyErrors}</th>
                                <th className="py-3 px-4 font-semibold">{t.thGlobal}</th>
                                <th className="py-3 px-4 font-semibold">{t.historyUser}</th>
                            </tr>
                        </thead>
                        <tbody ref={tableScrollRef} className="divide-y divide-brand-border/50 text-brand-text font-mono text-[13px]">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted">
                                        <div className="inline-flex items-center gap-2">
                                            <RefreshCw className="animate-spin text-brand-accent" size={20} />
                                            <span>{t.historyLoading}</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : hasError ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted font-sans">
                                        {t.historyLoadError}
                                    </td>
                                </tr>
                            ) : visibleRecords.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="py-12 text-center text-brand-text-muted/70 font-sans">
                                        {t.historyNoMatches}
                                    </td>
                                </tr>
                            ) : (
                                historyRows.map((rec, idx) => (
                                    <tr
                                        key={rec.id}
                                        style={{ animationDelay: `${Math.min(idx * 15, 300)}ms` }}
                                        className="animate-row-enter hover:bg-brand-surface-high/50 transition-colors duration-150"
                                    >
                                        <td className="py-3 px-4 text-brand-text-muted whitespace-nowrap">
                                            {rec.date}
                                        </td>
                                        <td className="py-3 px-4 font-bold text-brand-text tracking-wide">
                                            <div className="flex items-center gap-1.5 w-max">
                                                <Link
                                                    to={rec.dashboardUrl}
                                                    className="whitespace-nowrap font-mono text-brand-accent hover:text-indigo-300 hover:underline"
                                                    title={rec.dashboardLinkTitle}
                                                >
                                                    <span>{rec.unit}</span>
                                                </Link>
                                                {rec.isStationOperation && <span className="rounded border border-brand-border px-1.5 py-0.5 text-[10px] text-brand-text-muted">{rec.FIS}</span>}
                                                {rec.fisHistoryUrl && <a
                                                    href={rec.fisHistoryUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-0.5 text-brand-text-muted/40 hover:text-brand-accent transition-colors"
                                                    title={t.historyFisLink}
                                                >
                                                    <ExternalLink size={11} className="opacity-70" />
                                                </a>}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4">
                                            <Badge variant={rec.operationBadgeVariant}>
                                                {rec.operationLabel}
                                            </Badge>
                                        </td>
                                        <td className="py-3 px-4 text-brand-text font-semibold">
                                            <span className="block w-max max-w-68 wrap-anywhere">{rec.processLabel}</span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            {rec.isBlockingPolicyChange ? <Badge variant={rec.status === 'DISABLED' ? 'warning' : rec.status === 'ENABLED' ? 'success' : 'info'}>{rec.statusLabel}</Badge> : rec.status === 'GOOD' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                                    GOOD
                                                </span>
                                            ) : rec.status === 'BAD' ? (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tracking-wider bg-rose-500/15 text-rose-400 border border-rose-500/30">
                                                    BAD
                                                </span>
                                            ) : (
                                                <span className="text-brand-text-muted">—</span>
                                            )}
                                        </td>
                                        <td className="py-3 px-4 text-slate-200">
                                            {rec.isStationOperation ? '—' : <>{rec.currentCounter} <span className="text-brand-text-muted/60">/ {rec.maxCounter}</span></>}
                                        </td>
                                        <td className="py-3 px-4">
                                            {rec.isStationOperation ? '—' : <><span className={(rec.errorCounter ?? 0) > 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                                                {rec.errorCounter}
                                            </span>
                                            <span className="text-brand-text-muted/60"> / {rec.errorMaxCounter}</span></>}
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-200">
                                            {rec.isStationOperation ? '—' : rec.globalCounter?.toLocaleString() ?? 0}
                                        </td>
                                        <td className="py-3 px-4 text-brand-text-muted font-sans">
                                            {rec.user || '—'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                <div ref={paginationRef}>
                    {!hasError && !isLoading && (
                        <Pagination
                            currentPage={page}
                            totalPages={totalPages}
                            totalItems={totalItems}
                            pageSize={pageSize}
                            onPageChange={handlePageChange}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
