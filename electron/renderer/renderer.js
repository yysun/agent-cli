/*
Agent CLI Electron Renderer Script

Purpose:
- Hydrate the Electron-owned renderer with preload bridge metadata.

Key features:
- Reads only from window.agentCliDesktop.
- Keeps missing-bridge failures visible in the shell instead of throwing.

Recent changes:
- 2026-05-24: Added initial renderer metadata hydration.
*/
(async () => {
  const status = document.getElementById('runtime-status');
  const appName = document.getElementById('app-name');
  const appVersion = document.getElementById('app-version');
  const appPlatform = document.getElementById('app-platform');
  const rendererMode = document.getElementById('renderer-mode');

  function setText(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  if (!window.agentCliDesktop?.getAppInfo) {
    setText(status, 'Bridge unavailable');
    return;
  }

  try {
    const info = await window.agentCliDesktop.getAppInfo();
    setText(appName, info.name || 'Agent World');
    setText(appVersion, info.version || '0.1.0');
    setText(appPlatform, info.platform || 'unknown');
    setText(rendererMode, info.rendererMode || 'electron');
    setText(status, 'Ready');
  } catch (error) {
    setText(status, 'Metadata failed');
    console.error('Failed to read desktop metadata:', error);
  }
})();
