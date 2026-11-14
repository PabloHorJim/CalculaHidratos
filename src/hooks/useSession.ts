import { useCallback, useEffect, useRef, useState } from 'react';
import { FamilyGroup, GroupMember } from '../types';
import { toPlain } from '../sync/merge';
import {
    auth, db, googleProvider, authDomain,
    signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged,
    doc, setDoc, getDoc, updateDoc, onSnapshot,
    arrayUnion, arrayRemove, deleteField,
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

function newInviteCode(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: easier to dictate
    const random = crypto.getRandomValues(new Uint8Array(8));
    return Array.from(random, n => alphabet[n % alphabet.length]).join('');
}

/**
 * Who is signed in and which family group they belong to.
 *
 * A group document lists its members (`memberUids`, `members`). Knowing the invite code
 * lets a user add themself to that list; only listed members can read the group's data,
 * and the admin can remove (and block) a member.
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
        if (memberTag === wantedTag) return;

        let cancelled = false;
        updateDoc(doc(db, 'groups', groupId), {
            memberUids: arrayUnion(user.uid),
            [`members.${user.uid}`]: memberInfo(user)
        }).then(() => {
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
        const inviteCode = newInviteCode();
        const newGroup: FamilyGroup = { id: inviteCode, name: groupName, adminUid: user.uid, inviteCode };

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

    const joinGroup = async (inviteCodeInput: string): Promise<boolean> => {
        if (!user) return false;
        const inviteCode = inviteCodeInput.trim().toUpperCase();
        if (!inviteCode || inviteCode.includes('/')) return false;
        const groupRef = doc(db, 'groups', inviteCode);

        let joined = false;
        try {
            // Knowing the code is what allows adding yourself to the member list
            await updateDoc(groupRef, {
                memberUids: arrayUnion(user.uid),
                [`members.${user.uid}`]: memberInfo(user)
            });
            joined = true;
        } catch (err) {
            const code = errorCode(err);
            if (code !== 'permission-denied' && code !== 'not-found') {
                handleFirestoreError(err, OperationType.UPDATE, `groups/${inviteCode}`);
                setToast('No se pudo unir al grupo. Comprueba tu conexión.');
                return false;
            }
            // Groups created by older versions of the app (before member lists existed)
            // accept whoever points their profile at them; registration then follows.
            try {
                if (!(await getDoc(groupRef)).exists()) throw err;
            } catch {
                setToast('Código de invitación inválido o sin acceso');
                return false;
            }
        }

        try {
            await setDoc(doc(db, 'users', user.uid), { uid: user.uid, groupId: inviteCode }, { merge: true });
            if (joined) rememberMembership(`${user.uid}:${inviteCode}`);
            setGroupId(inviteCode);
            setToast('Te has unido al grupo');
            return true;
        } catch (err) {
            handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
            setToast('No se pudo unir al grupo. Comprueba tu conexión.');
            return false;
        }
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

    /** Admin only: takes a member out of the group and prevents them from rejoining. */
    const removeGroupMember = async (member: GroupMember) => {
        if (!user || !groupId || !familyGroup || familyGroup.adminUid !== user.uid || member.uid === user.uid) return;
        if (!window.confirm(`¿Expulsar a ${member.displayName} del grupo? No podrá volver a unirse con el código.`)) return;
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
        createGroup, joinGroup, leaveGroup, removeGroupMember
    };
}
