/**
 * Agent World Electron Main Process
 *
 * Purpose:
 * - Provide a minimal desktop shell with an Electron-owned renderer.
 *
 * Key features:
 * - Loads electron/renderer/index.html directly in development and packaged modes.
 * - Keeps renderer isolation enabled and exposes only a tiny preload metadata bridge.
 * - Sends external links to the operating system browser.
 *
 * Recent changes:
 * - 2026-05-24: Renamed the Electron-facing app identity to Agent World.
 * - 2026-05-24: Switched from the shared web app to an Electron-owned renderer.
 * - 2026-05-24: Allowed same-origin dev-server navigation while keeping external links out of the shell.
 * - 2026-05-24: Added the initial minimal Electron shell entry point.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DESKTOP_INFO_CHANNEL = 'desktop:getAppInfo';

function getProjectRoot(): string {
  return path.resolve(__dirname, '..', '..');
}

function getPreloadPath(): string {
  return path.join(__dirname, 'preload.cjs');
}

function getRendererIndexPath(): string {
  return path.join(getProjectRoot(), 'electron', 'renderer', 'index.html');
}

function shouldOpenExternally(rawUrl: string): boolean {
  try {
    const parsedUrl = new URL(rawUrl);
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'mailto:';
  } catch {
    return false;
  }
}

function hasSameOrigin(leftUrl: string, rightUrl: string): boolean {
  try {
    return new URL(leftUrl).origin === new URL(rightUrl).origin;
  } catch {
    return false;
  }
}

let rendererMode: 'electron' = 'electron';

function registerIpcHandlers(): void {
  ipcMain.handle(DESKTOP_INFO_CHANNEL, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    rendererMode,
  }));
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  rendererMode = 'electron';
  await window.loadFile(getRendererIndexPath());
}

async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Agent World',
    show: false,
    webPreferences: {
      preload: getPreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (shouldOpenExternally(url)) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!shouldOpenExternally(url)) {
      return;
    }

    const currentUrl = mainWindow.webContents.getURL();
    if (!hasSameOrigin(currentUrl, url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  await loadRenderer(mainWindow);
  return mainWindow;
}

registerIpcHandlers();
app.setName('Agent World');
app.setAppUserModelId('com.agentworld.desktop');

app.whenReady().then(async () => {
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
}).catch((error) => {
  console.error('Failed to start Agent World desktop shell:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
