import '@fontsource-variable/inter';
import '@fontsource/archivo-black';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './theme.css';

// Failures outside React's render tree (event handlers, async work) still
// reach the main-process log with a reportable code.
window.addEventListener('error', (e) => {
  void window.hq
    .reportError({
      message: String(e.message ?? 'unknown error'),
      stack: e.error instanceof Error ? e.error.stack : undefined,
      area: 'window'
    })
    .catch(() => {});
});
window.addEventListener('unhandledrejection', (e) => {
  const reason: unknown = e.reason;
  void window.hq
    .reportError({
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
      area: 'promise'
    })
    .catch(() => {});
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
