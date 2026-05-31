/**
 * Electron Renderer App Root
 *
 * Purpose:
 * - Keep the renderer root thin and delegate workspace orchestration to the app layer.
 *
 * Key features:
 * - Exposes a stable default export for the Vite bootstrap.
 * - Keeps app assembly separate from feature and design-system layers.
 *
 * Recent changes:
 * - 2026-05-31: Added thin React app root for the layered Electron renderer.
 */
import RendererWorkspace from './app/RendererWorkspace';

export default function App() {
  return <RendererWorkspace />;
}