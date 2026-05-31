/**
 * Electron Renderer Bootstrap
 *
 * Purpose:
 * - Mount the React renderer application into the Vite root element.
 *
 * Key features:
 * - Uses React createRoot.
 * - Imports the layered renderer stylesheet entry.
 *
 * Recent changes:
 * - 2026-05-31: Added React bootstrap for the Electron renderer migration.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error('Renderer root element not found.');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);