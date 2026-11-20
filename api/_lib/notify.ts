/** Logic of the family notification endpoint, independent of Firebase and of the push library. */

export interface PushSubscriptionData { endpoint: string; keys: { p256dh: string; auth: string } }

export interface NotifyDeps {
    /** uids on the member list of a group, or null when the group does not exist. */
    groupMembers(groupId: string): Promise<string[] | null>;
    /** Push subscriptions (one per device) of a user, by subscription id. */
    subscriptions(uid: string): Promise<Record<string, PushSubscriptionData>>;
    /** Sends one notification. Resolves to "gone" when the subscription no longer exists. */
    send(subscription: PushSubscriptionData, payload: string): Promise<'ok' | 'gone' | 'error'>;
    removeSubscription(uid: string, id: string): Promise<void>;
}

export interface NotifyResult { status: number; body: { error?: string; sent?: number; devices?: number } }

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Push services of the browsers (Chrome/Android, Firefox, Safari/iOS, Edge). Subscriptions are
 * written by users, so without this list the server could be made to send requests anywhere.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
    /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

export const isPushEndpoint = (endpoint: string) => {
    try {
        const url = new URL(endpoint);
        return url.protocol === 'https:' && !url.port && PUSH_HOSTS.some(host => host.test(url.hostname));
    } catch {
        return false;
    }
};

const isSubscription = (s: unknown): s is PushSubscriptionData => {
    const sub = s as PushSubscriptionData | null;
    return !!sub && typeof sub.endpoint === 'string' && isPushEndpoint(sub.endpoint) &&
        typeof sub.keys?.p256dh === 'string' && typeof sub.keys?.auth === 'string';
};

/** Sends `title`/`body` to every device of the other members of the caller's group. */
export async function notifyGroup(deps: NotifyDeps, uid: string, input: unknown): Promise<NotifyResult> {
    const data = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
    const groupId = text(data.groupId, 64);
    const title = text(data.title, 80);
    const body = text(data.body, 300);
    if (!groupId || groupId.includes('/') || !title) return { status: 400, body: { error: 'groupId and title are required' } };

    const members = await deps.groupMembers(groupId);
    // Same answer for "no such group" and "not your group": nothing to learn by probing
    if (!members || !members.includes(uid)) return { status: 403, body: { error: 'Not a member of this group' } };

    const payload = JSON.stringify({ title, body, tag: text(data.tag, 60) || 'carbcalc', url: '/' });
    let sent = 0;
    let devices = 0;
    await Promise.all(members.filter(member => member !== uid).slice(0, 50).map(async member => {
        const subs = await deps.subscriptions(member).catch(() => ({} as Record<string, PushSubscriptionData>));
        await Promise.all(Object.entries(subs).slice(0, 10).map(async ([id, subscription]) => {
            if (!isSubscription(subscription)) return;
            devices += 1;
            const outcome = await deps.send(subscription, payload).catch(() => 'error' as const);
            if (outcome === 'ok') sent += 1;
            else if (outcome === 'gone') await deps.removeSubscription(member, id).catch(() => undefined);
        }));
    }));
    return { status: 200, body: { sent, devices } };
}
