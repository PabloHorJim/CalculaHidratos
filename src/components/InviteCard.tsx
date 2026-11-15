import React, { useEffect, useState } from 'react';
import { UserPlus, Share2, Copy, X } from 'lucide-react';
import { AppState } from '../hooks/useAppState';
import { copyText } from '../utils/share';

const INVITE_HOURS_TEXT = '24 horas';

/** Invitation to the family group: a code that works for a limited time, also as link and QR. */
export function InviteCard({ state }: { state: AppState }) {
    const { invite, createInvite, revokeInvite, setToast } = state;
    const [qr, setQr] = useState('');
    const [busy, setBusy] = useState(false);
    const link = invite ? `${window.location.origin}/?invite=${invite.code}` : '';

    // The QR library is only downloaded when an invitation is shown
    useEffect(() => {
        let cancelled = false;
        setQr('');
        if (!link) return;
        import('qrcode-generator').then(module => {
            if (cancelled) return;
            const code = module.default(0, 'M');
            code.addData(link);
            code.make();
            setQr(code.createDataURL(6, 12));
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [link]);

    const create = async () => {
        setBusy(true);
        await createInvite();
        setBusy(false);
    };

    if (!invite) {
        return (
            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800 mb-3">
                <button onClick={create} disabled={busy}
                    className="w-full min-h-11 bg-blue-500 disabled:opacity-60 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <UserPlus size={18} /> {busy ? 'Creando…' : 'Invitar a alguien'}
                </button>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
                    Se crea un código que sirve durante {INVITE_HOURS_TEXT}. Pasado ese tiempo hay que crear otro.
                </p>
            </div>
        );
    }

    const expires = new Date(invite.expiresAt).toLocaleString('es-ES', { weekday: 'long', hour: '2-digit', minute: '2-digit' });
    const message = `Únete a nuestra familia en CarbCalc: ${link}\n(o escribe el código ${invite.code} en Familia → Unirse a grupo). Caduca el ${expires}.`;
    const share = async () => {
        if (navigator.share) {
            try { await navigator.share({ text: message }); return; } catch { /* cancelled: fall back to copying */ }
        }
        setToast((await copyText(message)) ? 'Invitación copiada' : 'No se pudo copiar');
    };

    return (
        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-xl border border-blue-100 dark:border-blue-800 mb-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 font-bold uppercase">Código de invitación</div>
                    <div className="text-2xl font-mono font-black text-blue-900 dark:text-blue-200 tracking-widest select-all">{invite.code}</div>
                    <div className="text-xs text-blue-700 dark:text-blue-300">Válido hasta el {expires}</div>
                </div>
                <button onClick={revokeInvite} aria-label="Anular invitación" title="Anular invitación" className="p-2 text-blue-400 hover:text-red-500">
                    <X size={18} />
                </button>
            </div>
            {qr && (
                <div className="flex flex-col items-center gap-1">
                    <img src={qr} alt="Código QR de la invitación" className="w-44 h-44 rounded-lg bg-white" style={{ imageRendering: 'pixelated' }} />
                    <span className="text-xs text-blue-700 dark:text-blue-300">Escanéalo con la cámara del otro móvil</span>
                </div>
            )}
            <div className="flex gap-2">
                <button onClick={share} className="flex-1 min-h-11 bg-blue-500 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <Share2 size={16} /> Enviar
                </button>
                <button onClick={async () => setToast((await copyText(invite.code)) ? 'Código copiado' : 'No se pudo copiar')}
                    className="flex-1 min-h-11 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-xl font-bold text-sm flex items-center justify-center gap-2">
                    <Copy size={16} /> Copiar código
                </button>
            </div>
        </div>
    );
}
