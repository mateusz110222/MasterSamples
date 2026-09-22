import type { MasterUnit } from '../types/index.ts';

export type MasterSortField = 'unit' | 'process' | 'FIS' | 'currentCounter' | 'errorCounter' | 'status' | 'user' | 'isactive';
export type SortDirection = 'asc' | 'desc';

export type TaskPreset = 'all' | 'action_required' | 'blocked' | 'cycles_80' | 'errors_exceeded' | 'my_processes';

export interface MasterFilters {
    searchTerm: string;
    process: string;
    status: string;
    activity: string;
    taskPreset?: TaskPreset;
    currentUser?: string;
}

export const splitProcesses = (value: string): string[] =>
    value.split(',').map(process => process.trim()).filter(Boolean);

export const matchesProcess = (value: string, selectedProcess: string): boolean =>
    !selectedProcess || splitProcesses(value).includes(selectedProcess);

export const filterMasters = (masters: MasterUnit[], filters: MasterFilters): MasterUnit[] => {
    const search = filters.searchTerm.trim().toLocaleLowerCase();

    return masters.filter(master => {
        if (search) {
            const matchesSearch = [master.unit, master.process, master.user ?? '']
                .some(value => value.toLocaleLowerCase().includes(search));
            if (!matchesSearch) return false;
        }
        if (!matchesProcess(master.process, filters.process)) return false;
        if (filters.status && master.status !== filters.status) return false;
        if (filters.activity === 'active' && master.isactive !== 1) return false;
        if (filters.activity === 'dead' && master.isactive !== 2) return false;

        if (filters.taskPreset && filters.taskPreset !== 'all') {
            const cycleExceeded = master.maxCounter > 0 && master.currentCounter >= master.maxCounter;
            const errorExceeded = master.errorMaxCounter > 0 && master.errorCounter >= master.errorMaxCounter;
            const cycle80 = master.maxCounter > 0 && (master.currentCounter / master.maxCounter) >= 0.8;
            const isDead = master.isactive === 2;

            switch (filters.taskPreset) {
                case 'action_required':
                    if (!cycleExceeded && !errorExceeded && !isDead) return false;
                    break;
                case 'blocked':
                    if (!isDead) return false;
                    break;
                case 'cycles_80':
                    if (!cycle80) return false;
                    break;
                case 'errors_exceeded':
                    if (!errorExceeded) return false;
                    break;
                case 'my_processes':
                    if (!filters.currentUser) return false;
                    const u = filters.currentUser.toLowerCase();
                    if (!master.user?.toLowerCase().includes(u)) return false;
                    break;
            }
        }

        return true;
    });
};

export const sortMasters = (
    masters: MasterUnit[],
    field: MasterSortField,
    direction: SortDirection,
): MasterUnit[] => {
    const multiplier = direction === 'asc' ? 1 : -1;
    const numericFields: MasterSortField[] = ['currentCounter', 'errorCounter', 'isactive'];

    return [...masters].sort((left, right) => {
        if (numericFields.includes(field)) {
            return ((Number(left[field]) || 0) - (Number(right[field]) || 0)) * multiplier;
        }

        return String(left[field] ?? '').localeCompare(
            String(right[field] ?? ''),
            undefined,
            { numeric: true, sensitivity: 'base' },
        ) * multiplier;
    });
};

export const escapeCsvCell = (value: unknown): string => {
    let text = String(value ?? '');
    if (/^[\t\r ]*[=+\-@]/.test(text)) {
        text = `'${text}`;
    }
    return `"${text.replaceAll('"', '""')}"`;
};

export const buildMastersCsv = (masters: MasterUnit[]): string => {
    const headers = ['Unit', 'Process', 'Status', 'CurrentCounter', 'MaxCounter', 'ErrorCounter', 'ErrorMaxCounter', 'User', 'IsActive', 'FIS'];
    const rows = masters.map(master => [
        master.unit,
        master.process,
        master.status,
        master.currentCounter,
        master.maxCounter,
        master.errorCounter,
        master.errorMaxCounter,
        master.user,
        master.isactive,
        master.FIS,
    ]);

    return [headers, ...rows].map(row => row.map(escapeCsvCell).join(',')).join('\r\n');
};

export const downloadTextFile = (contents: string, filename: string, mimeType: string): void => {
    const blobUrl = URL.createObjectURL(new Blob([contents], { type: mimeType }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(blobUrl);
};
