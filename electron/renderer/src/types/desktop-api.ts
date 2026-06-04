/**
 * Desktop API Types
 *
 * Purpose:
 * - Type the preload-exposed Electron bridge consumed by the React renderer.
 *
 * Recent changes:
 * - 2026-06-04: Added current-turn runtime event subscription for verbose-mode streaming.
 * - 2026-05-31: Added runtime provider/model metadata to workspace responses.
 * - 2026-05-31: Added optional workspace world summary metadata to workspace responses.
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
  skillSelection?: AgentCliDesktopSkillSelection;
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
  turnEvents: AgentCliDesktopTurnEvent[];
};

export type AgentCliDesktopTurnEvent = {
  type: 'reasoning' | 'warning' | 'error' | 'model_response' | 'tool_call' | 'tool_result';
  text?: string;
  toolCall?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  modelResponse?: Record<string, unknown>;
  createdAt: string;
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

export type AgentCliDesktopWorldSummary = {
  filePath: string;
  workflow: string;
  agents: string[];
};

export type AgentCliDesktopRuntimeSummary = {
  provider: string;
  model: string;
};

export type AgentCliDesktopSkillSummary = {
  skillId: string;
  description?: string;
  sourcePath?: string;
  sourceScope?: 'user' | 'project';
};

export type AgentCliDesktopSkillInventory = {
  user: AgentCliDesktopSkillSummary[];
  project: AgentCliDesktopSkillSummary[];
};

export type AgentCliDesktopSkillSelection = {
  globalEnabled: boolean;
  projectEnabled: boolean;
  disabledSkillKeys: string[];
};

export type AgentCliDesktopHumanInputOption = {
  id: string;
  label: string;
  description?: string;
};

export type AgentCliDesktopHumanInputQuestion = {
  header: string;
  id: string;
  question: string;
  options: AgentCliDesktopHumanInputOption[];
  allowFreeformInput?: boolean;
};

export type AgentCliDesktopHumanInputRequest = {
  toolName: string;
  requestId: string;
  type: 'single-select' | 'multiple-select';
  allowSkip: boolean;
  questions: AgentCliDesktopHumanInputQuestion[];
};

export type AgentCliDesktopHumanInputSelection = {
  questionId: string;
  questionText?: string;
  skipped: boolean;
  selectedOptions: AgentCliDesktopHumanInputOption[];
  enteredText?: string;
};

export type AgentCliDesktopHumanInputAnswer = {
  ok: boolean;
  status: 'answered' | 'skipped' | 'cancelled' | 'unavailable';
  requestId: string;
  selections: AgentCliDesktopHumanInputSelection[];
  message?: string;
};

export type AgentCliDesktopWorkspaceResponse = {
  canceled?: boolean;
  workspaceRoot: string;
  chats: AgentCliDesktopChatSummary[];
  currentChatId: string | null;
  runtimeSummary: AgentCliDesktopRuntimeSummary;
  skillInventory: AgentCliDesktopSkillInventory;
  globalSkillsEnabled: boolean;
  projectSkillsEnabled: boolean;
  worldSummary: AgentCliDesktopWorldSummary | null;
  worldSummaryWarning?: string;
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
  onTurnEvent: (callback: (event: AgentCliDesktopTurnEvent) => void) => () => void;
  onHumanInputRequest: (callback: (request: AgentCliDesktopHumanInputRequest) => void) => () => void;
  submitHumanInputAnswer: (answer: AgentCliDesktopHumanInputAnswer) => Promise<{ ok: boolean }>;
};

declare global {
  interface Window {
    agentCliDesktop?: AgentCliDesktopApi;
  }
}
