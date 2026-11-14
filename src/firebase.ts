import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
  orderBy,
  limit,
  writeBatch,
  runTransaction
} from 'firebase/firestore';
import type { DocumentData } from 'firebase/firestore';

// Firebase Configuration
// Environment variables are prioritized for security and deployment (Vercel/GitHub)
const env = import.meta.env;
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};
const firestoreDatabaseId: string = env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Offline cache that works with several tabs / PWA windows open at once.
// `ignoreUndefinedProperties` prevents a single `undefined` field from aborting a whole write.
export const db = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
}, firestoreDatabaseId);

export const googleProvider = new GoogleAuthProvider();

// Error Handling Spec for Firestore Operations
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/** Logs a Firestore failure with enough context to debug it. Never throws. */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Firestore Error: ', JSON.stringify({
    error: error instanceof Error ? error.message : String(error),
    code: (error as any)?.code,
    userId: auth.currentUser?.uid,
    operationType,
    path
  }));
}

/** Host that serves the sign-in helper pages (see README: sign-in inside the installed app). */
export const authDomain: string = firebaseConfig.authDomain ?? '';

export {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  onAuthStateChanged,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  deleteField,
  orderBy,
  limit,
  writeBatch,
  runTransaction
};
export type { User, DocumentData };
