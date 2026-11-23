import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { LandingPage } from './pages/LandingPage';
import { LegalPage } from './pages/LegalPages';
import { CompanyPortal } from './pages/CompanyPortal';
import { PublicVacancyPage } from './pages/PublicVacancyPage';
import './styles.css';

const RootRouter: React.FC = () => {
  const [pathname, setPathname] = useState<string>(() => window.location.pathname || '/');

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname || '/');
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = (to: string) => {
    if (to !== window.location.pathname) {
      window.history.pushState({}, '', to);
      setPathname(to);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const normalized = pathname.replace(/\/+$/, '') || '/';
  const hasPaystackRef =
    typeof window !== 'undefined' &&
    (new URLSearchParams(window.location.search).has('reference') ||
      new URLSearchParams(window.location.search).has('trxref'));

  if (normalized === '/app' || normalized.startsWith('/app/') || hasPaystackRef) {
    return <App />;
  }
  if (normalized.startsWith('/company') || normalized.startsWith('/agent')) {
    return <CompanyPortal pathname={normalized} onNavigate={navigate} />;
  }
  if (normalized.startsWith('/opportunity/')) {
    const vacancyId = normalized.replace('/opportunity/', '').split('/')[0] || '';
    return <PublicVacancyPage vacancyId={vacancyId} onNavigate={navigate} />;
  }
  if (normalized === '/privacy' || normalized === '/privacy-policy') {
    return <LegalPage mode="privacy" onNavigate={navigate} />;
  }
  if (normalized === '/terms' || normalized === '/terms-and-conditions') {
    return <LegalPage mode="terms" onNavigate={navigate} />;
  }
  return <LandingPage onNavigate={navigate} />;
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootRouter />
  </React.StrictMode>,
);
