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
 * - 2026-06-10: Reject unresolved host-owned tool calls before persisting an Electron turn.
 * - 2026-06-04: Applied settings-panel skill enablement to both chat prompt inventory and runtime `load_skill` roots.
 * - 2026-06-04: Streamed current-turn runtime events to the renderer as Electron verbose diagnostics.
 * - 2026-05-31: Returned active runtime provider and model in Electron workspace metadata.
 * - 2026-05-31: Loaded Electron workspace current chat from `.agent-world/chats/current.json` before returning startup state.
 * - 2026-05-31: Restored the last Electron workspace before loading env/runtime inputs and returned world summary metadata.
 * - 2026-05-31: Added Vite React renderer loading for dev-server and built renderer modes.
 * - 2026-06-03: Added Electron human-input IPC handling for runtime `ask_user_input` turns.
 * - 2026-06-03: Moved pending human-input session lifecycle into a testable helper.
 * - 2026-05-31: Matched the reference Electron app's hidden-inset macOS titlebar for sidebar controls.
 * - 2026-05-26: Added persisted workspace/chat IPC flows for the Electron renderer.
 * - 2026-05-26: Added IPC-backed Agent CLI runtime execution using core/agent-runtime.ts.
 * - 2026-05-24: Renamed the Electron-facing app identity to Agent World.
 * - 2026-05-24: Switched from the shared web app to an Electron-owned renderer.
 * - 2026-05-24: Allowed same-origin dev-server navigation while keeping external links out of the shell.
 * - 2026-05-24: Added the initial minimal Electron shell entry point.
 */
import { app, BrowserWindow, dialog, ipcMain, shell, type WebContents } from 'electron';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadPersistedRuntimeConfig, normalizeAgentConfig } from '../core/agent-config.js';
import {
  loadAgentWorldStartupSummary,
  type AgentWorldStartupSummary,
} from '../core/agent-world-config.js';
import {
  buildRuntimeSkillRootsFromInventory,
  getBuiltInSystemPrompt,
  isGlobalSkillLoadingEnabled,
  loadSkillInventoryByScope,
  loadWorkspaceSystemPrompt,
  selectSkillInventoryBySettings,
} from '../core/agent-files.js';
import {
  parseHumanInputRequest,
} from '../cli/src/human-input-ui.js';
import { HumanInputSessionManager } from './human-input-session.js';
import { assertCompletedChatTurn, resolveRuntimeSelection, runChatTurn } from '../core/agent-runtime.js';
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
} from '../core/chat-store.js';

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
const TURN_EVENT_CHANNEL = 'turn:event';
const HUMAN_INPUT_REQUEST_CHANNEL = 'humanInput:request';
const HUMAN_INPUT_ANSWER_CHANNEL = 'humanInput:answer';
const RENDERER_URL_ENV = 'AGENT_CLI_ELECTRON_RENDERER_URL';
const ELECTRON_WORKSPACE_STATE_FILE = 'workspace-state.json';
const HUMAN_INPUT_TIMEOUT_MS = 30 * 60 * 1000;

type AgentTurnMessage = {
  role?: string;
  content?: string;
  createdAt?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
};

type SkillSelectionRequest = {
  globalEnabled?: boolean;
  projectEnabled?: boolean;
  disabledSkillKeys?: string[];
};

type AgentTurnRequest = {
  chatId?: string;
  message?: string;
  userMessage?: string;
  messages?: AgentTurnMessage[];
  workspaceRoot?: string;
  agentConfig?: Record<string, unknown>;
  skillSelection?: SkillSelectionRequest;
  stream?: boolean;
  historyMessageLimit?: number;
};

type WorkspaceSelectRequest = {
  workspaceRoot?: string;
};

type ChatIdRequest = {
  chatId?: string;
};

type WorkspaceMetadata = {
  worldSummary: AgentWorldStartupSummary | null;
  worldSummaryWarning?: string;
  runtimeSummary: {
    provider: string;
    model: string;
  };
  skillInventory: Awaited<ReturnType<typeof loadSkillInventoryByScope>>;
  globalSkillsEnabled: boolean;
  projectSkillsEnabled: boolean;
};

type TurnEvent = {
  type: 'reasoning' | 'warning' | 'error' | 'model_response' | 'tool_call' | 'tool_result';
  text?: string;
  toolCall?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  modelResponse?: Record<string, unknown>;
  createdAt: string;
};

type TurnEventRecorder = (event: Omit<TurnEvent, 'createdAt'>) => void;

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
  skillSelection?: SkillSelectionRequest;
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
  return path.join(getProjectRoot(), 'electron', 'renderer', 'dist', 'index.html');
}

function getWorkspaceStatePath(): string {
  return path.join(app.getPath('userData'), ELECTRON_WORKSPACE_STATE_FILE);
}

function getRendererDevUrl(): string | null {
  const rendererUrl = String(process.env[RENDERER_URL_ENV] ?? '').trim();
  return rendererUrl ? rendererUrl : null;
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
const humanInputSessions = new HumanInputSessionManager({
  requestChannel: HUMAN_INPUT_REQUEST_CHANNEL,
  timeoutMs: HUMAN_INPUT_TIMEOUT_MS,
});

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

function normalizeSkillSelection(skillSelection: unknown): SkillSelectionRequest {
  if (!skillSelection || typeof skillSelection !== 'object' || Array.isArray(skillSelection)) {
    return {};
  }

  const source = skillSelection as Record<string, unknown>;
  return {
    globalEnabled: typeof source.globalEnabled === 'boolean' ? source.globalEnabled : undefined,
    projectEnabled: typeof source.projectEnabled === 'boolean' ? source.projectEnabled : undefined,
    disabledSkillKeys: Array.isArray(source.disabledSkillKeys)
      ? source.disabledSkillKeys.map((key) => String(key)).filter(Boolean)
      : [],
  };
}

function normalizeWorkspacePath(value: unknown): string {
  return String(value ?? '').trim();
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

async function loadPersistedWorkspaceRoot(): Promise<string | undefined> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(await fs.readFile(getWorkspaceStatePath(), 'utf8'));
  } catch {
    return undefined;
  }

  const workspaceRoot = normalizeWorkspacePath(
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).workspaceRoot
      : undefined,
  );

  if (!workspaceRoot || !(await isDirectory(workspaceRoot))) {
    return undefined;
  }

  return workspaceRoot;
}

async function persistWorkspaceRoot(workspaceRoot: string): Promise<void> {
  const resolvedWorkspaceRoot = normalizeWorkspacePath(workspaceRoot);
  if (!resolvedWorkspaceRoot) {
    return;
  }

  const statePath = getWorkspaceStatePath();
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(
    statePath,
    `${JSON.stringify({ workspaceRoot: resolvedWorkspaceRoot }, null, 2)}\n`,
    'utf8',
  );
}

async function resolveElectronWorkspaceRoot(workspaceRoot?: string): Promise<string | undefined> {
  const requestedWorkspaceRoot = normalizeWorkspacePath(workspaceRoot);
  return requestedWorkspaceRoot || await loadPersistedWorkspaceRoot();
}

async function prepareElectronWorkspace(workspaceRoot?: string): Promise<string> {
  const resolvedWorkspaceRoot = prepareWorkspaceEnvironment(
    await resolveElectronWorkspaceRoot(workspaceRoot),
    { refreshDotEnv: true },
  );
  await ensureWorkspaceWorld();
  await persistWorkspaceRoot(resolvedWorkspaceRoot);
  return resolvedWorkspaceRoot;
}

async function loadWorkspaceMetadata(): Promise<WorkspaceMetadata> {
  const runtimeSummary = resolveRuntimeSelection(process.env, loadPersistedRuntimeConfig());
  const skillInventory = await loadSkillInventoryByScope();

  try {
    return {
      runtimeSummary,
      skillInventory,
      globalSkillsEnabled: isGlobalSkillLoadingEnabled(),
      projectSkillsEnabled: true,
      worldSummary: await loadAgentWorldStartupSummary(),
    };
  } catch (error) {
    return {
      runtimeSummary,
      skillInventory,
      globalSkillsEnabled: isGlobalSkillLoadingEnabled(),
      projectSkillsEnabled: true,
      worldSummary: null,
      worldSummaryWarning: error instanceof Error ? error.message : String(error),
    };
  }
}

async function buildWorkspaceResponse(params: {
  workspaceRoot: string;
  chats: Awaited<ReturnType<typeof listPersistedChats>>;
  currentChatId: string | null;
  canceled?: boolean;
}) {
  const workspaceMetadata = await loadWorkspaceMetadata();

  return {
    ...(typeof params.canceled === 'boolean' ? { canceled: params.canceled } : {}),
    workspaceRoot: params.workspaceRoot,
    chats: params.chats,
    currentChatId: params.currentChatId,
    ...workspaceMetadata,
  };
}

async function loadWorkspaceChatState() {
  const currentChat = await loadRequestedChat({ newChat: false });
  const chats = await listPersistedChats();

  return {
    chats,
    currentChatId: currentChat.id,
  };
}

async function loadRuntimeInputs(request: {
  agentConfig?: Record<string, unknown>;
  skillSelection?: SkillSelectionRequest;
}) {
  const agentConfig = {
    ...loadPersistedRuntimeConfig(),
    ...normalizeAgentConfig(normalizeRequestAgentConfig(request.agentConfig)),
  };
  const [workspaceSystemPrompt, scopedSkillInventory] = await Promise.all([
    loadWorkspaceSystemPrompt(),
    loadSkillInventoryByScope(),
  ]);
  const skillSelection = normalizeSkillSelection(request.skillSelection);
  const skillInventory = selectSkillInventoryBySettings(scopedSkillInventory, skillSelection);

  return {
    agentConfig,
    workspaceSystemPrompt,
    skillInventory,
    runtimeSkillRoots: buildRuntimeSkillRootsFromInventory(skillInventory),
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
  request: Pick<AgentTurnRequest, 'agentConfig' | 'skillSelection' | 'stream' | 'historyMessageLimit'>;
  rendererWebContents?: WebContents;
}) {
  const { agentConfig, workspaceSystemPrompt, skillInventory, runtimeSkillRoots } = await loadRuntimeInputs(params.request);
  const streamChunks: Array<Record<string, unknown>> = [];
  const toolCalls: Array<Record<string, unknown>> = [];
  const toolResults: Array<Record<string, unknown>> = [];
  const turnEvents: TurnEvent[] = [];
  const recordTurnEvent: TurnEventRecorder = (event) => {
    const turnEvent = {
      ...event,
      createdAt: new Date().toISOString(),
    };
    turnEvents.push(turnEvent);
    if (params.rendererWebContents && !params.rendererWebContents.isDestroyed()) {
      params.rendererWebContents.send(TURN_EVENT_CHANNEL, turnEvent);
    }
  };

  const result = await runChatTurn({
    chat: params.chat,
    userMessage: params.userMessage,
    stream: params.request.stream === true,
    historyMessageLimit: resolveHistoryMessageLimit(params.request, agentConfig),
    builtInSystemPrompt: getBuiltInSystemPrompt(),
    workspaceSystemPrompt,
    skillInventory,
    runtimeSkillRoots,
    agentConfig,
    onStreamChunk: (chunk) => {
      streamChunks.push({ ...chunk });
      const reasoningText = [
        chunk.reasoningContent,
        chunk.reasoning,
        chunk.reasoningText,
        chunk.thinking,
      ].find((value) => typeof value === 'string' && value.length > 0);

      if (reasoningText) {
        recordTurnEvent({
          type: 'reasoning',
          text: reasoningText,
        });
      }

      for (const warning of chunk.warnings ?? []) {
        recordTurnEvent({
          type: 'warning',
          text: String(warning && typeof warning === 'object' && 'message' in warning ? warning.message : warning),
        });
      }

      for (const streamError of [
        ...(Array.isArray(chunk.errors) ? chunk.errors : []),
        ...(chunk.error ? [chunk.error] : []),
      ]) {
        recordTurnEvent({
          type: 'error',
          text: String(streamError && typeof streamError === 'object' && 'message' in streamError ? streamError.message : streamError),
        });
      }
    },
    onModelResponse: (modelResponse) => {
      recordTurnEvent({
        type: 'model_response',
        modelResponse: { ...modelResponse },
      });
    },
    onToolCall: (toolCall) => {
      toolCalls.push({ ...toolCall });
      recordTurnEvent({
        type: 'tool_call',
        toolCall: { ...toolCall },
      });
    },
    onToolResult: (toolResult) => {
      toolResults.push({ ...toolResult });
      recordTurnEvent({
        type: 'tool_result',
        toolResult: { ...toolResult },
      });
    },
    handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
      const humanInputRequest = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
      if (!humanInputRequest) {
        return { handled: false };
      }

      return {
        handled: true,
        result: await humanInputSessions.requestInput(params.rendererWebContents, humanInputRequest),
      };
    },
  });

  assertCompletedChatTurn(result);

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
    turnEvents,
  };
}

async function runAgentTurn(rawRequest: AgentTurnRequest = {}, rendererWebContents?: WebContents) {
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
    rendererWebContents,
  });
}

async function getWorkspace() {
  const workspaceRoot = await prepareElectronWorkspace();
  const { chats, currentChatId } = await loadWorkspaceChatState();

  return buildWorkspaceResponse({ workspaceRoot, chats, currentChatId });
}

async function selectWorkspace(request: WorkspaceSelectRequest = {}) {
  let workspaceRoot = String(request.workspaceRoot ?? '').trim();

  if (!workspaceRoot) {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Open Workspace Folder',
    });

    if (result.canceled || !result.filePaths[0]) {
      return {
        ...(await getWorkspace()),
        canceled: true,
      };
    }

    workspaceRoot = result.filePaths[0];
  }

  const resolvedWorkspaceRoot = await prepareElectronWorkspace(workspaceRoot);
  const { chats, currentChatId } = await loadWorkspaceChatState();

  return buildWorkspaceResponse({
    canceled: false,
    workspaceRoot: resolvedWorkspaceRoot,
    chats,
    currentChatId,
  });
}

async function listChats(request: WorkspaceSelectRequest = {}) {
  const workspaceRoot = await prepareElectronWorkspace(request.workspaceRoot);
  const { chats, currentChatId } = await loadWorkspaceChatState();

  return buildWorkspaceResponse({ workspaceRoot, chats, currentChatId });
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

async function sendChatMessage(request: SendMessageRequest = {}, rendererWebContents?: WebContents) {
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
    rendererWebContents,
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

async function editAndResendMessage(request: EditAndResendRequest = {}, rendererWebContents?: WebContents) {
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
    rendererWebContents,
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
  const handlers: Array<[string, (request: any, rendererWebContents: WebContents) => Promise<unknown>]> = [
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
    ipcMain.handle(channel, (event, request) => invokeWithWorkspace(() => handler(request, event.sender)));
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(DESKTOP_INFO_CHANNEL, () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    rendererMode,
  }));
  ipcMain.handle(HUMAN_INPUT_ANSWER_CHANNEL, (_event, answer) => humanInputSessions.resolveAnswer(answer));
  registerAgentIpcHandlers();
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  rendererMode = 'electron';
  const rendererDevUrl = getRendererDevUrl();
  if (rendererDevUrl) {
    await window.loadURL(rendererDevUrl);
    return;
  }

  await window.loadFile(getRendererIndexPath());
}

async function createMainWindow(): Promise<BrowserWindow> {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'Agent World',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
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
