import { useState, useCallback, useRef } from 'react';

// Tipos para el resultado del NLP
export interface VoiceCommandResult {
    rawText: string;
    action: string | null;
    amount: number | null;
    ingredientName: string | null;
}

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

// Función NLP ligera con RegEx
function parseVoiceCommand(text: string): VoiceCommandResult {
    const lowerText = text.toLowerCase().trim();

    // Regex explicada:
    // (añadir|añade|pon|poner|suma|sumar) -> [Grupo 1: Acción opcional]
    // \s* -> espacios opcionales
    // (\d+) -> [Grupo 2: Cantidad numérica]
    // \s*(?:gramos|g|gr)? -> sufijo de gramos opcional
    // \s*(?:de\s+)? -> conector "de" opcional
    // (.*) -> [Grupo 3: Nombre del ingrediente]

    // Convertir palabras a números (cien -> 100, medio kilo -> 500) para casos simples
    let normalizedText = lowerText
        .replace(/\bcien\b/g, '100')
        .replace(/\bmedio kilo\b/g, '500')
        .replace(/\bdoscientos\b/g, '200')
        .replace(/\btrescientos\b/g, '300')
        .replace(/\bcuatrocientos\b/g, '400')
        .replace(/\bquinientos\b/g, '500')
        .replace(/\bmedio litro\b/g, '500')
        .replace(/\bun cuarto de kilo\b/g, '250');

    // Patrón 1: "pon 150 gramos de arroz" o "añadir 200 de leche" o "150 pan"
    const regexFull = /^(añadir|añade|pon|poner|suma|sumar)?\s*(\d+)\s*(?:gramos|g|gr|gramo|mililitros|ml)?\s*(?:de\s+)?(.+)$/i;

    // Test del regex
    const match = normalizedText.match(regexFull);

    if (match && match[2] && match[3]) {
        return {
            rawText: text,
            action: match[1] || 'añadir',
            amount: parseInt(match[2], 10),
            ingredientName: match[3].trim()
        };
    }

    // Patrón 2: Fallback (solo dijo el ingrediente, ej. "cebolla" o "añadir patata")
    const regexSimple = /^(añadir|añade|pon|poner|busca|buscar)?\s*(.+)$/i;
    const matchSimple = normalizedText.match(regexSimple);

    if (matchSimple && matchSimple[2]) {
        return {
            rawText: text,
            action: matchSimple[1] || null,
            amount: null,
            ingredientName: matchSimple[2].trim()
        };
    }

    return { rawText: text, action: null, amount: null, ingredientName: text };
}
