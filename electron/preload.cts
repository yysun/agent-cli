/**
 * Agent World Electron Preload Bridge
 *
 * Purpose:
 * - Expose a tiny, explicit desktop API to the isolated renderer.
 *
 * Key features:
 * - Provides read-only app metadata through an IPC-backed bridge.
 * - Provides a narrow Agent CLI runtime turn bridge without exposing Node or Electron primitives.
 * - Exposes workspace/chat/message IPC calls for the Electron renderer.
 * - Avoids exposing Node.js or Electron primitives directly to web code.
 *
 * Recent changes:
 * - 2026-05-26: Added workspace, chat selection, send, and edit/resend bridge methods.
 * - 2026-05-26: Added `runAgentTurn` IPC bridge for main-process Agent CLI runtime execution.
 * - 2026-05-24: Switched preload output to CommonJS for stable Electron loading.
 * - 2026-05-24: Added the initial metadata-only preload bridge.
 */
import { contextBridge, ipcRenderer } from 'electron';

const DESKTOP_INFO_CHANNEL = 'desktop:getAppInfo';
const AGENT_RUN_TURN_CHANNEL = 'agent:runTurn';
const WORKSPACE_GET_CHANNEL = 'workspace:get';
const WORKSPACE_SELECT_CHANNEL = 'workspace:select';
const CHAT_LIST_CHANNEL = 'chat:list';
const CHAT_CREATE_CHANNEL = 'chat:create';
const CHAT_SELECT_CHANNEL = 'chat:select';
const CHAT_GET_MESSAGES_CHANNEL = 'chat:getMessages';
const CHAT_SEND_MESSAGE_CHANNEL = 'chat:sendMessage';
const CHAT_EDIT_AND_RESEND_CHANNEL = 'chat:editAndResend';

export type AgentCliDesktopAppInfo = {
  name: string;
  version: string;
  platform: NodeJS.Platform;
  rendererMode: 'electron';
};

export type AgentCliDesktopRuntimeMessage = {
  role?: string;
  content?: string;
  createdAt?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

export type AgentCliDesktopRunTurnRequest = {
  chatId?: string;
  message?: string;
  userMessage?: string;
  messages?: AgentCliDesktopRuntimeMessage[];
  workspaceRoot?: string;
  agentConfig?: Record<string, unknown>;
  stream?: boolean;
  historyMessageLimit?: number;
};

export type AgentCliDesktopRunTurnResponse = {
  chatId: string;
  workspaceRoot: string;
  assistantText: string;
  messages: AgentCliDesktopRuntimeMessage[];
  streamChunks: Array<Record<string, unknown>>;
  toolCalls: Array<Record<string, unknown>>;
  toolResults: Array<Record<string, unknown>>;
};

export type AgentCliDesktopChatSummary = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  isCurrent?: boolean;
};

export type AgentCliDesktopChat = {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  messages: AgentCliDesktopRuntimeMessage[];
};

export type AgentCliDesktopWorkspaceResponse = {
  canceled?: boolean;
  workspaceRoot: string;
  chats: AgentCliDesktopChatSummary[];
  currentChatId: string | null;
};

export type AgentCliDesktopApi = {
  getAppInfo: () => Promise<AgentCliDesktopAppInfo>;
  runAgentTurn: (request: AgentCliDesktopRunTurnRequest) => Promise<AgentCliDesktopRunTurnResponse>;
  getWorkspace: () => Promise<AgentCliDesktopWorkspaceResponse>;
  selectWorkspace: (request?: { workspaceRoot?: string }) => Promise<AgentCliDesktopWorkspaceResponse>;
  listChats: (request?: { workspaceRoot?: string }) => Promise<AgentCliDesktopWorkspaceResponse>;
  createChat: (request?: { workspaceRoot?: string }) => Promise<{
    workspaceRoot: string;
    chat: AgentCliDesktopChat;
    chats: AgentCliDesktopChatSummary[];
  }>;
  selectChat: (request: { chatId: string }) => Promise<{
    workspaceRoot: string;
    chat: AgentCliDesktopChat;
    chats: AgentCliDesktopChatSummary[];
  }>;
  getChatMessages: (request?: { chatId?: string }) => Promise<{
    workspaceRoot: string;
    chat: AgentCliDesktopChat;
    messages: AgentCliDesktopRuntimeMessage[];
  }>;
  sendChatMessage: (request: AgentCliDesktopRunTurnRequest & {
    content?: string;
  }) => Promise<AgentCliDesktopRunTurnResponse>;
  editAndResendMessage: (request: {
    chatId: string;
    messageIndex?: number;
    messageId?: string;
    content?: string;
    message?: string;
    agentConfig?: Record<string, unknown>;
    stream?: boolean;
    historyMessageLimit?: number;
  }) => Promise<AgentCliDesktopRunTurnResponse>;
};

const desktopApi: AgentCliDesktopApi = {
  getAppInfo: async () => ipcRenderer.invoke(DESKTOP_INFO_CHANNEL) as Promise<AgentCliDesktopAppInfo>,
  runAgentTurn: async (request) => ipcRenderer.invoke(
    AGENT_RUN_TURN_CHANNEL,
    request,
  ) as Promise<AgentCliDesktopRunTurnResponse>,
  getWorkspace: async () => ipcRenderer.invoke(WORKSPACE_GET_CHANNEL) as Promise<AgentCliDesktopWorkspaceResponse>,
  selectWorkspace: async (request = {}) => ipcRenderer.invoke(
    WORKSPACE_SELECT_CHANNEL,
    request,
  ) as Promise<AgentCliDesktopWorkspaceResponse>,
  listChats: async (request = {}) => ipcRenderer.invoke(
    CHAT_LIST_CHANNEL,
    request,
  ) as Promise<AgentCliDesktopWorkspaceResponse>,
  createChat: async (request = {}) => ipcRenderer.invoke(CHAT_CREATE_CHANNEL, request) as ReturnType<AgentCliDesktopApi['createChat']>,
  selectChat: async (request) => ipcRenderer.invoke(CHAT_SELECT_CHANNEL, request) as ReturnType<AgentCliDesktopApi['selectChat']>,
  getChatMessages: async (request = {}) => ipcRenderer.invoke(
    CHAT_GET_MESSAGES_CHANNEL,
    request,
  ) as ReturnType<AgentCliDesktopApi['getChatMessages']>,
  sendChatMessage: async (request) => ipcRenderer.invoke(
    CHAT_SEND_MESSAGE_CHANNEL,
    request,
  ) as Promise<AgentCliDesktopRunTurnResponse>,
  editAndResendMessage: async (request) => ipcRenderer.invoke(
    CHAT_EDIT_AND_RESEND_CHANNEL,
    request,
  ) as Promise<AgentCliDesktopRunTurnResponse>,
};

contextBridge.exposeInMainWorld('agentCliDesktop', desktopApi);
