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
 * - 2026-06-04: Appended live Electron turn events and defaulted verbose diagnostics off.
 * - 2026-06-03: Added transient human-input prompt state for Electron runtime turns.
 * - 2026-06-03: Clear stale pending human-input prompts after completed send/edit responses.
 * - 2026-05-31: Hydrated active runtime provider/model metadata from Electron IPC.
 * - 2026-05-31: Hydrated optional workspace world summary metadata from Electron IPC.
 * - 2026-05-31: Ported the static renderer behavior into a typed React hook.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { THEME_STORAGE_KEY } from '../constants/storage';
import type {
  AgentCliDesktopApi,
  AgentCliDesktopChatSummary,
  AgentCliDesktopHumanInputAnswer,
  AgentCliDesktopHumanInputRequest,
  AgentCliDesktopRuntimeSummary,
  AgentCliDesktopRuntimeMessage,
  AgentCliDesktopSkillInventory,
  AgentCliDesktopSkillSelection,
  AgentCliDesktopSkillSummary,
  AgentCliDesktopTurnEvent,
  AgentCliDesktopWorkspaceResponse,
  AgentCliDesktopWorldSummary,
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

function emptySkillInventory(): AgentCliDesktopSkillInventory {
  return {
    user: [],
    project: [],
  };
}

function buildSkillSelectionKey(skill: AgentCliDesktopSkillSummary): string {
  return `${skill.sourceScope || 'skill'}:${skill.skillId}:${skill.sourcePath || ''}`;
}

function collectSkillSelectionKeys(skillInventory: AgentCliDesktopSkillInventory): Set<string> {
  return new Set([
    ...skillInventory.user.map(buildSkillSelectionKey),
    ...skillInventory.project.map(buildSkillSelectionKey),
  ]);
}

export function useDesktopWorkspace() {
  const desktopApi: AgentCliDesktopApi | undefined = window.agentCliDesktop;
  const [workspaceRoot, setWorkspaceRoot] = useState('');
  const [runtimeSummary, setRuntimeSummary] = useState<AgentCliDesktopRuntimeSummary>({
    provider: '',
    model: '',
  });
  const [worldSummary, setWorldSummary] = useState<AgentCliDesktopWorldSummary | null>(null);
  const [worldSummaryWarning, setWorldSummaryWarning] = useState('');
  const [skillInventory, setSkillInventory] = useState<AgentCliDesktopSkillInventory>(() => emptySkillInventory());
  const [disabledSkillKeys, setDisabledSkillKeys] = useState<string[]>([]);
  const [chats, setChats] = useState<AgentCliDesktopChatSummary[]>([]);
  const [currentChatId, setCurrentChatId] = useState('');
  const [messages, setMessages] = useState<AgentCliDesktopRuntimeMessage[]>([]);
  const [turnEvents, setTurnEvents] = useState<AgentCliDesktopTurnEvent[]>([]);
  const [pendingHumanInputRequest, setPendingHumanInputRequest] = useState<AgentCliDesktopHumanInputRequest | null>(null);
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
  const [showToolMessages, setShowToolMessages] = useState(false);
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

  const applyWorkspaceMetadata = useCallback((response: Pick<AgentCliDesktopWorkspaceResponse, 'runtimeSummary' | 'skillInventory' | 'globalSkillsEnabled' | 'projectSkillsEnabled' | 'worldSummary' | 'worldSummaryWarning'>, options: { resetSkillSelection?: boolean } = {}) => {
    const nextSkillInventory = {
      user: response.skillInventory?.user || [],
      project: response.skillInventory?.project || [],
    };
    const nextSkillKeys = collectSkillSelectionKeys(nextSkillInventory);

    setRuntimeSummary({
      provider: response.runtimeSummary?.provider || '',
      model: response.runtimeSummary?.model || '',
    });
    setSkillInventory(nextSkillInventory);
    setDisabledSkillKeys((currentKeys) => (
      options.resetSkillSelection ? [] : currentKeys.filter((key) => nextSkillKeys.has(key))
    ));
    setGlobalSkillsEnabled((currentEnabled) => (
      options.resetSkillSelection ? response.globalSkillsEnabled === true : response.globalSkillsEnabled === true && currentEnabled
    ));
    setProjectSkillsEnabled((currentEnabled) => (
      options.resetSkillSelection ? response.projectSkillsEnabled !== false : response.projectSkillsEnabled !== false && currentEnabled
    ));
    setWorldSummary(response.worldSummary ?? null);
    setWorldSummaryWarning(response.worldSummaryWarning || '');
  }, []);

  const createSkillSelection = useCallback((): AgentCliDesktopSkillSelection => ({
    globalEnabled: globalSkillsEnabled,
    projectEnabled: projectSkillsEnabled,
    disabledSkillKeys,
  }), [disabledSkillKeys, globalSkillsEnabled, projectSkillsEnabled]);

  const setSkillEnabled = useCallback((skill: AgentCliDesktopSkillSummary, enabled: boolean) => {
    const skillKey = buildSkillSelectionKey(skill);
    setDisabledSkillKeys((currentKeys) => {
      const nextKeys = new Set(currentKeys);
      if (enabled) {
        nextKeys.delete(skillKey);
      } else {
        nextKeys.add(skillKey);
      }

      return [...nextKeys];
    });
  }, []);

  const refreshChats = useCallback(async () => {
    if (!desktopApi) {
      return;
    }

    const response = await desktopApi.listChats();
    setWorkspaceRoot(response.workspaceRoot || '');
    setChats(response.chats || []);
    applyWorkspaceMetadata(response);
    if (response.currentChatId) {
      setCurrentChatId(response.currentChatId);
    }
  }, [applyWorkspaceMetadata, desktopApi]);

  const loadMessages = useCallback(async (chatId: string) => {
    if (!desktopApi) {
      return;
    }

    const response = await desktopApi.getChatMessages({ chatId });
    setWorkspaceRoot(response.workspaceRoot || '');
    setCurrentChatId(response.chat?.id || chatId || '');
    setMessages(response.messages || []);
    setTurnEvents([]);
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
    applyWorkspaceMetadata(response, { resetSkillSelection: true });
    setCurrentChatId(response.currentChatId || '');
    setStatus('Ready');
    if (response.currentChatId) {
      await loadMessages(response.currentChatId);
    }
    log('info', 'Workspace loaded.');
  }, [applyWorkspaceMetadata, desktopApi, loadMessages, log]);

  const selectWorkspace = useCallback(async () => {
    if (!desktopApi) {
      log('error', 'Electron bridge unavailable.');
      return;
    }

    await withBusy('Selecting workspace', async () => {
      const response = await desktopApi.selectWorkspace();
      setWorkspaceRoot(response.workspaceRoot || workspaceRoot);
      setChats(response.chats || []);
      applyWorkspaceMetadata(response, { resetSkillSelection: true });
      setCurrentChatId(response.currentChatId || '');
      setMessages([]);
      setTurnEvents([]);
      setPendingHumanInputRequest(null);
      if (response.currentChatId) {
        await loadMessages(response.currentChatId);
      }
      log('info', response.canceled ? 'Workspace selection canceled.' : `Workspace selected: ${response.workspaceRoot}`);
    });
  }, [applyWorkspaceMetadata, desktopApi, loadMessages, log, withBusy, workspaceRoot]);

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
      setTurnEvents([]);
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
      setTurnEvents([]);
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
      setTurnEvents([]);
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
        skillSelection: createSkillSelection(),
        stream: true,
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
      setTurnEvents(response.turnEvents || []);
      setPendingHumanInputRequest(null);
      clearEdit();
      await refreshChats();
      log('info', wasEditing ? 'Edited message resent.' : 'Message sent.');
    });
  }, [busy, clearEdit, createSkillSelection, currentChatId, desktopApi, editingIndex, log, reasoningEffort, refreshChats, toolPermission, withBusy]);

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

  const submitHumanInputAnswer = useCallback(async (answer: AgentCliDesktopHumanInputAnswer) => {
    if (!desktopApi) {
      return;
    }

    const response = await desktopApi.submitHumanInputAnswer(answer);
    if (!response.ok) {
      log('error', 'Human input response was not accepted.');
      return;
    }

    setPendingHumanInputRequest(null);
    log('info', answer.status === 'cancelled' ? 'Human input cancelled.' : 'Human input submitted.');
  }, [desktopApi, log]);

  useEffect(() => {
    void loadWorkspace().catch((error) => {
      setStatus('Load failed');
      log('error', safeErrorMessage(error));
    });
  }, [loadWorkspace, log]);

  useEffect(() => {
    if (!desktopApi) {
      return undefined;
    }

    return desktopApi.onTurnEvent((event) => {
      setTurnEvents((currentEvents) => [...currentEvents, event]);
    });
  }, [desktopApi]);

  useEffect(() => {
    if (!desktopApi) {
      return undefined;
    }

    return desktopApi.onHumanInputRequest((request) => {
      setPendingHumanInputRequest(request);
      setBusyLabel('Waiting for input');
      log('info', `Input requested: ${request.questions[0]?.question || request.toolName}`);
    });
  }, [desktopApi, log]);

  return useMemo(() => ({
    appInfo,
    bridgeAvailable,
    busy,
    busyLabel,
    chats,
    currentChatId,
    disabledSkillKeys,
    editingIndex,
    globalSkillsEnabled,
    logs,
    messages,
    panelOpen,
    pendingHumanInputRequest,
    projectSkillsEnabled,
    reasoningEffort,
    runtimeSummary,
    showToolMessages,
    sidebarCollapsed,
    skillInventory,
    status,
    themePreference,
    toolPermission,
    turnEvents,
    worldSummary,
    worldSummaryWarning,
    workspaceRoot,
    actions: {
      clearEdit,
      createChat,
      selectChat,
      selectWorkspace,
      setGlobalSkillsEnabled,
      setSkillEnabled,
      setPanelOpen,
      setProjectSkillsEnabled,
      setReasoningEffort,
      setShowToolMessages,
      setSidebarCollapsed,
      setThemePreference,
      setToolPermission,
      startEdit,
      submitHumanInputAnswer,
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
    disabledSkillKeys,
    editingIndex,
    globalSkillsEnabled,
    logs,
    messages,
    panelOpen,
    pendingHumanInputRequest,
    projectSkillsEnabled,
    reasoningEffort,
    runtimeSummary,
    selectChat,
    selectWorkspace,
    setSkillEnabled,
    showToolMessages,
    sidebarCollapsed,
    skillInventory,
    setThemePreference,
    startEdit,
    status,
    submitHumanInputAnswer,
    submitMessage,
    themePreference,
    toolPermission,
    turnEvents,
    worldSummary,
    worldSummaryWarning,
    workspaceRoot,
  ]);
}
