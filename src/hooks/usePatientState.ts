import { useCallback, useEffect, useMemo, useState } from 'react';
import { BolusRecord, PatientSettings, DEFAULT_PATIENT_SETTINGS, normalizeSettings } from '../utils/bolus';
import { useCloudSync, SyncField } from './useCloudSync';
import type { User } from '../firebase';

const STORAGE_KEY = 'carbcalc_patient';
export const PATIENT_BASE_KEY = 'carb_calc_sync_base_patient';
const BOLUS_HISTORY_LIMIT = 500;

interface PatientData extends Record<string, unknown> {
    settings: PatientSettings;
    bolusHistory: BolusRecord[];
}

const sortBoluses = (list: unknown): BolusRecord[] =>
    (Array.isArray(list) ? (list as BolusRecord[]) : [])
        .filter(r => r && typeof r.id === 'string' && typeof r.timestamp === 'string')
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, BOLUS_HISTORY_LIMIT);

const FIELDS: { [K in keyof PatientData]: SyncField } = {
    settings: { normalize: normalizeSettings },
    bolusHistory: { key: 'id', normalize: sortBoluses }
};

function loadLocal(): PatientData {
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        return { settings: normalizeSettings(parsed?.settings), bolusHistory: sortBoluses(parsed?.bolusHistory) };
    } catch {
        return { settings: DEFAULT_PATIENT_SETTINGS, bolusHistory: [] };
    }
}

interface Options {
    user: User | null;
    /** Signed in and cloud sync accepted. */
    cloudEnabled: boolean;
}

/**
 * Patient mode data: insulin settings and the log of doses.
 * It is medical data, so it never goes into the family group: it is kept on the device and,
 * when signed in, in a private document only its owner can read (users/<uid>/private/patient).
 */
export function usePatientState({ user, cloudEnabled }: Options) {
    const [data, setData] = useState<PatientData>(loadLocal);

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save patient data locally', e);
        }
    }, [data]);

    const apply = useCallback((patch: Partial<PatientData>) => setData(prev => ({ ...prev, ...patch })), []);

    const { status } = useCloudSync<PatientData>({
        docPath: cloudEnabled && user ? `users/${user.uid}/private/patient` : null,
        local: data,
        fields: FIELDS,
        apply,
        createIfMissing: true,
        storageKey: PATIENT_BASE_KEY
    });

    const updateSettings = useCallback((updates: Partial<PatientSettings>) => {
        setData(prev => ({ ...prev, settings: normalizeSettings({ ...prev.settings, ...updates }) }));
    }, []);

    const addBolus = useCallback((record: Omit<BolusRecord, 'id' | 'timestamp'>) => {
        const now = new Date();
        setData(prev => ({
            ...prev,
            bolusHistory: sortBoluses([{ ...record, id: now.getTime().toString(), timestamp: now.toISOString() }, ...prev.bolusHistory])
        }));
    }, []);

    const removeBolus = useCallback((id: string) => {
        setData(prev => ({ ...prev, bolusHistory: prev.bolusHistory.filter(r => r.id !== id) }));
    }, []);

    return useMemo(() => ({
        settings: data.settings,
        bolusHistory: data.bolusHistory,
        syncStatus: status,
        updateSettings, addBolus, removeBolus
    }), [data, status, updateSettings, addBolus, removeBolus]);
}

export type PatientState = ReturnType<typeof usePatientState>;
