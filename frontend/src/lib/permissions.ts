import type { UserInfo } from '../types';

export function canEditFisBlocking(user: UserInfo | null): boolean {
    return Boolean(user?.uid && user.canEdit && !user.isGuest && user.groups.some(group => group === 'admin_group' || group === 'fisadmin_group'));
}
