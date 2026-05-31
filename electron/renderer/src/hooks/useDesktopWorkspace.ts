/**
 * Desktop Workspace Hook
 *
 * Purpose:
 * - Own React state and Electron bridge calls for the desktop workspace UI.
 *
 * Key features:
 * - Hydrates app metadata, workspace, chat list, and selected chat messages.
 * - Provides actions for workspace selection, chat creation/selection, send, and edit/resend.
 * - Keeps local-only UI settings together with the IPC-backed workspace state.
 *
 * Recent changes:
 * - 2026-05-31: Ported the static renderer behavior into a typed React hook.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { THEME_STORAGE_KEY } from '../constants/storage';
import type {
  AgentCliDesktopApi,
  AgentCliDesktopChatSummary,
  AgentCliDesktopRuntimeMessage,
} from '../types/desktop-api';
import type { RendererAppInfo, RendererLogEntry, ThemePreference } from '../types/ui';

function normalizeThemePreference(preference: unknown): ThemePreference {
  return preference === 'light' || preference === 'dark' || preference === 'system' ? preference : 'system';
}

function getStoredThemePreference(): ThemePreference {
  try {
    return normalizeThemePreference(window.localStorage?.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useDesktopWorkspace() {
  const desktopApi: AgentCliDesktopApi | undefined = window.agentCliDesktop;
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [chats, setChats] = useState<AgentCliDesktopChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState('');
  const [messages, setMessages] = useState<AgentCliDesktopRuntimeMessage[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [busyLabel, setBusyLabel] = useState('');
  const [status, setStatus] = useState('Loading');
  const [appInfo, setAppInfo] = useState<RendererAppInfo>({
    name: 'Agent World',
    version: '0.1.0',
    platform: 'unknown',
    rendererMode: 'electron',
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => getStoredThemePreference());
  const [showToolMessages, setShowToolMessages] = useState(true);
  const [globalSkillsEnabled, setGlobalSkillsEnabled] = useState(true);
  const [projectSkillsEnabled, setProjectSkillsEnabled] = useState(true);
  const [toolPermission, setToolPermission] = useState('auto');
  const [reasoningEffort, setReasoningEffort] = useState('');
  const [logs, setLogs] = useState<RendererLogEntry[]>([
    { id: 1, level: 'info', message: 'Renderer loaded.' },
  ]);

  const busy = Boolean(busyLabel);
  const bridgeAvailable = Boolean(desktopApi);

  const log = useCallback((level: RendererLogEntry['level'], message: string) => {
    setLogs((currentLogs) => [
      { id: Date.now() + Math.random(), level, message },
      ...currentLogs,
    ].slice(0, 8));
  }, []);

  const withBusy = useCallback(async <T,>(label: string, task: () => Promise<T>): Promise<T> => {
    setBusyLabel(label);
    try {
      return await task();
    } finally {
      setBusyLabel('');
    }
  }, []);

  const clearEdit = useCallback(() => {
    setEditingIndex(null);
  }, []);

  const refreshChats = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const response = await desktopApi.listChats();
    setWorkspaceRoot(response.workspaceRoot || '');
    setChats(response.chats || []);
    if (response.currentChatId) {
      setCurrentChatId(response.currentChatId);
    }
  }, [desktopApi]);

  const loadMessages = useCallback(async (chatId: string) => {
    if (!desktopApi) {
      return;
    }

    const response = await desktopApi.getChatMessages({ chatId });
    setWorkspaceRoot(response.workspaceRoot || '');
    setCurrentChatId(response.chat?.id || chatId || '');
    setMessages(response.messages || []);
    clearEdit();
  }, [clearEdit, desktopApi]);

  const loadWorkspace = useCallback(async () => {
    if (!desktopApi) {
      setStatus('Bridge unavailable');
      log('error', 'Electron bridge unavailable.');
      return;
    }

    const info = await desktopApi.getAppInfo();
    setAppInfo({
      name: info.name || 'Agent World',
      version: info.version || '0.1.0',
      platform: info.platform || 'unknown',
      rendererMode: info.rendererMode || 'electron',
    });

    const response = await desktopApi.getWorkspace();
    setWorkspaceRoot(response.workspaceRoot || '');
    setChats(response.chats || []);
    setCurrentChatId(response.currentChatId || '');
    setStatus('Ready');
    if (response.currentChatId) {
      await loadMessages(response.currentChatId);
    }
    log('info', 'Workspace loaded.');
  }, [desktopApi, loadMessages, log]);

  const selectWorkspace = useCallback(async () => {
    if (!desktopApi) {
      log('error', 'Electron bridge unavailable.');
      return;
    }

    await withBusy('Selecting workspace', async () => {
      const response = await desktopApi.selectWorkspace();
      setWorkspaceRoot(response.workspaceRoot || workspaceRoot);
      setChats(response.chats || []);
      setCurrentChatId(response.currentChatId || '');
      setMessages([]);
      if (response.currentChatId) {
        await loadMessages(response.currentChatId);
      }
      log('info', response.canceled ? 'Workspace selection canceled.' : `Workspace selected: ${response.workspaceRoot}`);
    });
  }, [desktopApi, loadMessages, log, withBusy, workspaceRoot]);

  const createChat = useCallback(async () => {
    if (!desktopApi) {
      log('error', 'Electron bridge unavailable.');
      return;
    }

    await withBusy('Creating chat', async () => {
      const response = await desktopApi.createChat({ workspaceRoot });
      setWorkspaceRoot(response.workspaceRoot || workspaceRoot);
      setChats(response.chats || []);
      setCurrentChatId(response.chat?.id || '');
      setMessages(response.chat?.messages || []);
      clearEdit();
      log('info', `Created chat ${response.chat?.id || ''}.`);
    });
  }, [clearEdit, desktopApi, log, withBusy, workspaceRoot]);

  const selectChat = useCallback(async (chatId: string) => {
    if (!desktopApi || !chatId) {
      return;
    }

    await withBusy('Loading chat', async () => {
      const response = await desktopApi.selectChat({ chatId });
      setWorkspaceRoot(response.workspaceRoot || workspaceRoot);
      setChats(response.chats || []);
      setCurrentChatId(response.chat?.id || chatId);
      setMessages(response.chat?.messages || []);
      clearEdit();
    });
  }, [clearEdit, desktopApi, withBusy, workspaceRoot]);

  const startEdit = useCallback((index: number) => {
    setEditingIndex(index);
  }, []);

  const submitMessage = useCallback(async (content: string) => {
    if (!desktopApi || busy) {
      return;
    }

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      return;
    }

    await withBusy(editingIndex === null ? 'Sending message' : 'Resending edited message', async () => {
      const agentConfig: Record<string, unknown> = {};
      if (toolPermission) {
        agentConfig.toolPermission = toolPermission;
      }
      if (reasoningEffort) {
        agentConfig.reasoningEffort = reasoningEffort;
      }

      const request = {
        chatId: currentChatId || undefined,
        content: trimmedContent,
        agentConfig,
        stream: false,
      };
      const wasEditing = editingIndex !== null;
      const response = wasEditing
        ? await desktopApi.editAndResendMessage({
          ...request,
          chatId: currentChatId,
          messageIndex: editingIndex,
        })
        : await desktopApi.sendChatMessage(request);

      setCurrentChatId(response.chatId || currentChatId);
      setMessages(response.messages || []);
      clearEdit();
      await refreshChats();
      log('info', wasEditing ? 'Edited message resent.' : 'Message sent.');
    });
  }, [busy, clearEdit, currentChatId, desktopApi, editingIndex, log, reasoningEffort, refreshChats, toolPermission, withBusy]);

  const setThemePreference = useCallback((preference: ThemePreference) => {
    setThemePreferenceState(normalizeThemePreference(preference));
  }, []);

  useEffect(() => {
    if (themePreference === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', themePreference);
    }

    try {
      window.localStorage?.setItem(THEME_STORAGE_KEY, themePreference);
    } catch {
      // Ignore storage failures in restricted renderer contexts.
    }
  }, [themePreference]);

  useEffect(() => {
    void loadWorkspace().catch((error) => {
      setStatus('Load failed');
      log('error', safeErrorMessage(error));
    });
  }, [loadWorkspace, log]);

  return useMemo(() => ({
    appInfo,
    bridgeAvailable,
    busy,
    busyLabel,
    chats,
    currentChatId,
    editingIndex,
    globalSkillsEnabled,
    logs,
    messages,
    panelOpen,
    projectSkillsEnabled,
    reasoningEffort,
    showToolMessages,
    sidebarCollapsed,
    status,
    themePreference,
    toolPermission,
    workspaceRoot,
    actions: {
      clearEdit,
      createChat,
      selectChat,
      selectWorkspace,
      setGlobalSkillsEnabled,
      setPanelOpen,
      setProjectSkillsEnabled,
      setReasoningEffort,
      setShowToolMessages,
      setSidebarCollapsed,
      setThemePreference,
      setToolPermission,
      startEdit,
      submitMessage,
    },
  }), [
    appInfo,
    bridgeAvailable,
    busy,
    busyLabel,
    chats,
    clearEdit,
    createChat,
    currentChatId,
    editingIndex,
    globalSkillsEnabled,
    logs,
    messages,
    panelOpen,
    projectSkillsEnabled,
    reasoningEffort,
    selectChat,
    selectWorkspace,
    showToolMessages,
    sidebarCollapsed,
    setThemePreference,
    startEdit,
    status,
    submitMessage,
    themePreference,
    toolPermission,
    workspaceRoot,
  ]);
}