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
 * - 2026-07-28: Exposed explicit 0.7 turn, approval, and human-input outcomes.
 * - 2026-07-27: Exposed the tool-approval request subscription and answer bridge.
 * - 2026-07-27: Dropped renderer-supplied chat history from the runtime turn request.
 * - 2026-06-04: Exposed a current-turn runtime event subscription for Electron verbose mode.
 * - 2026-05-31: Added runtime provider/model metadata to workspace IPC responses.
 * - 2026-05-31: Added optional workspace world summary metadata to workspace IPC responses.
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
const TURN_EVENT_CHANNEL = 'turn:event';
const HUMAN_INPUT_REQUEST_CHANNEL = 'humanInput:request';
const HUMAN_INPUT_ANSWER_CHANNEL = 'humanInput:answer';
const TOOL_APPROVAL_REQUEST_CHANNEL = 'toolApproval:request';
const TOOL_APPROVAL_ANSWER_CHANNEL = 'toolApproval:answer';

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
  workspaceRoot?: string;
  agentConfig?: Record<string, unknown>;
  skillSelection?: AgentCliDesktopSkillSelection;
  stream?: boolean;
  historyMessageLimit?: number;
};

export type AgentCliDesktopRunTurnResponse = {
  chatId: string;
  workspaceRoot: string;
  status: 'completed' | 'tool_calls' | 'cancelled';
  assistantText: string;
  cancellation?: AgentCliDesktopCancellation;
  messages: AgentCliDesktopRuntimeMessage[];
  streamChunks: Array<Record<string, unknown>>;
  toolCalls: Array<Record<string, unknown>>;
  toolResults: Array<Record<string, unknown>>;
  turnEvents: AgentCliDesktopTurnEvent[];
};

export type AgentCliDesktopCancellation =
  | {
    kind: 'tool_approval';
    reason: 'approval_rejected' | 'approval_dismissed' | 'approval_timeout' | 'approval_invalid' | 'approval_callback_error';
    toolCall: Record<string, unknown>;
    message?: string;
  }
  | {
    kind: 'human_input';
    reason: 'rejected' | 'skipped' | 'dismissed' | 'timeout' | 'invalid';
    toolCallId: string;
    toolName: string;
    message?: string;
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
  toolPermission: string;
  reasoningEffort: string;
};

export type AgentCliDesktopToolApprovalRequest = {
  requestId: string;
  toolCallId: string;
  toolName: string;
  argumentsSummary: string;
};

export type AgentCliDesktopToolApprovalAnswer = { requestId: string } & (
  | { decision: 'approve' }
  | {
    decision: 'cancel';
    reason: 'rejected' | 'dismissed' | 'timeout';
    message?: string;
  }
);

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
  allowOther?: boolean;
};

export type AgentCliDesktopHumanInputRequest = {
  toolName: string;
  requestId: string;
  type: 'single-select' | 'multiple-select';
  allowSkip: boolean;
  questions: AgentCliDesktopHumanInputQuestion[];
};

export type AgentCliDesktopHumanInputAnswer = { requestId: string } & (
  | {
    status: 'answered';
    answers: Record<string, string | string[]>;
  }
  | {
    status: 'cancelled';
    reason: 'rejected' | 'skipped' | 'dismissed' | 'timeout';
    message?: string;
  }
);

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
    skillSelection?: AgentCliDesktopSkillSelection;
    stream?: boolean;
    historyMessageLimit?: number;
  }) => Promise<AgentCliDesktopRunTurnResponse>;
  onTurnEvent: (callback: (event: AgentCliDesktopTurnEvent) => void) => () => void;
  onHumanInputRequest: (callback: (request: AgentCliDesktopHumanInputRequest) => void) => () => void;
  submitHumanInputAnswer: (answer: AgentCliDesktopHumanInputAnswer) => Promise<{ ok: boolean }>;
  onToolApprovalRequest: (callback: (request: AgentCliDesktopToolApprovalRequest) => void) => () => void;
  submitToolApprovalAnswer: (answer: AgentCliDesktopToolApprovalAnswer) => Promise<{ ok: boolean }>;
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
  onTurnEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, turnEvent: AgentCliDesktopTurnEvent) => callback(turnEvent);
    ipcRenderer.on(TURN_EVENT_CHANNEL, listener);
    return () => ipcRenderer.removeListener(TURN_EVENT_CHANNEL, listener);
  },
  onHumanInputRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: AgentCliDesktopHumanInputRequest) => callback(request);
    ipcRenderer.on(HUMAN_INPUT_REQUEST_CHANNEL, listener);
    return () => ipcRenderer.removeListener(HUMAN_INPUT_REQUEST_CHANNEL, listener);
  },
  submitHumanInputAnswer: async (answer) => ipcRenderer.invoke(
    HUMAN_INPUT_ANSWER_CHANNEL,
    answer,
  ) as Promise<{ ok: boolean }>,
  onToolApprovalRequest: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, request: AgentCliDesktopToolApprovalRequest) => callback(request);
    ipcRenderer.on(TOOL_APPROVAL_REQUEST_CHANNEL, listener);
    return () => ipcRenderer.removeListener(TOOL_APPROVAL_REQUEST_CHANNEL, listener);
  },
  submitToolApprovalAnswer: async (answer) => ipcRenderer.invoke(
    TOOL_APPROVAL_ANSWER_CHANNEL,
    answer,
  ) as Promise<{ ok: boolean }>,
};

contextBridge.exposeInMainWorld('agentCliDesktop', desktopApi);
