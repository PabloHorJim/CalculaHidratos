import React, { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, ExternalLink, AlertTriangle } from 'lucide-react';

export function LegalNotice() {
    const [showFullPolicy, setShowFullPolicy] = useState(false);

    return (
        <div className="space-y-6 pb-4">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Shield className="text-blue-500" size={24} />
                Información Legal
            </h2>

            {/* Disclaimer / No Warranty */}
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-200">
                <div className="flex items-start gap-3">
                    <AlertTriangle className="text-amber-500 flex-shrink-0 mt-0.5" size={20} />
                    <div>
                        <h3 className="font-bold text-amber-800 text-sm mb-1">Aviso Importante</h3>
                        <p className="text-xs text-amber-700 leading-relaxed">
                            Esta aplicación se proporciona <strong>sin garantía alguna</strong>.
                            Los cálculos son orientativos y <strong>no deben usarse como sustituto del consejo médico profesional</strong>.
                            Consulta siempre con tu endocrino o equipo médico para el manejo de la diabetes.
                            El desarrollador no se hace responsable de decisiones médicas basadas en los datos de esta app.
                        </p>
                    </div>
                </div>
            </div>

            {/* Data Protection - First Layer (RGPD Art. 13) */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-3 text-sm">Protección de Datos (RGPD/LOPDGDD)</h3>

                <div className="space-y-3 text-xs text-gray-600 leading-relaxed">
                    <div className="bg-blue-50 p-3 rounded-xl border border-blue-100">
                        <div className="text-[10px] uppercase font-bold text-blue-500 mb-1">Responsable</div>
                        {/* TODO: Replace with actual developer identity */}
                        <div className="font-medium text-gray-800">Pablo Hormigos Jiménez</div>
                        <div className="text-gray-400">Contacto: pablohormigosjimenez@gmail.com</div>
                    </div>

                    <div>
                        <strong className="text-gray-700">Finalidad del tratamiento:</strong> Gestionar cálculos de carbohidratos,
                        recetas, configuración familiar y sincronización entre dispositivos del mismo grupo familiar.
                    </div>

                    <div>
                        <strong className="text-gray-700">Base jurídica:</strong> Consentimiento del usuario
                        (Art. 6.1.a RGPD). Al utilizar la app y registrarte con Google, consientes el tratamiento de tus datos.
                    </div>

                    <div>
                        <strong className="text-gray-700">Datos tratados:</strong>
                        <ul className="list-disc list-inside mt-1 ml-2 space-y-0.5 text-gray-500">
                            <li>Nombre y email (proporcionados por Google Auth)</li>
                            <li>Foto de perfil de Google</li>
                            <li>Recetas, ingredientes y configuración familiar</li>
                            <li>Historial de comidas y repartos</li>
                        </ul>
                    </div>

                    <div>
                        <strong className="text-gray-700">Almacenamiento:</strong> Los datos se almacenan en Google Firebase (Firestore)
                        dentro de la UE. También se almacenan localmente en tu dispositivo (localStorage).
                    </div>

                    <div>
                        <strong className="text-gray-700">Cesión a terceros:</strong> No se ceden datos a terceros salvo a los miembros
                        de tu grupo familiar (si creas o te unes a uno) y a Google (como proveedor de infraestructura).
                    </div>

                    <div>
                        <strong className="text-gray-700">Conservación:</strong> Los datos se conservan mientras mantengas una cuenta activa.
                        Puedes solicitar su eliminación en cualquier momento.
                    </div>

                    <button
                        onClick={() => setShowFullPolicy(!showFullPolicy)}
                        className="w-full flex items-center justify-between py-2 text-blue-600 font-bold text-xs border-t border-gray-100 mt-2 pt-3"
                    >
                        <span>Tus derechos (ARSOLIPU)</span>
                        {showFullPolicy ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>

                    {showFullPolicy && (
                        <div className="bg-gray-50 p-3 rounded-xl space-y-2">
                            <p className="text-gray-600">
                                Conforme al RGPD y la LOPDGDD, tienes derecho a:
                            </p>
                            <ul className="list-disc list-inside space-y-1 text-gray-500">
                                <li><strong>Acceso:</strong> Conocer qué datos tenemos sobre ti</li>
                                <li><strong>Rectificación:</strong> Corregir datos inexactos</li>
                                <li><strong>Supresión:</strong> Solicitar la eliminación de tus datos</li>
                                <li><strong>Oposición:</strong> Oponerte a ciertos tratamientos</li>
                                <li><strong>Limitación:</strong> Solicitar que limitemos el uso de tus datos</li>
                                <li><strong>Portabilidad:</strong> Recibir tus datos en formato estructurado</li>
                                <li><strong>No ser objeto de decisiones automatizadas</strong></li>
                            </ul>
                            <p className="text-gray-500 mt-2">
                                Para ejercer estos derechos, contacta a:{' '}
                                <a href="mailto:pablohormigosjimenez@gmail.com" className="text-blue-600 underline">
                                    pablohormigosjimenez@gmail.com
                                </a>
                            </p>
                            <p className="text-gray-400 text-[10px] mt-2">
                                Si consideras que tus derechos no han sido atendidos adecuadamente, puedes presentar una reclamación ante la
                                {' '}<a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline inline-flex items-center gap-0.5">
                                    Agencia Española de Protección de Datos (AEPD) <ExternalLink size={10} />
                                </a>.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Cookies Notice */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100">
                <h3 className="font-bold text-gray-800 mb-2 text-sm">Cookies y Almacenamiento Local</h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                    Esta aplicación utiliza <strong>localStorage</strong> del navegador para almacenar tu configuración y datos localmente.
                    No utilizamos cookies de terceros ni rastreadores. Google Firebase utiliza cookies técnicas estrictamente necesarias
                    para la autenticación y el funcionamiento del servicio.
                </p>
            </div>
        </div>
    );
}
