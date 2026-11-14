import { useState, useCallback, useRef } from 'react';

import { parseVoiceCommand, VoiceCommandResult } from '../utils/voice';

export type { VoiceCommandResult };

export function useVoiceRecognition() {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    // Tipado flexible para la API web nativa
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const isSupported = !!SpeechRecognition;

    const recognitionRef = useRef<any>(null);

    // Inicialización perezosa (lazy)
    if (isSupported && !recognitionRef.current) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = false; // Solo una frase por pulsación
        recognitionRef.current.interimResults = false;
        recognitionRef.current.lang = 'es-ES'; // Castellano
    }

    const startListening = useCallback((onResult: (result: VoiceCommandResult) => void) => {
        if (!isSupported || !recognitionRef.current) {
            setError('Tu navegador no soporta reconocimiento de voz.');
            return;
        }

        setError(null);
        setIsListening(true);
        setTranscript('');

        recognitionRef.current.onresult = (event: any) => {
            const currentTranscript = event.results[0][0].transcript;
            setTranscript(currentTranscript);

            // Procesamiento de Lenguaje Natural (NLP) súper sencillo
            const result = parseVoiceCommand(currentTranscript);
            onResult(result);
        };

        recognitionRef.current.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current.onerror = (event: any) => {
            console.error('Error de voz:', event.error);
            if (event.error === 'not-allowed') {
                setError('Permiso de micrófono denegado.');
            } else {
                setError(`Error al escuchar: ${event.error}`);
            }
            setIsListening(false);
        };

        recognitionRef.current.start();
    }, [isSupported]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    }, [isListening]);

    return {
        isListening,
        transcript,
        startListening,
        stopListening,
        isSupported,
        error
    };
}
