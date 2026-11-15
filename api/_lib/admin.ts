import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import type { ApiRequest } from './http.js';

/** Firebase Admin, initialised once per serverless instance from FIREBASE_SERVICE_ACCOUNT. */
function app() {
    if (admin.apps.length) return admin.app();
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.VITE_FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccount) {
        try {
            return admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccount)) });
        } catch (e) {
            console.error('Error parsing FIREBASE_SERVICE_ACCOUNT', e);
        }
    } else {
        console.warn('FIREBASE_SERVICE_ACCOUNT not set. Ensure default credentials are valid.');
    }
    return admin.initializeApp();
}

/** The same Firestore database the app uses (a named one when FIRESTORE_DATABASE_ID is set). */
export function firestore() {
    const id = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID;
    return id && id !== '(default)' ? getFirestore(app(), id) : getFirestore(app());
}

export const auth = () => admin.auth(app());

/** uid of the signed-in app user that sent the request ("Authorization: Bearer <Firebase ID token>"), or null. */
export async function requestUid(req: ApiRequest): Promise<string | null> {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;
    try {
        return (await auth().verifyIdToken(token)).uid;
    } catch {
        return null;
    }
}

export { admin };
