import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { checkCatalogues } from './i18n';
import './app/globals.css';

// Surfaces an incomplete translation catalogue during development rather than
// letting an English string appear inside an Arabic screen in production.
if (import.meta.env.DEV) {
  const missing = checkCatalogues();
  if (Object.keys(missing).length > 0) {
    console.warn('Missing translation keys', missing);
  }
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root was not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
