import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';

const PATIENT_SETTINGS_KEY = 'carbcalc_patient_settings';

export interface PatientSettings {
    ratios: {
        breakfast: number;
        lunch: number;
        snack: number;
        dinner: number;
    };
    isf: number;
    targetBg: number;
    dia: number;
}

const DEFAULT_SETTINGS: PatientSettings = {
    ratios: { breakfast: 1.0, lunch: 1.0, snack: 1.0, dinner: 1.0 },
    isf: 50,
    targetBg: 100,
    dia: 3,
};

export function usePatientState() {
    const [settings, setSettings] = useState<PatientSettings>(DEFAULT_SETTINGS);
    const [user, setUser] = useState<User | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    // Load from local storage immediately
    useEffect(() => {
        const local = localStorage.getItem(PATIENT_SETTINGS_KEY);
        if (local) {
            try {
                setSettings(JSON.parse(local));
            } catch (e) {
                console.error("Failed to parse local patient settings", e);
            }
        }
    }, []);

    // Listen to Firebase Auth
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                // Fetch from Firebase
                try {
                    setIsSyncing(true);
                    const docRef = doc(db, 'users', currentUser.uid);
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        if (data.patientSettings) {
                            setSettings(data.patientSettings);
                            localStorage.setItem(PATIENT_SETTINGS_KEY, JSON.stringify(data.patientSettings));
                        }
                    }
                } catch (e) {
                    console.error("Error fetching patient settings from Firebase", e);
                } finally {
                    setIsSyncing(false);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // Save Settings
    const saveSettings = useCallback(async (newSettings: PatientSettings) => {
        setSettings(newSettings);
        localStorage.setItem(PATIENT_SETTINGS_KEY, JSON.stringify(newSettings));

        if (user) {
            setSaveStatus('saving');
            try {
                const docRef = doc(db, 'users', user.uid);
                await setDoc(docRef, { patientSettings: newSettings }, { merge: true });
                setSaveStatus('saved');
                setTimeout(() => setSaveStatus('idle'), 2000);
            } catch (e) {
                console.error("Error saving patient settings to Firebase", e);
                setSaveStatus('error');
            }
        }
    }, [user]);

    return {
        settings,
        saveSettings,
        user,
        isSyncing,
        saveStatus
    };
}
