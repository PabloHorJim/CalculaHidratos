import { useCallback, useEffect, useRef, useState } from 'react';
import { auth } from '../firebase';
import { GlucoseConfig, GlucoseError, Reading, connectLibre, fetchLibre, fetchNightscout } from '../glucose/sources';

const CONFIG_KEY = 'carbcalc_glucose';
const POLL_MS = 60 * 1000;

function loadConfig(): GlucoseConfig {
    try {
        const parsed = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') as GlucoseConfig | null;
        if (parsed && (parsed.type === 'nightscout' || parsed.type === 'librelinkup')) return parsed;
    } catch { /* fall through */ }
    return { type: 'none' };
}

/**
 * Keeps the last hours of sensor glucose while the app is open and patient mode is on.
 * The connection details live only in this device's storage.
 */
export function useGlucose(enabled: boolean) {
    const [config, setConfigState] = useState<GlucoseConfig>(loadConfig);
    const [readings, setReadings] = useState<Reading[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const configRef = useRef(config);
    configRef.current = config;

    const setConfig = useCallback((next: GlucoseConfig) => {
        try {
            if (next.type === 'none') localStorage.removeItem(CONFIG_KEY);
            else localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
        } catch { /* storage full or blocked: works until the app is closed */ }
        setConfigState(next);
        setReadings([]);
        setError('');
    }, []);

    const refresh = useCallback(async (): Promise<boolean> => {
        const current = configRef.current;
        if (current.type === 'none') return false;
        setLoading(true);
        try {
            let next: Reading[];
            if (current.type === 'nightscout') {
                next = await fetchNightscout(current);
            } else {
                const user = auth.currentUser;
                if (!user) throw new GlucoseError('Inicia sesión en la app para leer LibreLinkUp');
                next = await fetchLibre(current, await user.getIdToken());
            }
            if (configRef.current !== current) return false; // source changed meanwhile
            setReadings(next);
            setError(next.length === 0 ? 'El sensor no ha enviado lecturas recientes' : '');
            return next.length > 0;
        } catch (e) {
            if (configRef.current !== current) return false;
            setError(e instanceof GlucoseError ? e.message : 'No se pudo leer el sensor. ¿Hay conexión?');
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    const active = enabled && config.type !== 'none';
    useEffect(() => {
        if (!active) return;
        refresh();
        const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
        const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [active, config, refresh]);

    /** Signs in to LibreLinkUp; only the session it returns is kept, never the password. */
    const connectLibreLinkUp = useCallback(async (email: string, password: string): Promise<string | null> => {
        const user = auth.currentUser;
        if (!user) return 'Inicia sesión en la app primero';
        try {
            const libre = await connectLibre(await user.getIdToken(), email, password);
            setConfig({ type: 'librelinkup', libre });
            return null;
        } catch (e) {
            return e instanceof GlucoseError ? e.message : 'No se pudo conectar con LibreLinkUp';
        }
    }, [setConfig]);

    return { config, setConfig, readings, error, loading, refresh, connectLibreLinkUp, active };
}

export type GlucoseState = ReturnType<typeof useGlucose>;
