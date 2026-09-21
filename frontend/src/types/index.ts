export interface MasterUnit {
    id: number;
    unit: string;
    process: string;
    status: 'GOOD' | 'BAD' | string;
    currentCounter: number;
    maxCounter: number;
    errorCounter: number;
    errorMaxCounter: number;
    globalCounter: number;
    user: string;
    isactive: number; // 1 = Active, 2 = Blocked/Dead, 0 = Inactive
    FIS: string;
}

export interface HistoryRecord {
    id: number;
    unit: string;
    process: string;
    status: string;
    currentCounter: number;
    maxCounter: number;
    errorCounter: number;
    errorMaxCounter: number;
    globalCounter: number;
    user: string;
    operation: 'Create' | 'Update' | 'Reset' | 'ResetCycles' | 'ResetErrors' | 'Block' | 'Activate' | 'Delete' | string;
    date: string;
}

export interface BlockedMachine {
    id: string;
    filename: string;
    machine: string;
    prefix: string;
    blockedAt: string | null;
    size: number;
}

export interface Engineer {
    id: number;
    process: string;
    mail: string | null;
}

export interface MailItem {
    id: number;
    name: string;
    mail: string;
}

export interface ProcessTagItem {
    key: string;
    description: string;
}

export interface ApiResponse<T = any> {
    status: boolean;
    message: string;
    data: T;
}

export interface UserInfo {
    uid: string;
    name: string;
    email?: string;
    groups: string[];
    canEdit: boolean;
    isGuest?: boolean;
}

export type ResetType = 'all' | 'cycles' | 'errors';
