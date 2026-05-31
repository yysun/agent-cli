/**
 * Desktop API Types
 *
 * Purpose:
 * - Type the preload-exposed Electron bridge consumed by the React renderer.
 *
 * Recent changes:
 * - 2026-05-31: Added renderer-local desktop API types for IPC-backed features.
 */
export type AgentCliDesktopAppInfo = {
  name: string;
  version: string;
  platform: string;
  rendererMode: 'electron';
};

export type AgentCliDesktopRuntimeMessage = {
  id?: string;
  role?: string;
  content?: string;
  createdAt?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
  toolCallId?: string;
};

export type AgentCliDesktopRunTurnRequest = {
  chatId?: string;
  message?: string;
  userMessage?: string;
  content?: string;
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
  sendChatMessage: (request: AgentCliDesktopRunTurnRequest) => Promise<AgentCliDesktopRunTurnResponse>;
  editAndResendMessage: (request: AgentCliDesktopRunTurnRequest & {
    chatId: string;
    messageIndex?: number;
    messageId?: string;
  }) => Promise<AgentCliDesktopRunTurnResponse>;
};

declare global {
  interface Window {
    agentCliDesktop?: AgentCliDesktopApi;
  }
}