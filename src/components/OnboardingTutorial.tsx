import React, { useState } from 'react';
import { ChefHat, Scale, Users, X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface OnboardingTutorialProps {
    onDismiss: () => void;
}

const slides = [
    {
        icon: <Scale className="text-orange-500" size={48} />,
        title: 'Bienvenido a CarbCalc',
        description: 'Calcula los carbohidratos de tus comidas y reparte las raciones entre la familia. Diseñada especialmente para familias con miembros diabéticos.',
        color: 'bg-orange-50 border-orange-100',
    },
    {
        icon: <ChefHat className="text-green-500" size={48} />,
        title: 'Pestaña Cocinar',
        description: 'Busca ingredientes, añade las cantidades y mira los carbohidratos totales en tiempo real. Guarda la receta para reutilizarla.',
        color: 'bg-green-50 border-green-100',
    },
    {
        icon: <Scale className="text-purple-500" size={48} />,
        title: 'Pestaña Reparto',
        description: 'Pesa la comida con o sin utensilio, y la app calcula automáticamente cuánto toca a cada miembro según su proporción.',
        color: 'bg-purple-50 border-purple-100',
    },
    {
        icon: <Users className="text-blue-500" size={48} />,
        title: 'Familia y Nube',
        description: 'Configura los miembros de tu familia y sus proporciones. Marca quién es diabético. Sincroniza todo con la nube para compartir con la familia.',
        color: 'bg-blue-50 border-blue-100',
    },
];

export function OnboardingTutorial({ onDismiss }: OnboardingTutorialProps) {
    const [step, setStep] = useState(0);
    const current = slides[step];
    const isLast = step === slides.length - 1;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-6">
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden"
            >
                <div className="flex justify-end p-3">
                    <button onClick={onDismiss} className="p-2 text-gray-300 hover:text-gray-600 rounded-full hover:bg-gray-50 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -30 }}
                        transition={{ duration: 0.2 }}
                        className="px-8 pb-2"
                    >
                        <div className={`w-24 h-24 mx-auto rounded-3xl ${current.color} border flex items-center justify-center mb-6`}>
                            {current.icon}
                        </div>
                        <h3 className="text-xl font-black text-center text-gray-800 mb-3">{current.title}</h3>
                        <p className="text-sm text-gray-500 text-center leading-relaxed mb-4">{current.description}</p>
                    </motion.div>
                </AnimatePresence>

                {/* Step indicators */}
                <div className="flex justify-center gap-2 py-3">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            onClick={() => setStep(i)}
                            className={`w-2 h-2 rounded-full transition-all ${i === step ? 'bg-orange-500 w-6' : 'bg-gray-200 hover:bg-gray-300'}`}
                        />
                    ))}
                </div>

                <div className="p-6 pt-2">
                    {isLast ? (
                        <button
                            onClick={onDismiss}
                            className="w-full py-3.5 bg-orange-500 text-white rounded-2xl font-bold text-base hover:bg-orange-600 transition-colors"
                        >
                            ¡Empezar!
                        </button>
                    ) : (
                        <button
                            onClick={() => setStep(step + 1)}
                            className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold text-base hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                        >
                            Siguiente <ChevronRight size={18} />
                        </button>
                    )}
                </div>

                {/* Disclaimer at bottom of tutorial */}
                <div className="px-6 pb-5">
                    <p className="text-[9px] text-gray-400 text-center leading-tight">
                        ⚠️ Esta app no sustituye el consejo médico profesional. Consulta siempre con tu endocrino.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
