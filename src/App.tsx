import React, { useCallback, useMemo } from 'react';
import {
  ChefHat,
  Scale,
  Users,
  Menu,
  Calculator,
  Info,
  CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { useAppState, MAIN_TABS, TabType } from './hooks/useAppState';
import { useSwipeNavigation } from './hooks/useSwipeNavigation';
import { RecipeTab } from './components/RecipeTab';
import { SplitTab } from './components/SplitTab';
import { FamilyTab } from './components/FamilyTab';
import { CookwareTab } from './components/CookwareTab';
import { HistoryTab } from './components/HistoryTab';
import { StatsTab } from './components/StatsTab';
import { LegalNotice } from './components/LegalNotice';
import { Sidebar } from './components/Sidebar';
import { NavButton } from './components/NavButton';
import { OnboardingTutorial } from './components/OnboardingTutorial';
import { CookieConsent } from './components/CookieConsent';

export default function App() {
  const state = useAppState();
  const { activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen, user, saveStatus, toast, showTutorial, dismissTutorial, hasConsent, isDarkMode } = state;

  const currentTabIndex = MAIN_TABS.indexOf(activeTab);

  const goToNextTab = useCallback(() => {
    if (currentTabIndex >= 0 && currentTabIndex < MAIN_TABS.length - 1) {
      setActiveTab(MAIN_TABS[currentTabIndex + 1]);
    }
  }, [currentTabIndex, setActiveTab]);

  const goToPrevTab = useCallback(() => {
    if (currentTabIndex > 0) {
      setActiveTab(MAIN_TABS[currentTabIndex - 1]);
    }
  }, [currentTabIndex, setActiveTab]);

  const { onTouchStart, onTouchEnd } = useSwipeNavigation({
    onSwipeLeft: goToNextTab,
    onSwipeRight: goToPrevTab,
  });

  // Track swipe direction for animation
  const swipeDirection = useMemo(() => {
    return currentTabIndex;
  }, [currentTabIndex]);

  return (
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans pb-24 transition-colors duration-300"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Cookie Consent */}
      {!hasConsent && <CookieConsent state={state} />}

      {/* Tutorial Overlay */}
      {showTutorial && <OnboardingTutorial onDismiss={dismissTutorial} />}

      {/* Sidebar */}
      <Sidebar state={state} />

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 px-6 py-4 shadow-sm dark:shadow-gray-900/50 sticky top-0 z-20 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white shadow-lg shadow-orange-200 dark:shadow-orange-900/30">
                <Calculator size={20} />
              </div>
              <div>
                <h1 className="text-base font-black tracking-tight leading-none">CarbCalc</h1>
                <div className="flex items-center gap-1.5">
                  {saveStatus !== 'idle' && (
                    <span className={`text-[8px] font-bold uppercase px-1 rounded ${saveStatus === 'saving' ? 'text-blue-400' : 'text-green-400'}`}>
                      {saveStatus === 'saving' ? '...' : 'OK'}
                    </span>
                  )}
                  {user ? (
                    <span className="text-[8px] font-bold uppercase text-blue-400">Nube</span>
                  ) : (
                    <span className="text-[8px] font-bold uppercase text-gray-400">Local</span>
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
              className="p-2 text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full"
            >
              <Info size={20} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content — Swipe-enabled */}
      <main
        className="max-w-md mx-auto p-6"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'recipe' && <RecipeTab state={state} />}
            {activeTab === 'split' && <SplitTab state={state} />}
            {activeTab === 'family' && <FamilyTab state={state} />}
            {activeTab === 'cookware' && <CookwareTab state={state} />}
            {activeTab === 'history' && <HistoryTab state={state} />}
            {activeTab === 'stats' && <StatsTab state={state} />}
            {activeTab === 'legal' && <LegalNotice />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 px-2 py-3 flex justify-around items-center z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.3)] transition-colors">
        <NavButton active={activeTab === 'recipe'} onClick={() => setActiveTab('recipe')} icon={<ChefHat size={20} />} label="Recetas" />
        <NavButton active={activeTab === 'split'} onClick={() => setActiveTab('split')} icon={<Scale size={20} />} label="Reparto" />
        <NavButton active={activeTab === 'family'} onClick={() => setActiveTab('family')} icon={<Users size={20} />} label="Familia" />
      </nav>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 px-6 py-3 rounded-full shadow-xl text-sm font-bold flex items-center gap-2"
          >
            <CheckCircle2 className="text-green-400 dark:text-green-600" size={18} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
