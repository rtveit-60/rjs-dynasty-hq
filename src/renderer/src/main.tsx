import '@fontsource-variable/inter';
import '@fontsource/archivo-black';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './theme.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
