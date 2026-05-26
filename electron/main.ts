/**
 * Agent World Electron Main Process
 *
 * Purpose:
 * - Provide a minimal desktop shell with an Electron-owned renderer.
 *
 * Key features:
 * - Loads electron/renderer/index.html directly in development and packaged modes.
 * - Keeps renderer isolation enabled and exposes only a tiny preload metadata bridge.
 * - Runs Agent CLI chat turns in the main process through an IPC bridge.
 * - Provides workspace, chat selection, message send, and edit/resend IPC handlers.
 * - Sends external links to the operating system browser.
 *
 * Recent changes:
 * - 2026-05-26: Added persisted workspace/chat IPC flows for the Electron renderer.
 * - 2026-05-26: Added IPC-backed Agent CLI runtime execution using core/agent-runtime.ts.
 * - 2026-05-24: Renamed the Electron-facing app identity to Agent World.
 * - 2026-05-24: Switched from the shared web app to an Electron-owned renderer.
 * - 2026-05-24: Allowed same-origin dev-server navigation while keeping external links out of the shell.
 * - 2026-05-24: Added the initial minimal Electron shell entry point.
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadPersistedRuntimeConfig, normalizeAgentConfig } from '../core/agent-config.js';
import {
  getBuiltInSystemPrompt,
  loadSkillInventory,
  loadWorkspaceSystemPrompt,
} from '../core/agent-files.js';
import { runChatTurn } from '../core/agent-runtime.js';
import { WORKSPACE_ROOT } from '../core/paths.js';
import { prepareWorkspaceEnvironment } from '../core/workspace-environment.js';
import { ensureWorkspaceWorld } from '../core/workspace-store.js';
import {
  createPersistedChat,
  listPersistedChats,
  loadChatById,
  loadRequestedChat,
  persistCompletedChat,
  setCurrentChat,
} from '../core/world-store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

type AgentTurnMessage = {
  role?: string;
  content?: string;
  createdAt?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

type AgentTurnRequest = {
  chatId?: string;
  message?: string;
  userMessage?: string;
  messages?: AgentTurnMessage[];
  workspaceRoot?: string;
  agentConfig?: Record<string, unknown>;
  stream?: boolean;
  historyMessageLimit?: number;
};

type WorkspaceSelectRequest = {
  workspaceRoot?: string;
};

type ChatIdRequest = {
  chatId?: string;
};

type SendMessageRequest = AgentTurnRequest & {
  content?: string;
};

type EditAndResendRequest = {
  chatId?: string;
  messageIndex?: number;
  messageId?: string;
  content?: string;
  message?: string;
  agentConfig?: Record<string, unknown>;
  stream?: boolean;
  historyMessageLimit?: number;
};

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

function normalizeChatMessages(messages: unknown): AgentTurnMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .filter((message): message is Record<string, unknown> => Boolean(message) && typeof message === 'object')
    .map((message) => ({
      ...message,
      role: typeof message.role === 'string' ? message.role : undefined,
      content: typeof message.content === 'string' ? message.content : '',
      createdAt: typeof message.createdAt === 'string' ? message.createdAt : undefined,
    }));
}

function normalizeAgentTurnRequest(request: unknown): AgentTurnRequest {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return {};
  }

  return request as AgentTurnRequest;
}

function normalizeRequestAgentConfig(agentConfig: unknown): Record<string, unknown> {
  if (!agentConfig || typeof agentConfig !== 'object' || Array.isArray(agentConfig)) {
    return {};
  }

  return agentConfig as Record<string, unknown>;
}

async function prepareElectronWorkspace(workspaceRoot?: string): Promise<string> {
  const resolvedWorkspaceRoot = prepareWorkspaceEnvironment(workspaceRoot);
  await ensureWorkspaceWorld();
  return resolvedWorkspaceRoot;
}

async function loadRuntimeInputs(request: {
  agentConfig?: Record<string, unknown>;
}) {
  const agentConfig = {
    ...loadPersistedRuntimeConfig(),
    ...normalizeAgentConfig(normalizeRequestAgentConfig(request.agentConfig)),
  };
  const [workspaceSystemPrompt, skillInventory] = await Promise.all([
    loadWorkspaceSystemPrompt(),
    loadSkillInventory(),
  ]);

  return {
    agentConfig,
    workspaceSystemPrompt,
    skillInventory,
  };
}

function resolveHistoryMessageLimit(request: {
  historyMessageLimit?: number;
}, agentConfig: Record<string, unknown>): number | undefined {
  return typeof request.historyMessageLimit === 'number'
    ? request.historyMessageLimit
    : typeof agentConfig.pastMessages === 'number'
      ? agentConfig.pastMessages
      : undefined;
}

async function executeRuntimeTurn(params: {
  chat: { id: string; messages: AgentTurnMessage[]; createdAt?: string; updatedAt?: string };
  userMessage: string;
  request: Pick<AgentTurnRequest, 'agentConfig' | 'stream' | 'historyMessageLimit'>;
}) {
  const { agentConfig, workspaceSystemPrompt, skillInventory } = await loadRuntimeInputs(params.request);
  const streamChunks: Array<Record<string, unknown>> = [];
  const toolCalls: Array<Record<string, unknown>> = [];
  const toolResults: Array<Record<string, unknown>> = [];

  const result = await runChatTurn({
    chat: params.chat,
    userMessage: params.userMessage,
    stream: params.request.stream === true,
    historyMessageLimit: resolveHistoryMessageLimit(params.request, agentConfig),
    builtInSystemPrompt: getBuiltInSystemPrompt(),
    workspaceSystemPrompt,
    skillInventory,
    agentConfig,
    onStreamChunk: (chunk) => {
      streamChunks.push({ ...chunk });
    },
    onToolCall: (toolCall) => {
      toolCalls.push({ ...toolCall });
    },
    onToolResult: (toolResult) => {
      toolResults.push({ ...toolResult });
    },
  });

  const persistedChat = await persistCompletedChat({
    chat: params.chat,
    messages: result.messages,
  });

  return {
    chatId: persistedChat.id,
    workspaceRoot: WORKSPACE_ROOT,
    assistantText: result.assistantText,
    messages: persistedChat.messages,
    streamChunks,
    toolCalls,
    toolResults,
  };
}

async function runAgentTurn(rawRequest: AgentTurnRequest = {}) {
  const request = normalizeAgentTurnRequest(rawRequest);
  const userMessage = String(request.userMessage ?? request.message ?? '').trim();
  if (!userMessage) {
    throw new Error('Message content is required.');
  }

  await prepareElectronWorkspace(request.workspaceRoot);
  const chatId = String(request.chatId ?? 'electron-default-chat').trim() || 'electron-default-chat';
  const requestMessages = normalizeChatMessages(request.messages);
  const chat = {
    id: chatId,
    messages: requestMessages,
  };

  return executeRuntimeTurn({
    chat,
    userMessage,
    request,
  });
}

async function getWorkspace() {
  const workspaceRoot = await prepareElectronWorkspace();
  const chats = await listPersistedChats();

  return {
    workspaceRoot,
    chats,
    currentChatId: chats.find((chat) => chat.isCurrent)?.id ?? null,
  };
}

async function selectWorkspace(request: WorkspaceSelectRequest = {}) {
  let workspaceRoot = String(request.workspaceRoot ?? '').trim();

  if (!workspaceRoot) {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Agent CLI Workspace',
    });

    if (result.canceled || !result.filePaths[0]) {
      return {
        canceled: true,
        ...(await getWorkspace()),
      };
    }

    workspaceRoot = result.filePaths[0];
  }

  const resolvedWorkspaceRoot = await prepareElectronWorkspace(workspaceRoot);
  const chats = await listPersistedChats();

  return {
    canceled: false,
    workspaceRoot: resolvedWorkspaceRoot,
    chats,
    currentChatId: chats.find((chat) => chat.isCurrent)?.id ?? null,
  };
}

async function listChats(request: WorkspaceSelectRequest = {}) {
  const workspaceRoot = await prepareElectronWorkspace(request.workspaceRoot);
  const chats = await listPersistedChats();

  return {
    workspaceRoot,
    chats,
    currentChatId: chats.find((chat) => chat.isCurrent)?.id ?? null,
  };
}

async function createChat(request: WorkspaceSelectRequest = {}) {
  const workspaceRoot = await prepareElectronWorkspace(request.workspaceRoot);
  const chat = await createPersistedChat({ setCurrent: true });
  const chats = await listPersistedChats();

  return {
    workspaceRoot,
    chat,
    chats,
  };
}

async function selectChat(request: ChatIdRequest = {}) {
  await prepareElectronWorkspace();
  const chatId = String(request.chatId ?? '').trim();
  if (!chatId) {
    throw new Error('Chat ID is required.');
  }

  const chat = await setCurrentChat(chatId);
  const chats = await listPersistedChats();

  return {
    workspaceRoot: WORKSPACE_ROOT,
    chat,
    chats,
  };
}

async function getChatMessages(request: ChatIdRequest = {}) {
  await prepareElectronWorkspace();
  const chatId = String(request.chatId ?? '').trim();
  const chat = chatId
    ? await loadChatById(chatId)
    : await loadRequestedChat({ newChat: false });

  return {
    workspaceRoot: WORKSPACE_ROOT,
    chat,
    messages: chat.messages,
  };
}

async function sendChatMessage(request: SendMessageRequest = {}) {
  await prepareElectronWorkspace(request.workspaceRoot);
  const userMessage = String(request.content ?? request.userMessage ?? request.message ?? '').trim();
  if (!userMessage) {
    throw new Error('Message content is required.');
  }

  const chatId = String(request.chatId ?? '').trim();
  const chat = chatId
    ? await setCurrentChat(chatId)
    : await loadRequestedChat({ newChat: false });

  return executeRuntimeTurn({
    chat: {
      ...chat,
      messages: normalizeChatMessages(chat.messages),
    },
    userMessage,
    request,
  });
}

function resolveMessageIndex(chat: { messages: AgentTurnMessage[] }, request: EditAndResendRequest): number {
  if (typeof request.messageIndex === 'number' && Number.isInteger(request.messageIndex)) {
    return request.messageIndex;
  }

  const messageId = String(request.messageId ?? '').trim();
  if (!messageId) {
    return -1;
  }

  return chat.messages.findIndex((message) => String((message as Record<string, unknown>).id ?? '') === messageId);
}

async function editAndResendMessage(request: EditAndResendRequest = {}) {
  await prepareElectronWorkspace();
  const chatId = String(request.chatId ?? '').trim();
  const replacementContent = String(request.content ?? request.message ?? '').trim();

  if (!chatId) {
    throw new Error('Chat ID is required.');
  }

  if (!replacementContent) {
    throw new Error('Message content is required.');
  }

  const chat = await setCurrentChat(chatId);
  const messages = normalizeChatMessages(chat.messages);
  const messageIndex = resolveMessageIndex({ messages }, request);
  const messageToEdit = messages[messageIndex];

  if (!messageToEdit) {
    throw new Error('Message not found.');
  }

  if (messageToEdit.role !== 'user') {
    throw new Error('Only user messages can be edited and resent.');
  }

  return executeRuntimeTurn({
    chat: {
      ...chat,
      messages: messages.slice(0, messageIndex),
    },
    userMessage: replacementContent,
    request,
  });
}

async function invokeWithWorkspace<T>(handler: () => Promise<T>): Promise<T> {
  try {
    return await handler();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message);
  }
}

function registerAgentIpcHandlers(): void {
  const handlers: Array<[string, (request: any) => Promise<unknown>]> = [
    [AGENT_RUN_TURN_CHANNEL, runAgentTurn],
    [WORKSPACE_GET_CHANNEL, getWorkspace],
    [WORKSPACE_SELECT_CHANNEL, selectWorkspace],
    [CHAT_LIST_CHANNEL, listChats],
    [CHAT_CREATE_CHANNEL, createChat],
    [CHAT_SELECT_CHANNEL, selectChat],
    [CHAT_GET_MESSAGES_CHANNEL, getChatMessages],
    [CHAT_SEND_MESSAGE_CHANNEL, sendChatMessage],
    [CHAT_EDIT_AND_RESEND_CHANNEL, editAndResendMessage],
  ];

  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, (_event, request) => invokeWithWorkspace(() => handler(request)));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(DESKTOP_INFO_CHANNEL, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    rendererMode,
  }));
  registerAgentIpcHandlers();
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
