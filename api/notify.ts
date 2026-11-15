import type { ServerResponse } from 'node:http';
import { sendNotification, setVapidDetails } from 'web-push';
import { ApiRequest, readBody, sendJson } from './_lib/http.js';
import { admin, firestore, requestUid } from './_lib/admin.js';
import { notifyGroup, NotifyDeps, PushSubscriptionData } from './_lib/notify.js';

/**
 * POST /api/notify  { groupId, title, body }   (Authorization: Bearer <Firebase ID token>)
 * Sends a push notification to the other members of the caller's family group.
 * Needs VAPID_PUBLIC_KEY (or VITE_VAPID_PUBLIC_KEY), VAPID_PRIVATE_KEY and VAPID_SUBJECT.
 * The text is encrypted for each device: the push services (Google, Apple, Mozilla) cannot read it.
 */

const deps = (): NotifyDeps => {
    const db = firestore();
    return {
        async groupMembers(groupId) {
            const snapshot = await db.collection('groups').doc(groupId).get();
            if (!snapshot.exists) return null;
            const members = snapshot.data()?.memberUids;
            return Array.isArray(members) ? members.filter((m): m is string => typeof m === 'string') : [];
        },
        async subscriptions(uid) {
            const snapshot = await db.doc(`users/${uid}/private/push`).get();
            const subs = snapshot.data()?.subs;
            return subs && typeof subs === 'object' ? (subs as Record<string, PushSubscriptionData>) : {};
        },
        async send(subscription, payload) {
            try {
                await sendNotification(subscription, payload, { TTL: 3600, urgency: 'high' });
                return 'ok';
            } catch (error) {
                const status = (error as { statusCode?: number }).statusCode;
                if (status === 404 || status === 410) return 'gone';
                console.error('push failed', status ?? error);
                return 'error';
            }
        },
        async removeSubscription(uid, id) {
            await db.doc(`users/${uid}/private/push`).update({ [`subs.${id}`]: admin.firestore.FieldValue.delete() });
        }
    };
};

export default async function handler(req: ApiRequest, res: ServerResponse) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

    const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!publicKey || !privateKey || !subject) return sendJson(res, 503, { error: 'Push notifications are not configured' });

    const uid = await requestUid(req);
    if (!uid) return sendJson(res, 401, { error: 'Sign in required' });

    let input: unknown;
    try {
        input = JSON.parse((await readBody(req)).text || '{}');
    } catch {
        return sendJson(res, 400, { error: 'Invalid JSON' });
    }

    try {
        setVapidDetails(subject, publicKey, privateKey);
        const result = await notifyGroup(deps(), uid, input);
        sendJson(res, result.status, result.body);
    } catch (error) {
        console.error('notify failed', error);
        sendJson(res, 500, { error: 'Could not send notifications' });
    }
}
