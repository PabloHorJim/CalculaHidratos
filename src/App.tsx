import React, { lazy, Suspense, useCallback, useEffect } from 'react';
import {
  ChefHat,
  Syringe,
  Scale,
  Users,
  Menu,
  Calculator,
  Info,
  CheckCircle2,
  Cookie
} from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';

import { useAppState, MAIN_TABS, PATIENT_TABS } from './hooks/useAppState';
import { usePatientState } from './hooks/usePatientState';
import { useGlucose } from './hooks/useGlucose';
import { usePrefs } from './hooks/usePrefs';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { RecipeTab } from './components/RecipeTab';
import { SplitTab } from './components/SplitTab';
import { Sidebar } from './components/Sidebar';
import { NavButton } from './components/NavButton';
import { CookieConsent } from './components/CookieConsent';

// The two screens used at every meal load with the app. The rest are separate files that
// are fetched in the background right after start-up (see below), so opening them later
// is instant and works offline, but they do not delay the first screen.
const screens = {
  family: () => import('./components/FamilyTab'),
  quick: () => import('./components/QuickTab'),
  cookware: () => import('./components/CookwareTab'),
  ingredients: () => import('./components/IngredientsTab'),
  history: () => import('./components/HistoryTab'),
  stats: () => import('./components/StatsTab'),
  dose: () => import('./components/patient/DoseTab'),
  patient: () => import('./components/patient/PatientSettingsTab'),
  settings: () => import('./components/SettingsTab'),
  legal: () => import('./components/LegalNotice'),
  tutorial: () => import('./components/OnboardingTutorial')
};
const FamilyTab = lazy(() => screens.family().then(m => ({ default: m.FamilyTab })));
const QuickTab = lazy(() => screens.quick().then(m => ({ default: m.QuickTab })));
const CookwareTab = lazy(() => screens.cookware().then(m => ({ default: m.CookwareTab })));
const IngredientsTab = lazy(() => screens.ingredients().then(m => ({ default: m.IngredientsTab })));
const HistoryTab = lazy(() => screens.history().then(m => ({ default: m.HistoryTab })));
const StatsTab = lazy(() => screens.stats().then(m => ({ default: m.StatsTab })));
const DoseTab = lazy(() => screens.dose().then(m => ({ default: m.DoseTab })));
const PatientSettingsTab = lazy(() => screens.patient().then(m => ({ default: m.PatientSettingsTab })));
const SettingsTab = lazy(() => screens.settings().then(m => ({ default: m.SettingsTab })));
const LegalNotice = lazy(() => screens.legal().then(m => ({ default: m.LegalNotice })));
const OnboardingTutorial = lazy(() => screens.tutorial().then(m => ({ default: m.OnboardingTutorial })));

function preloadScreens() {
  Object.values(screens).forEach(load => load().catch(() => { /* offline: loaded on demand later */ }));
}

export default function App() {
  const state = useAppState();
  const { activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen, user, syncStatus, toast, showTutorial, dismissTutorial, needsConsentPrompt } = state;

  const patient = usePatientState({ user, cloudEnabled: state.cloudEnabled });
  const patientMode = patient.settings.enabled;
  const glucoseSensor = useGlucose(patientMode);
  const { prefs, updatePrefs } = usePrefs();

  // Fetch the secondary screens once the first one is on screen and the browser is idle
  useEffect(() => {
    const idle = (window as unknown as { requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number }).requestIdleCallback;
    const timer = idle ? idle(preloadScreens, { timeout: 4000 }) : window.setTimeout(preloadScreens, 1500);
    return () => {
      if (idle) (window as unknown as { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(timer);
      else window.clearTimeout(timer);
    };
  }, []);
  const mainTabs = patientMode ? PATIENT_TABS : MAIN_TABS;

  const currentTabIndex = mainTabs.indexOf(activeTab);

  const goToNextTab = useCallback(() => {
    if (currentTabIndex >= 0 && currentTabIndex < mainTabs.length - 1) {
      setActiveTab(mainTabs[currentTabIndex + 1]);
    }
  }, [currentTabIndex, setActiveTab, mainTabs]);

  const goToPrevTab = useCallback(() => {
    if (currentTabIndex > 0) {
      setActiveTab(mainTabs[currentTabIndex - 1]);
    }
  }, [currentTabIndex, setActiveTab, mainTabs]);

  const { onTouchStart, onTouchEnd } = useSwipeNavigation({
    onSwipeLeft: goToNextTab,
    onSwipeRight: goToPrevTab,
  });

  return (
    <MotionConfig reducedMotion="user">
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-24 transition-colors duration-300"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Cookie Consent */}
      {needsConsentPrompt && <CookieConsent state={state} />}

      {/* Tutorial Overlay */}
      {showTutorial && <Suspense fallback={null}><OnboardingTutorial onDismiss={dismissTutorial} /></Suspense>}

      {/* Sidebar */}
      <Sidebar state={state} patient={patient} />

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 px-4 sm:px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] shadow-sm dark:shadow-gray-900/50 sticky top-0 z-20 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              aria-label="Abrir menú"
              className="p-2 -ml-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-200 dark:shadow-orange-900/30">
                <Calculator size={20} />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight leading-none">CarbCalc</h1>
                <div className="flex items-center gap-1.5" role="status">
                  {!user ? (
                    <span className="text-[0.625rem] font-bold uppercase text-gray-500">Local</span>
                  ) : syncStatus === 'offline' ? (
                    <span className="text-[0.625rem] font-bold uppercase text-amber-500" title="Los cambios se guardan en este dispositivo y se enviarán al recuperar la conexión">Sin conexión</span>
                  ) : syncStatus === 'error' ? (
                    <span className="text-[0.625rem] font-bold uppercase text-red-500" title="No se pudo sincronizar con la nube">Error de nube</span>
                  ) : syncStatus === 'saving' || syncStatus === 'connecting' ? (
                    <span className="text-[0.625rem] font-bold uppercase text-blue-400">Nube ...</span>
                  ) : syncStatus === 'synced' ? (
                    <span className="text-[0.625rem] font-bold uppercase text-green-500">Nube OK</span>
                  ) : (
                    <span className="text-[0.625rem] font-bold uppercase text-gray-500">Local</span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user && user.photoURL && (
              <img src={user.photoURL} alt="" className="w-8 h-8 rounded-full border border-gray-100 dark:border-gray-700" referrerPolicy="no-referrer" />
            )}
            <button
              onClick={() => setActiveTab('legal')}
              aria-label="Información legal"
              className="p-2 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
            >
              <Info size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content — Swipe-enabled */}
      <main className="max-w-md mx-auto px-4 py-5 sm:px-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            <Suspense fallback={<p className="text-center text-sm text-gray-500 dark:text-gray-400 py-10">Cargando…</p>}>
              {activeTab === 'recipe' && <RecipeTab state={state} />}
              {activeTab === 'split' && <SplitTab state={state} />}
              {activeTab === 'quick' && <QuickTab state={state} patient={patient} />}
              {activeTab === 'family' && <FamilyTab state={state} />}
              {activeTab === 'cookware' && <CookwareTab state={state} />}
              {activeTab === 'ingredients' && <IngredientsTab state={state} />}
              {activeTab === 'history' && <HistoryTab state={state} />}
              {activeTab === 'stats' && <StatsTab state={state} />}
              {activeTab === 'dose' && <DoseTab state={state} patient={patient} glucoseSensor={glucoseSensor} />}
              {activeTab === 'patient' && <PatientSettingsTab state={state} patient={patient} glucoseSensor={glucoseSensor} />}
              {activeTab === 'settings' && <SettingsTab state={state} prefs={prefs} updatePrefs={updatePrefs} />}
              {activeTab === 'legal' && <LegalNotice />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
      <nav aria-label="Secciones principales" className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] flex justify-around items-stretch z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] transition-colors">
        <NavButton active={activeTab === 'recipe'} onClick={() => setActiveTab('recipe')} icon={<ChefHat size={20} />} label="Recetas" />
        <NavButton active={activeTab === 'split'} onClick={() => setActiveTab('split')} icon={<Scale size={20} />} label="Reparto" />
        <NavButton active={activeTab === 'quick'} onClick={() => setActiveTab('quick')} icon={<Cookie size={20} />} label="Rápida" />
        {patientMode && (
          <NavButton active={activeTab === 'dose'} onClick={() => setActiveTab('dose')} icon={<Syringe size={20} />} label="Dosis" />
        )}
        <NavButton active={activeTab === 'family'} onClick={() => setActiveTab('family')} icon={<Users size={20} />} label="Familia" />
      </nav>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            role="status"
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2"
          >
            <CheckCircle2 className="text-green-400 dark:text-green-600" size={18} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
