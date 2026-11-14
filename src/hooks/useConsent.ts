import { useCallback, useState } from 'react';

const CONSENT_KEY = 'carbcalc_consent';

/** 'cloud' = accepted Firebase sync, 'local' = device-only storage, null = not answered yet. */
type Consent = 'cloud' | 'local' | null;

export function useConsent() {
    // 'true' is the value stored by older versions
    const [consent, setConsent] = useState<Consent>(() => {
        const stored = localStorage.getItem(CONSENT_KEY);
        if (stored === 'true' || stored === 'cloud') return 'cloud';
        if (stored === 'local') return 'local';
        return null;
    });

    const acceptConsent = useCallback(() => {
        setConsent('cloud');
        localStorage.setItem(CONSENT_KEY, 'cloud');
    }, []);

    /** Keep using the app with device-only storage: nothing is sent to Firebase. */
    const declineCloudConsent = useCallback(() => {
        setConsent('local');
        localStorage.setItem(CONSENT_KEY, 'local');
    }, []);

    return {
        hasConsent: consent === 'cloud',
        needsConsentPrompt: consent === null,
        acceptConsent,
        declineCloudConsent
    };
}
