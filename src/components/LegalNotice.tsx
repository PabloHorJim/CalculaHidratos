import React from 'react';
import { Shield, Mail, Scale } from 'lucide-react';

export function LegalNotice() {
    return (
        <div className="space-y-6 pb-8">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
                <Shield className="text-blue-500" size={24} />
                Información Legal
            </h2>

            <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 transition-colors">
                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase mb-2">Responsable del Tratamiento</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        Pablo Hormigos Jiménez<br />
                        Contacto: <a href="mailto:pablohorjim@gmail.com" className="text-blue-500 underline">pablohorjim@gmail.com</a>
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase mb-2">Finalidad</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        Los datos se utilizan exclusivamente para el funcionamiento de la aplicación: calcular carbohidratos, gestionar recetas, repartir raciones y mantener un historial de comidas.
                        Si activas la sincronización, los datos se almacenan en Firebase (Google Cloud) para compartirlos entre tus dispositivos y con tu grupo familiar.
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase mb-2">Base Jurídica</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        Consentimiento del interesado (Art. 6.1.a RGPD). El usuario da su consentimiento explícito al aceptar el aviso de privacidad mostrado en el primer uso de la aplicación.
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase mb-2">Datos Recopilados</h3>
                    <ul className="text-xs text-gray-600 dark:text-gray-400 list-disc list-inside space-y-1">
                        <li>Nombre y email (solo si inicias sesión con Google)</li>
                        <li>Recetas, ingredientes, cantidades</li>
                        <li>Miembros de la familia y proporciones</li>
                        <li>Historial de comidas</li>
                        <li>No se recopilan datos de salud protegidos</li>
                    </ul>
                </div>

                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase mb-2">Derechos</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        Conforme al RGPD y la LOPDGDD, puedes ejercer los derechos de acceso, rectificación, supresión,
                        limitación, portabilidad y oposición contactando a{' '}
                        <a href="mailto:pablohorjim@gmail.com" className="text-blue-500 underline">pablohorjim@gmail.com</a>.
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase mb-2">Almacenamiento</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        Los datos se almacenan en el dispositivo (localStorage / IndexedDB) y, opcionalmente, en servidores de Firebase (Google Cloud Platform) ubicados en la UE.
                        Los datos se conservan mientras el usuario mantenga activa la aplicación.
                    </p>
                </div>

                <div>
                    <h3 className="text-sm font-black text-gray-800 dark:text-gray-200 uppercase mb-2">Cookies y Rastreo</h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                        CarbCalc no utiliza cookies de terceros ni rastreadores publicitarios. Solo se utiliza localStorage para la persistencia local de datos.
                    </p>
                </div>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-800">
                <div className="flex items-start gap-3">
                    <Scale className="text-amber-500 mt-0.5 shrink-0" size={20} />
                    <div>
                        <h3 className="text-xs font-black text-amber-700 dark:text-amber-400 uppercase mb-1">Descargo de Responsabilidad Médica</h3>
                        <p className="text-[11px] text-amber-600 dark:text-amber-400/80 leading-relaxed">
                            CarbCalc es una herramienta de cálculo orientativa. No sustituye al consejo médico profesional.
                            Los cálculos de carbohidratos son aproximaciones y pueden contener errores.
                            Consulta siempre con tu endocrino o equipo médico las decisiones sobre tu tratamiento.
                        </p>
                    </div>
                </div>
            </div>

            <div className="text-center">
                <a
                    href="mailto:pablohorjim@gmail.com?subject=CarbCalc%20—%20Consulta%20Legal"
                    className="inline-flex items-center gap-2 text-xs font-bold text-blue-500 hover:underline"
                >
                    <Mail size={14} />
                    Contactar para ejercer tus derechos
                </a>
            </div>
        </div>
    );
}
