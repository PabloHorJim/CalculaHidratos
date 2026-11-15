import React, { useState } from 'react';
import { Settings, Bell, Type, Download } from 'lucide-react';
import { AppState } from '../hooks/useAppState';
import { Prefs, TEXT_SCALES } from '../hooks/usePrefs';
import { enablePush, disablePush, pushState, PushState } from '../push';

interface SettingsTabProps {
    state: AppState;
    prefs: Prefs;
    updatePrefs: (updates: Partial<Prefs>) => void;
}

const PUSH_HELP: Record<PushState, string> = {
    unsupported: 'Este navegador no admite avisos. En iPhone hay que instalar antes la app en la pantalla de inicio (Compartir → Añadir a pantalla de inicio).',
    unconfigured: 'Los avisos todavía no están configurados en el servidor (ver README).',
    blocked: 'Los avisos están bloqueados para esta app. Actívalos en los ajustes del navegador o del móvil (Notificaciones → CarbCalc).',
    off: 'Recibe un aviso en este móvil cuando alguien de la familia guarde un reparto.',
    on: 'Este móvil recibe un aviso cuando alguien de la familia guarda un reparto.'
};

/** Settings of this device: text size, notifications, installation. */
export function SettingsTab({ state, prefs, updatePrefs }: SettingsTabProps) {
    const { user, groupId, setToast, isInstallable, handleInstallClick } = state;
    const [push, setPush] = useState<PushState>(pushState);
    const [busy, setBusy] = useState(false);

    const togglePush = async () => {
        if (!user) { setToast('Inicia sesión para recibir avisos'); return; }
        setBusy(true);
        try {
            const next = push === 'on' ? await disablePush(user.uid) : await enablePush(user.uid);
            setPush(next);
            if (next === 'on') setToast('Avisos activados en este móvil');
        } catch (e) {
            console.error('Could not change notifications', e);
            setToast('No se pudieron activar los avisos');
        } finally {
            setBusy(false);
        }
    };

    const card = 'bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-3';
    const title = 'text-base font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2';
    const help = 'text-sm text-gray-600 dark:text-gray-300';
    const canToggle = push === 'on' || push === 'off';

    return (
        <div className="space-y-4 pb-4">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <Settings className="text-orange-500" size={24} /> Ajustes de este móvil
            </h2>

            <section className={card}>
                <div className={title}><Type size={18} className="text-orange-500" /> Tamaño del texto</div>
                <div className="flex gap-2" role="group" aria-label="Tamaño del texto">
                    {TEXT_SCALES.map(option => (
                        <button key={option.value} onClick={() => updatePrefs({ textScale: option.value })} aria-pressed={prefs.textScale === option.value}
                            className={`flex-1 min-h-12 rounded-xl font-bold border ${prefs.textScale === option.value
                                ? 'bg-orange-500 border-orange-500 text-white'
                                : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'}`}
                            style={{ fontSize: `${14 * option.value}px` }}>
                            {option.label}
                        </button>
                    ))}
                </div>
                <p className={help}>Cambia el tamaño de toda la app solo en este móvil. También puedes ampliar cualquier pantalla pellizcando con dos dedos.</p>
            </section>

            <section className={card}>
                <div className={title}><Bell size={18} className="text-orange-500" /> Avisos de la familia</div>
                <p className={help}>{PUSH_HELP[push]}</p>
                {canToggle && (
                    <button onClick={togglePush} disabled={busy || !user} aria-pressed={push === 'on'}
                        className={`w-full min-h-12 rounded-xl font-bold disabled:opacity-50 ${push === 'on'
                            ? 'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200'
                            : 'bg-orange-500 text-white'}`}>
                        {busy ? 'Un momento…' : push === 'on' ? 'Desactivar avisos en este móvil' : 'Activar avisos en este móvil'}
                    </button>
                )}
                {!user && canToggle && <p className={help}>Inicia sesión para poder activarlos.</p>}
                {user && !groupId && canToggle && <p className={help}>Los avisos se envían entre los miembros de un grupo familiar: crea uno o únete en Familia.</p>}
                <label className="flex items-center justify-between gap-3 min-h-11">
                    <span className="text-sm text-gray-700 dark:text-gray-200">Avisar a la familia cuando yo guarde un reparto</span>
                    <input type="checkbox" className="w-6 h-6 accent-orange-500" checked={prefs.notifyOnSave} onChange={(e) => updatePrefs({ notifyOnSave: e.target.checked })} />
                </label>
            </section>

            {isInstallable && (
                <section className={card}>
                    <div className={title}><Download size={18} className="text-orange-500" /> Instalar la app</div>
                    <button onClick={handleInstallClick} className="w-full min-h-12 bg-orange-500 text-white rounded-xl font-bold">Instalar en este móvil</button>
                </section>
            )}
        </div>
    );
}
