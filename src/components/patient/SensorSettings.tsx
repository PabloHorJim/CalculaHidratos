import React, { useState } from 'react';
import { Activity } from 'lucide-react';
import { GlucoseState } from '../../hooks/useGlucose';
import { latestReading, normalizeNightscoutUrl } from '../../glucose/sources';

interface Props {
    glucoseSensor: GlucoseState;
    signedIn: boolean;
    setToast: (message: string) => void;
}

/** Where sensor glucose comes from: nothing, the user's Nightscout site, or LibreLinkUp. */
export function SensorSettings({ glucoseSensor, signedIn, setToast }: Props) {
    const { config, setConfig, connectLibreLinkUp, readings, error, refresh } = glucoseSensor;
    const [type, setType] = useState(config.type);
    const [url, setUrl] = useState(config.nightscoutUrl ?? '');
    const [token, setToken] = useState(config.nightscoutToken ?? '');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);

    const card = 'bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-3';
    const field = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm outline-none focus:ring-2 focus:ring-cyan-200 dark:focus:ring-cyan-800 dark:text-gray-100';
    const label = 'text-xs font-bold text-gray-500 dark:text-gray-400 block mb-1';
    const tab = (active: boolean) => `flex-1 min-h-10 rounded-lg text-xs font-bold ${active ? 'bg-cyan-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`;
    const latest = latestReading(readings);
    const connected = config.type !== 'none' && config.type === type;

    const choose = (next: typeof type) => {
        setType(next);
        if (next === 'none' && config.type !== 'none') { setConfig({ type: 'none' }); setToast('Sensor desconectado'); }
    };

    const saveNightscout = async () => {
        const normalized = normalizeNightscoutUrl(url);
        if (!normalized) { setToast('Escribe la dirección de tu Nightscout (https://…)'); return; }
        setUrl(normalized);
        setConfig({ type: 'nightscout', nightscoutUrl: normalized, nightscoutToken: token.trim() });
    };

    const connectLibre = async () => {
        setBusy(true);
        const problem = await connectLibreLinkUp(email.trim(), password);
        setBusy(false);
        setPassword('');
        setToast(problem ?? 'LibreLinkUp conectado');
    };

    return (
        <section className={card}>
            <div className="text-sm font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2"><Activity size={16} className="text-cyan-500" /> Sensor de glucosa</div>
            <div className="flex gap-2" role="group" aria-label="Origen de la glucosa">
                <button className={tab(type === 'none')} aria-pressed={type === 'none'} onClick={() => choose('none')}>Ninguno</button>
                <button className={tab(type === 'librelinkup')} aria-pressed={type === 'librelinkup'} onClick={() => choose('librelinkup')}>LibreLinkUp</button>
                <button className={tab(type === 'nightscout')} aria-pressed={type === 'nightscout'} onClick={() => choose('nightscout')}>Nightscout</button>
            </div>

            {type === 'nightscout' && (
                <div className="space-y-2">
                    <label className="block"><span className={label}>Dirección de tu Nightscout</span>
                        <input type="url" inputMode="url" autoCapitalize="none" placeholder="https://minightscout.ejemplo.com" className={field} value={url} onChange={(e) => setUrl(e.target.value)} />
                    </label>
                    <label className="block"><span className={label}>Token de lectura (si tu sitio lo exige)</span>
                        <input type="password" autoComplete="off" className={field} value={token} onChange={(e) => setToken(e.target.value)} />
                    </label>
                    <button onClick={saveNightscout} className="w-full min-h-11 bg-cyan-500 text-white rounded-xl font-bold text-sm">Guardar y probar</button>
                </div>
            )}

            {type === 'librelinkup' && (
                <div className="space-y-2">
                    {config.type === 'librelinkup' && config.libre ? (
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            Conectado. La sesión caduca el {new Date(config.libre.expires).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}; entonces habrá que volver a escribir la contraseña.
                        </p>
                    ) : (
                        <p className="text-xs text-gray-600 dark:text-gray-300">
                            Usa una cuenta de <strong>LibreLinkUp</strong> (la app de seguidores) a la que hayas invitado desde FreeStyle LibreLink → Compartir. Puede ser una cuenta tuya con otro correo.
                        </p>
                    )}
                    {!signedIn && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">Inicia sesión en CarbCalc para usar LibreLinkUp.</p>}
                    <label className="block"><span className={label}>Correo de LibreLinkUp</span>
                        <input type="email" autoComplete="username" autoCapitalize="none" className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
                    </label>
                    <label className="block"><span className={label}>Contraseña</span>
                        <input type="password" autoComplete="current-password" className={field} value={password} onChange={(e) => setPassword(e.target.value)} />
                    </label>
                    <button onClick={connectLibre} disabled={busy || !signedIn || !email || !password}
                        className="w-full min-h-11 bg-cyan-500 disabled:opacity-50 text-white rounded-xl font-bold text-sm">
                        {busy ? 'Conectando…' : config.type === 'librelinkup' ? 'Volver a conectar' : 'Conectar'}
                    </button>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        La contraseña se envía una sola vez a LibreLinkUp a través del servidor de esta app y no se guarda. No es un servicio oficial de Abbott: puede dejar de funcionar si cambian su sistema.
                    </p>
                </div>
            )}

            {connected && (
                <div className="flex items-center justify-between gap-2 text-xs" aria-live="polite">
                    <span className={error ? 'text-red-600 dark:text-red-400 font-medium' : 'text-gray-600 dark:text-gray-300'}>
                        {error || (latest ? `Última lectura: ${latest.reading.mgdl} mg/dL hace ${latest.ageMinutes} min` : 'Leyendo…')}
                    </span>
                    <button onClick={() => refresh()} className="font-bold text-cyan-700 dark:text-cyan-400 underline py-2">Probar</button>
                </div>
            )}
            {type !== 'none' && (
                <p className="text-xs text-gray-500 dark:text-gray-400">Los datos de conexión se guardan solo en este móvil. El sensor va unos minutos por detrás de la sangre: ante la duda, mídete en el dedo.</p>
            )}
        </section>
    );
}
