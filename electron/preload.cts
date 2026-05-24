/**
 * Agent CLI Electron Preload Bridge
 *
 * Purpose:
 * - Expose a tiny, explicit desktop API to the isolated renderer.
 *
 * Key features:
 * - Provides read-only app metadata through an IPC-backed bridge.
 * - Avoids exposing Node.js or Electron primitives directly to web code.
 *
 * Recent changes:
 * - 2026-05-24: Switched preload output to CommonJS for stable Electron loading.
 * - 2026-05-24: Added the initial metadata-only preload bridge.
 */
import { contextBridge, ipcRenderer } from 'electron';

const DESKTOP_INFO_CHANNEL = 'desktop:getAppInfo';

export type AgentCliDesktopAppInfo = {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  rendererMode: 'electron';
};

export type AgentCliDesktopApi = {
  getAppInfo: () => Promise<AgentCliDesktopAppInfo>;
};

const desktopApi: AgentCliDesktopApi = {
  getAppInfo: async () => ipcRenderer.invoke(DESKTOP_INFO_CHANNEL) as Promise<AgentCliDesktopAppInfo>,
};

contextBridge.exposeInMainWorld('agentCliDesktop', desktopApi);
