import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface Detector { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> }
type DetectorCtor = new (options?: { formats?: string[] }) => Detector;

const detectorCtor = (): DetectorCtor | null =>
    (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector ?? null;

/** True when this browser can read barcodes with the camera (Chrome on Android; not iOS). */
export const canScanBarcodes = () => !!detectorCtor() && !!navigator.mediaDevices?.getUserMedia;

interface Props {
    onDetected: (barcode: string) => void;
    onClose: () => void;
}

/** Full-screen camera view that reports the first product barcode it sees. */
export function BarcodeScanner({ onDetected, onClose }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        const Ctor = detectorCtor();
        if (!Ctor) { setError('Este navegador no puede leer códigos de barras. Escribe el número.'); return; }
        let stream: MediaStream | null = null;
        let timer: ReturnType<typeof setInterval> | undefined;
        let done = false;
        const detector = new Ctor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(async s => {
            if (done) { s.getTracks().forEach(t => t.stop()); return; }
            stream = s;
            const video = videoRef.current;
            if (!video) return;
            video.srcObject = s;
            await video.play().catch(() => undefined);
            timer = setInterval(async () => {
                if (done || video.readyState < 2) return;
                try {
                    const codes = await detector.detect(video);
                    const code = codes.find(c => /^\d{8,14}$/.test(c.rawValue));
                    if (code && !done) { done = true; onDetected(code.rawValue); }
                } catch { /* frame not ready */ }
            }, 300);
        }).catch(() => setError('No se pudo abrir la cámara. Revisa el permiso o escribe el número.'));

        return () => {
            done = true;
            if (timer) clearInterval(timer);
            stream?.getTracks().forEach(t => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col" role="dialog" aria-label="Escanear código de barras">
            <div className="flex items-center justify-between p-4 text-white">
                <span className="font-bold">Apunta al código de barras</span>
                <button onClick={onClose} aria-label="Cerrar" className="p-2"><X size={24} /></button>
            </div>
            <div className="flex-1 relative">
                <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 h-28 border-2 border-white/80 rounded-xl" />
            </div>
            {error && <p className="p-4 text-white text-sm">{error}</p>}
        </div>
    );
}
