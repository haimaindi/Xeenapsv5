
import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore - Resolving TS error for missing exported members in some environments
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { LibraryItem } from './types';
import { fetchLibrary } from './services/gasService';
import LibraryMain from './components/Library/LibraryMain';
import LibraryForm from './components/Library/LibraryForm';
import Sidebar from './components/Layout/Sidebar';
import Header from './components/Layout/Header';
import SettingsView from './components/Settings/SettingsView';
import { BRAND_ASSETS } from './assets';
import { GlobalAppLoader } from './components/Common/LoadingComponents';

const App: React.FC = () => {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Fix: Wrap loadData with useCallback to prevent child components (LibraryMain) 
  // from re-triggering effects/skeletons when App re-renders (e.g. during sidebar toggle).
  const loadData = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchLibrary();
    setItems(data);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Enhanced Fix: iOS Stability Handler
  // Uses focus, blur, visibilitychange, and pageshow for maximum reliability on iOS/WebKit.
  // This ensures the sidebar is forced to a closed state whenever the app loses focus (navigation start)
  // or gains it back (navigation return), preventing "stuck" UI layers.
  useEffect(() => {
    const forceCloseSidebar = () => {
      setIsMobileSidebarOpen(false);
    };

    const handleReentry = () => {
      if (document.visibilityState === 'visible') {
        forceCloseSidebar();
      }
    };

    window.addEventListener('visibilitychange', handleReentry);
    window.addEventListener('pageshow', handleReentry);
    window.addEventListener('focus', handleReentry);
    window.addEventListener('blur', forceCloseSidebar); // Force state reset on exit
    
    return () => {
      window.removeEventListener('visibilitychange', handleReentry);
      window.removeEventListener('pageshow', handleReentry);
      window.removeEventListener('focus', handleReentry);
      window.removeEventListener('blur', forceCloseSidebar);
    };
  }, []);

  return (
    <Router>
      <div className={`flex h-[100dvh] bg-white text-[#004A74] overflow-hidden ${isLoading ? 'pointer-events-none select-none' : ''}`}>
        {isMobileSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-[70] lg:hidden transition-opacity duration-500"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
        )}

        <Sidebar 
          isMobileOpen={isMobileSidebarOpen} 
          onMobileClose={() => setIsMobileSidebarOpen(false)} 
        />

        <main className="flex-1 flex flex-col px-4 md:px-8 lg:px-12 relative min-w-0">
          <Header 
            searchQuery={searchQuery} 
            setSearchQuery={setSearchQuery} 
            onRefresh={loadData}
          />

          <div className="mt-4 lg:mt-6 flex-1 pb-10 overflow-hidden">
            {isLoading ? (
              <GlobalAppLoader />
            ) : (
              <Routes>
                <Route path="/" element={<LibraryMain items={items} isLoading={isLoading} onRefresh={loadData} globalSearch={searchQuery} />} />
                <Route path="/favorite" element={<LibraryMain items={items} isLoading={isLoading} onRefresh={loadData} globalSearch={searchQuery} />} />
                <Route path="/bookmark" element={<LibraryMain items={items} isLoading={isLoading} onRefresh={loadData} globalSearch={searchQuery} />} />
                <Route path="/research" element={<LibraryMain items={items} isLoading={isLoading} onRefresh={loadData} globalSearch={searchQuery} />} />
                
                <Route path="/add" element={<LibraryForm onComplete={loadData} items={items} />} />
                <Route path="/settings" element={<SettingsView />} />
                
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            )}
          </div>
        </main>

        <button 
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className={`fixed bottom-6 right-6 lg:hidden z-[90] w-16 h-16 bg-transparent flex items-center justify-center p-1 transition-all duration-300 rounded-full outline-none focus:outline-none hover:scale-110 active:scale-95 ${!isMobileSidebarOpen ? 'animate-xeenaps-bounce' : ''} ${isLoading ? 'opacity-50 grayscale' : ''}`}
        >
          <img 
            src={BRAND_ASSETS.LOGO_ICON} 
            className={`w-full h-full object-contain transition-all duration-700 ease-in-out ${isMobileSidebarOpen ? 'rotate-[360deg] scale-100 brightness-110' : 'rotate-0 opacity-100'}`}
            alt="Toggle Sidebar"
          />
        </button>
      </div>
    </Router>
  );
};

export default App;
