import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// An installed PWA can stay open in the background for days, so besides checking on load
// we look for a new version every time the app comes back to the foreground (at most hourly).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    let lastCheck = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      if (Date.now() - lastCheck < 60 * 60 * 1000) return;
      lastCheck = Date.now();
      registration.update().catch(() => { /* offline or server unreachable: try next time */ });
    });
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
