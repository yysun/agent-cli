/**
 * Agent CLI Web UI Entrypoint
 *
 * Purpose:
 * - Mount the relay-connected React application used for remote supervision.
 *
 * Key features:
 * - Boots React strict mode and applies the shared visual styles.
 *
 * Recent changes:
 * - 2026-05-11: Added initial Vite + React mount for relay web control.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import './styles.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Missing #root element.');
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
