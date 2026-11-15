import { useCallback, useEffect, useState } from 'react';

/** Preferences of this device (not synced): each person sets up their own phone. */
export interface Prefs {
    /** Size of all text: 1 = normal. */
    textScale: 1 | 1.15 | 1.3;
    /** Tell the family (push notification) when a split is saved. */
    notifyOnSave: boolean;
}

const KEY = 'carbcalc_prefs';
const DEFAULTS: Prefs = { textScale: 1, notifyOnSave: true };
export const TEXT_SCALES: { value: Prefs['textScale']; label: string }[] = [
    { value: 1, label: 'Normal' }, { value: 1.15, label: 'Grande' }, { value: 1.3, label: 'Muy grande' }
];

export function loadPrefs(): Prefs {
    try {
        const parsed = JSON.parse(localStorage.getItem(KEY) || '{}');
        return {
            textScale: TEXT_SCALES.some(s => s.value === parsed.textScale) ? parsed.textScale : DEFAULTS.textScale,
            notifyOnSave: typeof parsed.notifyOnSave === 'boolean' ? parsed.notifyOnSave : DEFAULTS.notifyOnSave
        };
    } catch {
        return DEFAULTS;
    }
}

export function usePrefs() {
    const [prefs, setPrefs] = useState<Prefs>(loadPrefs);

    // Every size in the app is relative to this one
    useEffect(() => {
        document.documentElement.style.fontSize = `${prefs.textScale * 100}%`;
    }, [prefs.textScale]);

    const updatePrefs = useCallback((updates: Partial<Prefs>) => {
        setPrefs(prev => {
            const next = { ...prev, ...updates };
            try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
            return next;
        });
    }, []);

    return { prefs, updatePrefs };
}
