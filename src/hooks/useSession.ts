import { useCallback, useEffect, useRef, useState } from 'react';
import { FamilyGroup, GroupMember } from '../types';
import { toPlain } from '../sync/merge';
import {
    auth, db, googleProvider, authDomain,
    signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
    doc, setDoc, getDoc, updateDoc, deleteDoc, onSnapshot,
    arrayUnion, arrayRemove, deleteField, Timestamp,
    OperationType, handleFirestoreError, User
} from '../firebase';

const MEMBER_KEY = 'carb_calc_member';
export const LOCAL_STATE_KEY = 'carb_calc_state';

interface Options {
    /** Local data has been loaded (so the stored group id is known). */
    isLoaded: boolean;
    hasConsent: boolean;
    acceptConsent: () => void;
    setToast: (message: string) => void;
    /** Shared data used to start a new group. */
    getGroupSeed: () => Record<string, unknown>;
    /** Called after signing out, to forget what this device knows about the cloud. */
    onSignedOut: () => void;
}

const errorCode = (err: unknown) => String((err as { code?: string })?.code ?? '');

const isStandalone = () =>
    window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

/** Redirect sign-in only works when the sign-in helper pages are served from the app's own host. */
const canUseRedirect = () => !!authDomain && authDomain === window.location.host;

function randomCode(length: number): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: easier to dictate
    const random = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(random, n => alphabet[n % alphabet.length]).join('');
}

const INVITE_KEY = 'carb_calc_invite';
const PENDING_INVITE_KEY = 'carb_calc_pending_invite';
/** How long an invitation works. */
export const INVITE_HOURS = 24;
/** Groups made by old app versions accept their old members for this long after the first one updates. */
const LEGACY_JOIN_DAYS = 30;

export interface Invite { groupId: string; code: string; expiresAt: number }

export const normalizeInviteCode = (text: string) => text.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

function loadInvite(): Invite | null {
    try {
        const invite = JSON.parse(localStorage.getItem(INVITE_KEY) || 'null') as Invite | null;
        return invite && invite.expiresAt > Date.now() ? invite : null;
    } catch {
        return null;
    }
}

/** An invitation link (…/?invite=CODE) opened on this device: remembered until it is used. */
function takeInviteFromUrl(): string {
    try {
        const params = new URLSearchParams(window.location.search);
        const code = normalizeInviteCode(params.get('invite') ?? '');
        if (code) {
            localStorage.setItem(PENDING_INVITE_KEY, code);
            params.delete('invite');
            const rest = params.toString();
            window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
        }
        return localStorage.getItem(PENDING_INVITE_KEY) ?? '';
    } catch {
        return '';
    }
}

/**
 * Who is signed in and which family group they belong to.
 *
 * A group document lists its members (`memberUids`, `members`). A temporary invitation
 * lets a user add themself to that list; only listed members can read the group's data,
 * and the admin can remove a member.
 */
export function useSession({ isLoaded, hasConsent, acceptConsent, setToast, getGroupSeed, onSignedOut }: Options) {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthReady, setIsAuthReady] = useState(false);
    // True once the user's profile document (which says which group they belong to) is known
    const [isProfileReady, setIsProfileReady] = useState(false);
    // Last known group, stored with the rest of the local data
    const [groupId, setGroupId] = useState<string | null>(() => {
        try {
            return JSON.parse(localStorage.getItem(LOCAL_STATE_KEY) || '{}').groupId || null;
        } catch {
            return null;
        }
    });
    // "<uid>:<groupId>" once this user is known to be on the group's member list
    const [memberTag, setMemberTag] = useState<string | null>(() => localStorage.getItem(MEMBER_KEY));
    const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
    const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
    const membershipRetries = useRef(0);
    // True while joinGroup is running, so the automatic registration below does not race with it
    const joining = useRef(false);
    const [invite, setInvite] = useState<Invite | null>(loadInvite);
    const [pendingInvite, setPendingInvite] = useState<string>(takeInviteFromUrl);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, currentUser => {
            setUser(currentUser);
            setIsAuthReady(true);
        });
        // Result of a redirect sign-in started before the page reloaded
        getRedirectResult(auth).catch(err => {
            console.error('Redirect sign-in failed', errorCode(err) || err);
            setToast('No se pudo completar el inicio de sesión');
        });
        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cloudEnabled = isLoaded && isAuthReady && !!user && hasConsent;

    const rememberMembership = (tag: string | null) => {
        if (tag) localStorage.setItem(MEMBER_KEY, tag);
        else localStorage.removeItem(MEMBER_KEY);
        setMemberTag(tag);
    };

    const memberInfo = (u: User) => ({ displayName: u.displayName ?? '', photoURL: u.photoURL ?? null });

    /**
     * Puts the user on the member list of a group their profile already points to.
     * In a group made by an old app version the first one to do it also starts the
     * period during which the other old members can still get in this way.
     */
    const registerInGroup = async (u: User, id: string) => {
        const ref = doc(db, 'groups', id);
        const entry = { memberUids: arrayUnion(u.uid), [`members.${u.uid}`]: memberInfo(u) };
        let legacy = false;
        try {
            const snapshot = await getDoc(ref);
            legacy = snapshot.exists() && !Array.isArray(snapshot.data().memberUids);
        } catch { /* not readable yet: a group that already has a member list */ }
        if (legacy) {
            try {
                await updateDoc(ref, { ...entry, legacyJoinUntil: Timestamp.fromMillis(Date.now() + LEGACY_JOIN_DAYS * 86400000) });
                return;
            } catch (err) {
                // Someone else registered first in the meantime: register the normal way
                if (errorCode(err) !== 'permission-denied') throw err;
            }
        }
        await updateDoc(ref, entry);
    };

    // User profile: make sure it exists and follow which group the user belongs to
    useEffect(() => {
        setIsProfileReady(false);
        if (!cloudEnabled || !user) return;

        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userDocRef, snapshot => {
            const data = snapshot.exists() ? snapshot.data() : null;
            // A cached "does not exist" only means this device has never seen the profile
            if (!data && snapshot.metadata.fromCache) return;

            setGroupId(data?.groupId || null);
            setIsProfileReady(true);

            const profile = { uid: user.uid, email: user.email, displayName: user.displayName, photoURL: user.photoURL };
            const isOutdated = !data || (Object.keys(profile) as (keyof typeof profile)[])
                .some(k => (data[k] ?? null) !== (profile[k] ?? null));
            if (isOutdated) {
                setDoc(userDocRef, profile, { merge: true })
                    .catch(err => handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`));
            }
        }, err => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`));

        return () => unsubscribe();
    }, [user, cloudEnabled]);

    // Make sure the user is on the member list of their group before reading it
    const wantedTag = user && groupId ? `${user.uid}:${groupId}` : null;
    useEffect(() => {
        if (!cloudEnabled || !isProfileReady || !user || !groupId || !wantedTag) return;
        if (memberTag === wantedTag || joining.current) return;

        let cancelled = false;
        registerInGroup(user, groupId).then(() => {
            if (!cancelled) rememberMembership(wantedTag);
        }).catch(err => {
            if (cancelled) return;
            handleFirestoreError(err, OperationType.UPDATE, `groups/${groupId}`);
            const code = errorCode(err);
            if (code === 'permission-denied' || code === 'not-found') {
                // Removed by the admin, or the group no longer exists
                setToast('Ya no perteneces a este grupo familiar');
                setDoc(doc(db, 'users', user.uid), { uid: user.uid, groupId: null }, { merge: true })
                    .catch(e => handleFirestoreError(e, OperationType.WRITE, `users/${user.uid}`));
                setGroupId(null);
            }
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cloudEnabled, isProfileReady, user, groupId, wantedTag, memberTag]);

    const isMember = !!wantedTag && memberTag === wantedTag;

    /** Document that holds the shared data: the group's, or the user's own when not in a group. */
    const syncDocPath = !cloudEnabled || !isProfileReady || !user
        ? null
        : groupId ? (isMember ? `groups/${groupId}` : null) : `users/${user.uid}`;

    /** Feed with every snapshot of the synced document to keep the group card up to date. */
    const handleRemoteDocument = useCallback((path: string, data: Record<string, unknown> | null) => {
        if (!path.startsWith('groups/')) return;
        const id = path.slice('groups/'.length);
        if (!data) {
            setFamilyGroup(null);
            setGroupMembers([]);
            return;
        }
        setFamilyGroup({
            id: String(data.id ?? id),
            name: String(data.name ?? ''),
            adminUid: String(data.adminUid ?? ''),
            inviteCode: String(data.inviteCode ?? id)
        });
        const members = (data.members && typeof data.members === 'object' ? data.members : {}) as Record<string, { displayName?: string; photoURL?: string | null }>;
        const uids = Array.isArray(data.memberUids) ? (data.memberUids as string[]) : Object.keys(members);
        setGroupMembers(uids.map(uid => ({
            uid,
            displayName: members[uid]?.displayName || 'Usuario',
            photoURL: members[uid]?.photoURL ?? null
        })));
    }, []);

    /** The server rejected reading the synced document. */
    const handleSyncError = useCallback((code: string, path: string) => {
        if (code !== 'permission-denied' || !path.startsWith('groups/')) return;
        // Probably removed from the group: check once by registering again
        if (membershipRetries.current >= 1) return;
        membershipRetries.current += 1;
        rememberMembership(null);
    }, []);

    useEffect(() => {
        if (!groupId) {
            setFamilyGroup(null);
            setGroupMembers([]);
        }
    }, [groupId]);

    // ---- sign in / out ----

    const handleLogin = async () => {
        if (!hasConsent) {
            const ok = window.confirm('Para iniciar sesión y sincronizar con tu familia, tus datos se guardarán en Firebase (Google Cloud). ¿Aceptas?');
            if (!ok) return;
            acceptConsent();
        }
        try {
            // Pop-ups are unreliable inside an installed app: use a full-page redirect there
            if (isStandalone() && canUseRedirect()) {
                await signInWithRedirect(auth, googleProvider);
                return;
            }
            await signInWithPopup(auth, googleProvider);
            setToast('Sesión iniciada');
        } catch (error) {
            const code = errorCode(error);
            if ((code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') && canUseRedirect()) {
                await signInWithRedirect(auth, googleProvider).catch(() => setToast('Error al iniciar sesión'));
            } else if (code === 'auth/popup-closed-by-user') {
                setToast('Inicio de sesión cancelado. Si la ventana no se abre, prueba desde el navegador.');
            } else if (code === 'auth/cancelled-popup-request') {
                // several clicks: the first pop-up is still open
            } else if (code === 'auth/popup-blocked') {
                setToast('Ventana emergente bloqueada. Permite las ventanas emergentes o abre la app en el navegador.');
            } else if (code === 'auth/unauthorized-domain') {
                setToast('Dominio no autorizado en Firebase Authentication');
            } else {
                console.error('Login failed', code || error);
                setToast('Error al iniciar sesión');
            }
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            rememberMembership(null);
            onSignedOut();
            setFamilyGroup(null);
            setGroupMembers([]);
            setGroupId(null);
            setToast('Sesión cerrada');
        } catch (error) {
            console.error('Logout failed', error);
        }
    };

    // ---- groups ----

    const createGroup = async (name: string): Promise<boolean> => {
        const groupName = name.trim();
        if (!user || !groupName) return false;
        // The id is not an invitation any more: people join with temporary codes (createInvite)
        const inviteCode = randomCode(20);
        const newGroup: FamilyGroup = { id: inviteCode, name: groupName, adminUid: user.uid, inviteCode: '' };

        try {
            await setDoc(doc(db, 'groups', inviteCode), toPlain({
                ...getGroupSeed(),
                ...newGroup,
                memberUids: [user.uid],
                members: { [user.uid]: memberInfo(user) },
                blockedUids: [],
                updatedAt: new Date().toISOString()
            }));
            await setDoc(doc(db, 'users', user.uid), { uid: user.uid, groupId: inviteCode }, { merge: true });
            rememberMembership(`${user.uid}:${inviteCode}`);
            setGroupId(inviteCode);
            setFamilyGroup(newGroup);
            setToast('Grupo creado');
            return true;
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `groups/${inviteCode}`);
            setToast('No se pudo crear el grupo. Comprueba tu conexión.');
            return false;
        }
    };

    const forgetPendingInvite = () => {
        try { localStorage.removeItem(PENDING_INVITE_KEY); } catch { /* ignore */ }
        setPendingInvite('');
    };

    /** Creates a code that lets someone join this group for the next 24 hours. */
    const createInvite = async (): Promise<Invite | null> => {
        if (!user || !groupId) return null;
        const created: Invite = { groupId, code: randomCode(8), expiresAt: Date.now() + INVITE_HOURS * 3600 * 1000 };
        try {
            await setDoc(doc(db, 'invites', created.code), {
                groupId, createdBy: user.uid, expiresAt: Timestamp.fromMillis(created.expiresAt)
            });
            // One invitation at a time per device: the previous one stops working
            if (invite && invite.groupId === groupId) deleteDoc(doc(db, 'invites', invite.code)).catch(() => undefined);
            localStorage.setItem(INVITE_KEY, JSON.stringify(created));
            setInvite(created);
            return created;
        } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'invites');
            setToast('No se pudo crear la invitación. Comprueba tu conexión.');
            return null;
        }
    };

    const revokeInvite = async () => {
        if (!invite) return;
        try {
            await deleteDoc(doc(db, 'invites', invite.code));
        } catch (err) {
            handleFirestoreError(err, OperationType.DELETE, 'invites');
            setToast('No se pudo anular la invitación');
            return;
        }
        localStorage.removeItem(INVITE_KEY);
        setInvite(null);
        setToast('Invitación anulada');
    };

    const joinGroup = async (inviteCodeInput: string): Promise<boolean> => {
        if (!user) return false;
        const code = normalizeInviteCode(inviteCodeInput);
        if (!code) return false;
        const profileRef = doc(db, 'users', user.uid);
        joining.current = true;
        try {
            return await joinWithCode(user, code, inviteCodeInput, profileRef);
        } finally {
            joining.current = false;
        }
    };

    const joinWithCode = async (user: User, code: string, inviteCodeInput: string, profileRef: ReturnType<typeof doc>): Promise<boolean> => {
        let targetGroup: string | null = null;
        try {
            const snapshot = await getDoc(doc(db, 'invites', code));
            if (snapshot.exists()) {
                const data = snapshot.data() as { groupId?: string; expiresAt?: { toMillis(): number } };
                if (!data.groupId || !data.expiresAt || data.expiresAt.toMillis() <= Date.now()) {
                    setToast('Esta invitación ha caducado. Pide una nueva.');
                    forgetPendingInvite();
                    return false;
                }
                targetGroup = data.groupId;
            }
        } catch (err) {
            handleFirestoreError(err, OperationType.GET, 'invites');
            setToast('No se pudo comprobar la invitación. Comprueba tu conexión.');
            return false;
        }

        try {
            if (targetGroup) {
                // The invitation named in my own member entry is what the server checks
                await updateDoc(doc(db, 'groups', targetGroup), {
                    memberUids: arrayUnion(user.uid),
                    [`members.${user.uid}`]: { ...memberInfo(user), invite: code }
                });
                await setDoc(profileRef, { uid: user.uid, groupId: targetGroup }, { merge: true });
            } else {
                // Not an invitation: maybe the permanent code of a group made by an old version,
                // which accepts whoever's profile points at it (for a limited time)
                targetGroup = inviteCodeInput.trim().toUpperCase();
                if (targetGroup.includes('/')) throw Object.assign(new Error('invalid'), { code: 'not-found' });
                await setDoc(profileRef, { uid: user.uid, groupId: targetGroup }, { merge: true });
                try {
                    await registerInGroup(user, targetGroup);
                } catch (err) {
                    await setDoc(profileRef, { uid: user.uid, groupId: null }, { merge: true }).catch(() => undefined);
                    throw err;
                }
            }
        } catch (err) {
            const failure = errorCode(err);
            if (failure === 'permission-denied' || failure === 'not-found') {
                setToast('Código de invitación inválido o caducado');
            } else {
                handleFirestoreError(err, OperationType.UPDATE, `groups/${targetGroup}`);
                setToast('No se pudo unir al grupo. Comprueba tu conexión.');
            }
            return false;
        }

        rememberMembership(`${user.uid}:${targetGroup}`);
        setGroupId(targetGroup);
        forgetPendingInvite();
        setToast('Te has unido al grupo');
        return true;
    };

    const leaveGroup = async () => {
        if (!user || !groupId) return;
        if (!window.confirm('¿Salir del grupo? Dejarás de ver los datos compartidos de la familia.')) return;
        try {
            // Best effort and not awaited (it would wait forever offline); it is still sent
            // before the profile change below, which is what actually takes the user out.
            updateDoc(doc(db, 'groups', groupId), {
                memberUids: arrayRemove(user.uid),
                [`members.${user.uid}`]: deleteField()
            }).catch(err => handleFirestoreError(err, OperationType.UPDATE, `groups/${groupId}`));
            await setDoc(doc(db, 'users', user.uid), { uid: user.uid, groupId: null }, { merge: true });
            rememberMembership(null);
            setGroupId(null);
            setFamilyGroup(null);
            setToast('Has salido del grupo');
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
            setToast('No se pudo salir del grupo. Comprueba tu conexión.');
        }
    };

    /** Admin only: takes a member out of the group. They need a new invitation to come back. */
    const removeGroupMember = async (member: GroupMember) => {
        if (!user || !groupId || !familyGroup || familyGroup.adminUid !== user.uid || member.uid === user.uid) return;
        if (!window.confirm(`¿Expulsar a ${member.displayName} del grupo? Para volver necesitará una invitación nueva.`)) return;
        try {
            await updateDoc(doc(db, 'groups', groupId), {
                memberUids: arrayRemove(member.uid),
                blockedUids: arrayUnion(member.uid),
                [`members.${member.uid}`]: deleteField()
            });
            setToast(`${member.displayName} ya no está en el grupo`);
        } catch (err) {
            handleFirestoreError(err, OperationType.UPDATE, `groups/${groupId}`);
            setToast('No se pudo expulsar al miembro');
        }
    };

    return {
        user, isAuthReady, cloudEnabled,
        groupId, familyGroup, groupMembers,
        syncDocPath, handleRemoteDocument, handleSyncError,
        handleLogin, handleLogout,
        createGroup, joinGroup, leaveGroup, removeGroupMember,
        invite: invite && invite.groupId === groupId && invite.expiresAt > Date.now() ? invite : null,
        createInvite, revokeInvite, pendingInvite, forgetPendingInvite
    };
}
