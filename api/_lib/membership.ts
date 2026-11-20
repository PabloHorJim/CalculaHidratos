/**
 * Group membership as firestore.rules defines it, for server code that runs with admin
 * rights (and so skips the rules): on the group's member list, or any group made by an old
 * version of the app that has no member list yet (its members are still registering).
 */
export function isGroupMember(group: Record<string, unknown>, uid: string): boolean {
    if (!('memberUids' in group)) return true;
    return Array.isArray(group.memberUids) && group.memberUids.includes(uid);
}
