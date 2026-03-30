import React from 'react';
import { Shield, Cookie } from 'lucide-react';
import { motion } from 'motion/react';
import { AppState } from '../hooks/useAppState';

interface CookieConsentProps {
    state: AppState;
}

export function CookieConsent({ state }: CookieConsentProps) {
    const { acceptConsent } = state;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
            <motion.div
                initial={{ y: 100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: 'spring', damping: 25 }}
                className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center text-white">
                        <Cookie size={22} />
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-gray-800 dark:text-gray-100">Privacidad y Datos</h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase">RGPD / LOPDGDD</p>
                    </div>
                </div>

                <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed space-y-2">
                    <p>
                        CarbCalc utiliza <strong>almacenamiento local</strong> (localStorage) para guardar tu configuración
                        y datos en tu dispositivo.
                    </p>
                    <p>
                        Si inicias sesión con Google, tus datos se sincronizarán con <strong>Firebase (Google Cloud)</strong>{' '}
                        para compartirlos entre dispositivos y con tu familia.
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        No utilizamos cookies de terceros ni rastreadores. Consulta la sección{' '}
                        <strong>Información Legal</strong> para más detalles sobre tus derechos.
                    </p>
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={acceptConsent}
                        className="w-full py-3 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                    >
                        <Shield size={16} />
                        Aceptar y continuar
                    </button>
                    <button
                        onClick={acceptConsent}
                        className="w-full py-2 text-gray-400 dark:text-gray-500 text-xs font-medium hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        Solo funcionalidad básica (sin nube)
                    </button>
                </div>

                <p className="text-[9px] text-gray-300 dark:text-gray-600 text-center leading-tight">
                    Al aceptar, consientes el tratamiento de tus datos conforme al Art. 6.1.a RGPD.
                    Puedes revocar tu consentimiento en cualquier momento.
                </p>
            </motion.div>
        </motion.div>
    );
}
