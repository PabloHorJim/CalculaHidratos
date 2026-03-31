import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth } from '../firebase';

const PATIENT_SETTINGS_KEY = 'carbcalc_patient_settings';

export interface TimeProfile {
    time: string; // 'HH:mm' format
    ratio: number; // U/10g HC
    isf: number; // Sensibilidad (mg/dL bajados por 1U)
}

export interface PatientSettings {
    profiles: TimeProfile[];
    smoothInterpolation: boolean;
    targetBg: number;
    dia: number;
    precision: number; // Ej. 0.1, 0.5, 1
    modifiers: {
        exercise: number; // Ej. -30 (%)
        illness: number;  // Ej. +20 (%)
    };
}

const DEFAULT_SETTINGS: PatientSettings = {
    profiles: [
        { time: '00:00', ratio: 1.0, isf: 50 },
        { time: '08:00', ratio: 1.2, isf: 40 },
        { time: '14:00', ratio: 1.0, isf: 50 },
        { time: '21:00', ratio: 1.1, isf: 45 }
    ],
    smoothInterpolation: false,
    targetBg: 100,
    dia: 3,
    precision: 0.5,
    modifiers: {
        exercise: -30,
        illness: 20
    }
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

    const getActiveProfile = useCallback((): { ratio: number, isf: number } => {
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        // Sort profiles by time
        const sorted = [...settings.profiles].sort((a, b) => {
            const [aH, aM] = a.time.split(':').map(Number);
            const [bH, bM] = b.time.split(':').map(Number);
            return (aH * 60 + aM) - (bH * 60 + bM);
        });

        if (sorted.length === 0) return { ratio: 1, isf: 50 };
        if (sorted.length === 1) return { ratio: sorted[0].ratio, isf: sorted[0].isf };

        // Find current and next profile
        let currentP = sorted[sorted.length - 1]; // defaults to last if before first
        let nextP = sorted[0];

        for (let i = 0; i < sorted.length; i++) {
            const [h, m] = sorted[i].time.split(':').map(Number);
            const mins = h * 60 + m;
            if (currentMinutes >= mins) {
                currentP = sorted[i];
                nextP = sorted[(i + 1) % sorted.length];
            } else {
                break;
            }
        }

        if (!settings.smoothInterpolation) {
            return { ratio: currentP.ratio, isf: currentP.isf };
        }

        // Interpolation
        const [cH, cM] = currentP.time.split(':').map(Number);
        const [nH, nM] = nextP.time.split(':').map(Number);

        let cMins = cH * 60 + cM;
        let nMins = nH * 60 + nM;

        // Handle next day wrap-around
        if (nMins <= cMins) nMins += 24 * 60;
        let evalMins = currentMinutes;
        if (evalMins < cMins) evalMins += 24 * 60;

        const range = nMins - cMins;
        const elapsed = evalMins - cMins;
        const t = Math.max(0, Math.min(1, elapsed / range));

        // Quadratic ease-in-out interpolation
        const progress = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

        const exactRatio = currentP.ratio + (nextP.ratio - currentP.ratio) * progress;
        const exactIsf = currentP.isf + (nextP.isf - currentP.isf) * progress;

        return {
            ratio: Math.round(exactRatio * 100) / 100,
            isf: Math.round(exactIsf * 10) / 10
        };
    }, [settings.profiles, settings.smoothInterpolation]);

    return {
        settings,
        saveSettings,
        getActiveProfile,
        user,
        isSyncing,
        saveStatus
    };
}
