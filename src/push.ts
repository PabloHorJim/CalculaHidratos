import { auth, db, doc, setDoc, updateDoc, deleteField } from './firebase';

/**
 * Push notifications for the family ("the split is ready").
 * Each device subscribes with the browser's push service and stores its subscription in
 * users/<uid>/private/push (readable only by its owner and by the server). /api/notify sends them.
 */

const VAPID_PUBLIC_KEY: string = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? '';
const DEVICE_KEY = 'carbcalc_push_device';

export type PushState = 'unsupported' | 'unconfigured' | 'blocked' | 'off' | 'on';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function pushState(): PushState {
    if (!supported()) return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'unconfigured';
    if (Notification.permission === 'denied') return 'blocked';
    return Notification.permission === 'granted' && localStorage.getItem(DEVICE_KEY) ? 'on' : 'off';
}

function keyBytes(base64Url: string): Uint8Array {
    const base64 = (base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function deviceId(endpoint: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
    return Array.from(new Uint8Array(digest).slice(0, 12), b => b.toString(16).padStart(2, '0')).join('');
}

/** Asks for permission (must be called from a tap) and registers this device. */
export async function enablePush(uid: string): Promise<PushState> {
    if (!supported()) return 'unsupported';
    if (!VAPID_PUBLIC_KEY) return 'unconfigured';
    if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'blocked' : 'off';
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    const json = subscription.toJSON();
    const id = await deviceId(subscription.endpoint);
    await setDoc(doc(db, `users/${uid}/private/push`), {
        subs: { [id]: { endpoint: json.endpoint, keys: json.keys, updatedAt: new Date().toISOString() } }
    }, { merge: true });
    localStorage.setItem(DEVICE_KEY, id);
    return 'on';
}

export async function disablePush(uid: string | null): Promise<PushState> {
    const id = localStorage.getItem(DEVICE_KEY);
    localStorage.removeItem(DEVICE_KEY);
    try {
        const registration = await navigator.serviceWorker.ready;
        await (await registration.pushManager.getSubscription())?.unsubscribe();
        if (uid && id) await updateDoc(doc(db, `users/${uid}/private/push`), { [`subs.${id}`]: deleteField() });
    } catch (e) {
        console.error('Could not remove the push subscription', e);
    }
    return pushState();
}

/** Tells the other members of the group. Returns how many devices were reached (0 when nobody has notifications on). */
export async function notifyFamily(groupId: string, title: string, body: string, tag?: string): Promise<number> {
    const user = auth.currentUser;
    if (!user || !VAPID_PUBLIC_KEY) return 0;
    try {
        const response = await fetch('/api/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
            body: JSON.stringify({ groupId, title, body, tag })
        });
        if (!response.ok) return 0;
        return Number((await response.json()).sent) || 0;
    } catch {
        return 0; // offline: the family still sees the meal when their app syncs
    }
}
