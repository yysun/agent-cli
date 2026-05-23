/**
 * Agent World Runtime API
 *
 * Purpose:
 * - Provide a concrete workspace-local world API over existing Agent CLI storage and turn execution.
 *
 * Key features:
 * - Owns typed world, agent, chat, event, queue, and message API surfaces.
 * - Routes user messages with Agent World paragraph-beginning @mention semantics.
 * - Persists per-agent memory and durable per-chat queue rows without replacing agent-runtime.
 *
 * Recent changes:
 * - 2026-05-23: Implemented the world API runtime, event emitter, mention routing, agent memory, and queue dispatch.
 */
import { EventEmitter } from 'node:events';

import { loadPersistedRuntimeConfig } from '../../core/agent-config.js';
import {
  getBuiltInSystemPrompt,
  loadSkillInventory,
  loadWorkspaceSystemPrompt,
} from '../../core/agent-files.js';
import { configureWorkspaceRoot } from '../../core/paths.js';
import { runChatTurn } from '../../core/runtime-client.js';
import {
  addQueuedMessage,
  appendAgentMemory,
  clearQueuedMessages,
  createAgentMetadata,
  createPersistedChat,
  deleteAgentMetadata,
  deletePersistedChat,
  listAgentMetadata,
  listPersistedChats,
  listQueuedMessages,
  loadAgentMemory,
  loadChatById,
  loadQueueState,
  loadWorldSnapshot,
  persistCompletedChat,
  removeQueuedMessage,
  setCurrentChat,
  setQueuePaused,
  stopQueuedMessages,
  updateAgentMetadata,
  updateQueuedMessage,
  updateWorldMetadata,
} from '../../core/session-store.js';

export interface WorkspaceState {
  workspaceRoot: string;
  worldLoaded: boolean;
}

export interface WorldSnapshot {
  id: string;
  name: string;
  defaultAgentId: string;
  currentChatId: string;
  agents: AgentInfo[];
  chats: ChatSummary[];
  updatedAt?: string;
  createdAt?: string;
}

export interface WorldInfo extends Record<string, unknown> {
  id: string;
  name: string;
  defaultAgentId: string;
  currentChatId: string;
}

export interface UpdateWorldInput extends Record<string, unknown> {
  name?: string;
  defaultAgentId?: string;
  currentChatId?: string;
  mainAgent?: string;
}

export type ExportWorldInput = Record<string, unknown>;
export type WorldExportResult = Record<string, unknown>;

export interface AgentInfo extends Record<string, unknown> {
  id: string;
  name?: string;
  provider?: string;
  model?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateAgentInput extends Record<string, unknown> {
  agentId?: string;
  id?: string;
  name?: string;
  provider?: string;
  model?: string;
  setDefault?: boolean;
}

export type UpdateAgentInput = Record<string, unknown>;
export type ImportAgentInput = Record<string, unknown>;
export type AgentImportResult = Record<string, unknown>;

export interface ChatSummary extends Record<string, unknown> {
  id: string;
  createdAt?: string;
  updatedAt?: string;
  messageCount?: number;
  isCurrent?: boolean;
}

export interface ChatCreateResult extends Record<string, unknown> {
  chatId: string;
  chat: ChatSummary;
}

export interface ChatActivation extends Record<string, unknown> {
  chatId: string;
  chat: ChatSummary;
}

export interface ChatDeleteResult extends Record<string, unknown> {
  chatId: string;
  deleted: boolean;
}

export interface ChatMessage extends Record<string, unknown> {
  role: string;
  content: string;
  createdAt?: string;
  messageId?: string;
  agentId?: string;
  chatId?: string;
}

export interface SendMessageInput extends Record<string, unknown> {
  content?: string;
  message?: string;
  chatId?: string;
  sender?: string;
  stream?: boolean;
  agentId?: string;
  queue?: boolean;
}

export interface SendMessageResult extends Record<string, unknown> {
  chatId: string;
  agentIds: string[];
  queued?: boolean;
  queueMessage?: QueuedMessage;
  messages?: ChatMessage[];
  assistantText?: string;
}

export type MessageMutationResult = Record<string, unknown>;
export type StopMessageResult = Record<string, unknown>;
export type WorldEvent = WorldRealtimeEvent;

export interface QueuedMessage extends Record<string, unknown> {
  messageId: string;
  chatId: string;
  content: string;
  sender: string;
  status: 'queued' | 'sending' | 'error' | 'cancelled';
  retryCount: number;
  createdAt: string;
  updatedAt?: string;
}

export type SkillListInput = Record<string, unknown>;
export interface SkillSummary extends Record<string, unknown> {
  skillId: string;
  description?: string;
  sourcePath?: string;
}
export type LocalSkillSummary = Record<string, unknown>;
export type ImportSkillInput = Record<string, unknown>;
export type SkillImportResult = Record<string, unknown>;
export type SkillImportPreview = Record<string, unknown>;
export type FileTreeEntry = Record<string, unknown>;
export type HeartbeatJobStatus = Record<string, unknown>;
export type HeartbeatRunResult = Record<string, unknown>;

export interface WorldEventSubscriptionInput extends Record<string, unknown> {
  types?: string[];
  chatId?: string;
}

export interface WorldEventSubscription extends Record<string, unknown> {
  subscriptionId: string;
}

export type WorldRealtimeEvent =
  | { type: 'message'; chatId: string; agentId?: string; message: ChatMessage; createdAt: string }
  | { type: 'assistant_chunk'; chatId: string; agentId: string; content: string; createdAt: string }
  | { type: 'tool_call'; chatId: string; agentId: string; toolCall: unknown; createdAt: string }
  | { type: 'tool_result'; chatId: string; agentId: string; toolResult: unknown; createdAt: string }
  | { type: 'run_started' | 'run_completed' | 'run_failed'; chatId: string; agentId: string; error?: string; createdAt: string }
  | { type: 'chat_selected' | 'chat_created' | 'chat_deleted'; chatId: string; createdAt: string }
  | { type: 'agent_created' | 'agent_updated' | 'agent_deleted'; agentId: string; createdAt: string }
  | { type: 'queue_added' | 'queue_updated' | 'queue_removed' | 'queue_paused' | 'queue_resumed' | 'queue_stopped' | 'queue_cleared' | 'queue_failed'; chatId: string; queueMessage?: QueuedMessage; error?: string; createdAt: string };

export interface AgentWorldApi {
  workspace: {
    get(): Promise<WorkspaceState>;
    open(path: string): Promise<WorkspaceState>;
    close(): Promise<void>;
    loadWorld(): Promise<WorldSnapshot>;
  };

  world: {
    get(): Promise<WorldSnapshot>;
    update(patch: UpdateWorldInput): Promise<WorldInfo>;
    export(input?: ExportWorldInput): Promise<WorldExportResult>;
  };

  agents: {
    list(): Promise<AgentInfo[]>;
    create(input: CreateAgentInput): Promise<AgentInfo>;
    update(agentId: string, patch: UpdateAgentInput): Promise<AgentInfo>;
    delete(agentId: string): Promise<{ agentId: string; deleted: true }>;
    import(input: ImportAgentInput): Promise<AgentImportResult>;
  };

  chats: {
    list(): Promise<ChatSummary[]>;
    create(): Promise<ChatCreateResult>;
    select(chatId: string): Promise<ChatActivation>;
    branchFromMessage(chatId: string, messageId: string): Promise<ChatCreateResult>;
    delete(chatId: string): Promise<ChatDeleteResult>;
    current(): Promise<ChatSummary | null>;
  };

  messages: {
    list(chatId?: string): Promise<ChatMessage[]>;
    send(input: SendMessageInput): Promise<SendMessageResult>;
    edit(chatId: string, messageId: string, content: string): Promise<MessageMutationResult>;
    deleteFrom(chatId: string, messageId: string): Promise<MessageMutationResult>;
    stop(chatId?: string): Promise<StopMessageResult>;
    events(chatId?: string): Promise<WorldEvent[]>;
  };

  queue: {
    list(chatId?: string): Promise<QueuedMessage[]>;
    add(content: string, sender?: string, chatId?: string): Promise<QueuedMessage>;
    remove(messageId: string): Promise<void>;
    clear(chatId?: string): Promise<void>;
    pause(chatId?: string): Promise<void>;
    resume(chatId?: string): Promise<void>;
    stop(chatId?: string): Promise<void>;
    retry(messageId: string, chatId?: string): Promise<QueuedMessage>;
  };

  skills: {
    list(input?: SkillListInput): Promise<SkillSummary[]>;
    listGitHub(repo: string): Promise<SkillSummary[]>;
    listLocal(path: string): Promise<LocalSkillSummary[]>;
    import(input: ImportSkillInput): Promise<SkillImportResult>;
    previewImport(input: ImportSkillInput): Promise<SkillImportPreview | null>;
    read(skillId: string, relativePath?: string): Promise<string>;
    write(skillId: string, content: string, relativePath?: string): Promise<void>;
    tree(skillId: string): Promise<FileTreeEntry[]>;
    delete(skillId: string): Promise<void>;
  };

  heartbeat: {
    list(): Promise<HeartbeatJobStatus[]>;
    run(chatId?: string): Promise<HeartbeatRunResult>;
    pause(): Promise<void>;
    stop(): Promise<void>;
  };

  events: {
    subscribe(input?: WorldEventSubscriptionInput): Promise<WorldEventSubscription>;
    unsubscribe(subscriptionId: string): Promise<void>;
    onEvent(callback: (event: WorldRealtimeEvent) => void): () => void;
  };
}

export interface AgentWorldRuntimeOptions {
  workspaceRoot?: string;
  autoResume?: boolean;
}

type ResolvedRoute = {
  agentIds: string[];
  inlineMentionBlocked: boolean;
  unknownMentions: string[];
  error?: string;
};

type SendingRowRestartAction = 'completed' | 'retry' | 'blocked';

const EVENT_NAME = 'world-event';

function nowIsoString() {
  return new Date().toISOString();
}

function normalizeMentionToken(value: string): string {
  return String(value || '')
    .trim()
    .replace(/[,:;.!?]+$/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function parseParagraphBeginningMention(line: string): string | null {
  const trimmed = line.trimStart();
  if (!trimmed) {
    return null;
  }

  const withoutGreetingPrefix = trimmed.replace(/^(?:hey|hi|hello|to)\s+/i, '');
  const directMatch = /^@([A-Za-z0-9][A-Za-z0-9_-]*)\b/.exec(withoutGreetingPrefix);
  if (!directMatch?.[1]) {
    return null;
  }

  let mention = directMatch[1];

  if (!mention.includes('-') && !mention.includes('_') && /^[A-Z]/.test(mention)) {
    const remainder = withoutGreetingPrefix.slice(directMatch[0].length);
    const nextWordMatch = /^\s+([A-Z][A-Za-z0-9_-]*)\b/.exec(remainder);
    if (nextWordMatch?.[1]) {
      mention += ` ${nextWordMatch[1]}`;
    }
  }

  return normalizeMentionToken(mention);
}

export function extractParagraphBeginningMentions(content: string): string[] {
  const mentions: string[] = [];

  for (const line of String(content || '').split(/\n/u)) {
    const mention = parseParagraphBeginningMention(line);
    if (mention) {
      mentions.push(mention);
    }
  }

  return mentions;
}

export function extractFirstInlineMention(content: string): string | null {
  const match = /@(\w+(?:[-_]\w+)*)/u.exec(String(content || ''));
  return match?.[1] ? normalizeMentionToken(match[1]) : null;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

function normalizeChatMessage(message: any, agentId?: string, chatId?: string): ChatMessage {
  return {
    ...message,
    role: String(message?.role ?? ''),
    content: String(message?.content ?? ''),
    ...(agentId ? { agentId } : {}),
    ...(chatId ? { chatId } : {}),
  };
}

export class AgentWorldRuntime implements AgentWorldApi {
  private eventEmitter = new EventEmitter();
  private eventLog: WorldRealtimeEvent[] = [];
  private subscriptions = new Map<string, (event: WorldRealtimeEvent) => void>();
  private processingChats = new Set<string>();
  private queueProcessingChats = new Set<string>();
  private blockedQueueChats = new Set<string>();
  private workspaceRoot: string;

  workspace: AgentWorldApi['workspace'];
  world: AgentWorldApi['world'];
  agents: AgentWorldApi['agents'];
  chats: AgentWorldApi['chats'];
  messages: AgentWorldApi['messages'];
  queue: AgentWorldApi['queue'];
  skills: AgentWorldApi['skills'];
  heartbeat: AgentWorldApi['heartbeat'];
  events: AgentWorldApi['events'];

  constructor(options: AgentWorldRuntimeOptions = {}) {
    this.workspaceRoot = configureWorkspaceRoot(options.workspaceRoot);

    this.workspace = {
      get: async () => ({ workspaceRoot: this.workspaceRoot, worldLoaded: true }),
      open: async (nextPath: string) => {
        this.workspaceRoot = configureWorkspaceRoot(nextPath);
        return { workspaceRoot: this.workspaceRoot, worldLoaded: true };
      },
      close: async () => {
        this.processingChats.clear();
      },
      loadWorld: async () => this.loadSnapshot(),
    };

    this.world = {
      get: async () => this.loadSnapshot(),
      update: async (patch: UpdateWorldInput) => {
        const updated = await updateWorldMetadata(patch);
        return updated as WorldInfo;
      },
      export: async () => this.loadSnapshot(),
    };

    this.agents = {
      list: async () => listAgentMetadata() as Promise<AgentInfo[]>,
      create: async (input: CreateAgentInput) => {
        const agent = await createAgentMetadata({
          agentId: String(input.agentId ?? input.id ?? '').trim(),
          name: typeof input.name === 'string' ? input.name : undefined,
          provider: typeof input.provider === 'string' ? input.provider : undefined,
          model: typeof input.model === 'string' ? input.model : undefined,
          setDefault: input.setDefault === true,
        }) as AgentInfo;
        this.emit({ type: 'agent_created', agentId: agent.id, createdAt: nowIsoString() });
        return agent;
      },
      update: async (agentId: string, patch: UpdateAgentInput) => {
        const agent = await updateAgentMetadata(agentId, patch) as AgentInfo;
        this.emit({ type: 'agent_updated', agentId: agent.id, createdAt: nowIsoString() });
        return agent;
      },
      delete: async (agentId: string) => {
        await deleteAgentMetadata(agentId);
        this.emit({ type: 'agent_deleted', agentId, createdAt: nowIsoString() });
        return { agentId, deleted: true };
      },
      import: async () => {
        throw new Error('Agent import is not implemented in the lean world runtime.');
      },
    };

    this.chats = {
      list: async () => listPersistedChats() as Promise<ChatSummary[]>,
      create: async () => {
        const chat = await createPersistedChat();
        const summary = this.summarizeChat(chat);
        this.emit({ type: 'chat_created', chatId: chat.id, createdAt: nowIsoString() });
        return { chatId: chat.id, chat: summary };
      },
      select: async (chatId: string) => {
        const chat = await setCurrentChat(chatId);
        const summary = this.summarizeChat(chat);
        this.emit({ type: 'chat_selected', chatId: chat.id, createdAt: nowIsoString() });
        return { chatId: chat.id, chat: summary };
      },
      branchFromMessage: async () => {
        throw new Error('Chat branching is not implemented in the lean world runtime.');
      },
      delete: async (chatId: string) => {
        const deleted = await deletePersistedChat(chatId);
        this.emit({ type: 'chat_deleted', chatId, createdAt: nowIsoString() });
        return { chatId: deleted.chatId, deleted: true };
      },
      current: async () => {
        const snapshot = await this.loadSnapshot();
        return snapshot.chats.find((chat) => chat.id === snapshot.currentChatId) ?? null;
      },
    };

    this.messages = {
      list: async (chatId?: string) => {
        const targetChatId = await this.resolveChatId(chatId);
        const messages = await loadAgentMemory({ chatId: targetChatId });
        if (messages.length > 0) {
          return messages as ChatMessage[];
        }
        return (await loadChatById(targetChatId)).messages as ChatMessage[];
      },
      send: async (input: SendMessageInput) => this.sendMessage(input),
      edit: async () => {
        throw new Error('Message edit is not implemented in the lean world runtime.');
      },
      deleteFrom: async () => {
        throw new Error('Message delete-from is not implemented in the lean world runtime.');
      },
      stop: async (chatId?: string) => {
        const targetChatId = await this.resolveChatId(chatId);
        await stopQueuedMessages(targetChatId);
        this.blockedQueueChats.delete(targetChatId);
        this.emit({ type: 'queue_stopped', chatId: targetChatId, createdAt: nowIsoString() });
        return { chatId: targetChatId, stopped: true };
      },
      events: async (chatId?: string) => {
        const normalizedChatId = String(chatId ?? '').trim();
        return normalizedChatId
          ? this.eventLog.filter((event) => 'chatId' in event && event.chatId === normalizedChatId)
          : [...this.eventLog];
      },
    };

    this.queue = {
      list: async (chatId?: string) => listQueuedMessages({ chatId }) as Promise<QueuedMessage[]>,
      add: async (content: string, sender = 'human', chatId?: string) => {
        const targetChatId = await this.resolveChatId(chatId);
        const row = await addQueuedMessage({ chatId: targetChatId, content, sender }) as QueuedMessage;
        this.emit({ type: 'queue_added', chatId: targetChatId, queueMessage: row, createdAt: nowIsoString() });
        void this.processQueue(targetChatId);
        return row;
      },
      remove: async (messageId: string) => {
        const rows = await listQueuedMessages();
        const row = rows.find((candidate: any) => candidate.messageId === messageId) as QueuedMessage | undefined;
        await removeQueuedMessage(messageId);
        if (row) {
          this.blockedQueueChats.delete(row.chatId);
        }
        this.emit({
          type: 'queue_removed',
          chatId: row?.chatId ?? '',
          ...(row ? { queueMessage: row } : {}),
          createdAt: nowIsoString(),
        });
      },
      clear: async (chatId?: string) => {
        const targetChatId = await this.resolveChatId(chatId);
        await clearQueuedMessages(targetChatId);
        this.blockedQueueChats.delete(targetChatId);
        this.emit({ type: 'queue_cleared', chatId: targetChatId, createdAt: nowIsoString() });
      },
      pause: async (chatId?: string) => {
        const targetChatId = await this.resolveChatId(chatId);
        await setQueuePaused(targetChatId, true);
        this.emit({ type: 'queue_paused', chatId: targetChatId, createdAt: nowIsoString() });
      },
      resume: async (chatId?: string) => {
        const targetChatId = await this.resolveChatId(chatId);
        await setQueuePaused(targetChatId, false);
        this.emit({ type: 'queue_resumed', chatId: targetChatId, createdAt: nowIsoString() });
        void this.processQueue(targetChatId);
      },
      stop: async (chatId?: string) => {
        const targetChatId = await this.resolveChatId(chatId);
        await stopQueuedMessages(targetChatId);
        this.blockedQueueChats.delete(targetChatId);
        this.emit({ type: 'queue_stopped', chatId: targetChatId, createdAt: nowIsoString() });
      },
      retry: async (messageId: string, chatId?: string) => {
        const row = await updateQueuedMessage(messageId, {
          status: 'queued',
          retryCount: 0,
        }) as QueuedMessage;
        this.blockedQueueChats.delete(row.chatId);
        this.emit({ type: 'queue_updated', chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
        void this.processQueue(chatId ?? row.chatId);
        return row;
      },
    };

    this.skills = {
      list: async () => loadSkillInventory() as Promise<SkillSummary[]>,
      listGitHub: async () => [],
      listLocal: async () => [],
      import: async () => {
        throw new Error('Skill import is not implemented in the lean world runtime.');
      },
      previewImport: async () => null,
      read: async () => {
        throw new Error('Skill read is not implemented in the lean world runtime.');
      },
      write: async () => {
        throw new Error('Skill write is not implemented in the lean world runtime.');
      },
      tree: async () => [],
      delete: async () => {},
    };

    this.heartbeat = {
      list: async () => [],
      run: async () => ({ ran: false }),
      pause: async () => {},
      stop: async () => {},
    };

    this.events = {
      subscribe: async (input: WorldEventSubscriptionInput = {}) => {
        const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const types = new Set((input.types ?? []).map((type) => String(type)));
        const chatId = String(input.chatId ?? '').trim();
        const listener = (event: WorldRealtimeEvent) => {
          if (types.size > 0 && !types.has(event.type)) {
            return;
          }
          if (chatId && (!('chatId' in event) || event.chatId !== chatId)) {
            return;
          }
        };
        this.eventEmitter.on(EVENT_NAME, listener);
        this.subscriptions.set(subscriptionId, listener);
        return { subscriptionId };
      },
      unsubscribe: async (subscriptionId: string) => {
        const listener = this.subscriptions.get(subscriptionId);
        if (!listener) {
          return;
        }
        this.eventEmitter.off(EVENT_NAME, listener);
        this.subscriptions.delete(subscriptionId);
      },
      onEvent: (callback: (event: WorldRealtimeEvent) => void) => {
        this.eventEmitter.on(EVENT_NAME, callback);
        return () => this.eventEmitter.off(EVENT_NAME, callback);
      },
    };

    if (options.autoResume !== false) {
      void this.resumeDurableQueues();
    }
  }

  private emit(event: WorldRealtimeEvent) {
    this.eventLog.push(event);
    this.eventEmitter.emit(EVENT_NAME, event);
  }

  private async loadSnapshot(): Promise<WorldSnapshot> {
    return await loadWorldSnapshot() as WorldSnapshot;
  }

  private summarizeChat(chat: any): ChatSummary {
    return {
      id: String(chat.id ?? ''),
      createdAt: String(chat.createdAt ?? ''),
      updatedAt: String(chat.updatedAt ?? ''),
      messageCount: Array.isArray(chat.messages) ? chat.messages.length : Number(chat.messageCount ?? 0),
    };
  }

  private async resolveChatId(chatId?: string): Promise<string> {
    const normalizedChatId = String(chatId ?? '').trim();
    if (normalizedChatId) {
      return normalizedChatId;
    }

    const snapshot = await this.loadSnapshot();
    if (snapshot.currentChatId) {
      return snapshot.currentChatId;
    }

    const chat = await createPersistedChat();
    this.emit({ type: 'chat_created', chatId: chat.id, createdAt: nowIsoString() });
    return chat.id;
  }

  private resolveAgentByMention(agents: AgentInfo[], mention: string): AgentInfo | null {
    const normalizedMention = normalizeMentionToken(mention);
    return agents.find((agent) => {
      const agentId = normalizeMentionToken(String(agent.id ?? ''));
      const agentName = normalizeMentionToken(String(agent.name ?? ''));
      return agentId === normalizedMention || agentName === normalizedMention;
    }) ?? null;
  }

  private resolveSenderAgent(agents: AgentInfo[], sender: string): AgentInfo | null {
    const normalizedSender = normalizeMentionToken(sender);
    if (!normalizedSender || ['human', 'user', 'world'].includes(normalizedSender)) {
      return null;
    }

    return this.resolveAgentByMention(agents, normalizedSender);
  }

  private async resolveRoutes(content: string, explicitAgentId?: string, sender = 'human'): Promise<ResolvedRoute> {
    const snapshot = await this.loadSnapshot();
    const agents = snapshot.agents;
    const senderAgent = this.resolveSenderAgent(agents, sender);

    if (explicitAgentId) {
      const agent = this.resolveAgentByMention(agents, explicitAgentId);
      return agent
        ? { agentIds: [agent.id], inlineMentionBlocked: false, unknownMentions: [] }
        : { agentIds: [], inlineMentionBlocked: false, unknownMentions: [explicitAgentId] };
    }

    const paragraphMentions = dedupe(extractParagraphBeginningMentions(content));
    if (paragraphMentions.length > 0) {
      const agentIds: string[] = [];
      const unknownMentions: string[] = [];
      for (const mention of paragraphMentions) {
        const agent = this.resolveAgentByMention(agents, mention);
        if (agent) {
          if (senderAgent?.id !== agent.id) {
            agentIds.push(agent.id);
          }
        } else {
          unknownMentions.push(mention);
        }
      }

      if (agentIds.length === 0 && unknownMentions.length === 0 && senderAgent) {
        return {
          agentIds: [],
          inlineMentionBlocked: false,
          unknownMentions: [],
          error: 'Agent self-messages do not trigger that same agent again.',
        };
      }

      return { agentIds: dedupe(agentIds), inlineMentionBlocked: false, unknownMentions };
    }

    const inlineMention = extractFirstInlineMention(content);
    if (inlineMention) {
      return { agentIds: [], inlineMentionBlocked: true, unknownMentions: [] };
    }

    if (senderAgent) {
      return {
        agentIds: [],
        inlineMentionBlocked: false,
        unknownMentions: [],
        error: 'Agent-originated messages require a paragraph-beginning @mention to route.',
      };
    }

    const mainAgent = typeof snapshot.mainAgent === 'string' ? snapshot.mainAgent : '';
    if (mainAgent) {
      const agent = this.resolveAgentByMention(agents, mainAgent);
      if (agent) {
        return { agentIds: [agent.id], inlineMentionBlocked: false, unknownMentions: [] };
      }
    }

    return {
      agentIds: [snapshot.defaultAgentId || 'default'],
      inlineMentionBlocked: false,
      unknownMentions: [],
    };
  }

  private async buildAgentContext(agentId: string, chatId: string) {
    const agentMemory = await loadAgentMemory({ agentId, chatId }) as ChatMessage[];
    if (agentMemory.length > 0) {
      return agentMemory.map((message) => normalizeChatMessage(message, agentId, chatId));
    }

    const chat = await loadChatById(chatId);
    return (chat.messages ?? []).map((message: any) => normalizeChatMessage(message, agentId, chatId));
  }

  private async buildRuntimeContextPrompt(agentId: string, chatId: string): Promise<string> {
    const snapshot = await this.loadSnapshot();
    return [
      'World runtime context:',
      `- worldId: ${snapshot.id}`,
      `- currentChatId: ${chatId}`,
      `- activeAgentId: ${agentId}`,
      `- defaultAgentId: ${snapshot.defaultAgentId}`,
      typeof snapshot.mainAgent === 'string' && snapshot.mainAgent
        ? `- mainAgent: ${snapshot.mainAgent}`
        : '',
      '- taskPlan: none persisted for this agent',
    ].filter(Boolean).join('\n');
  }

  private async executeForAgent(params: {
    agentId: string;
    chatId: string;
    content: string;
    sender: string;
    stream?: boolean;
  }) {
    const existingChat = await loadChatById(params.chatId).catch(async () => createPersistedChat());
    const contextMessages = await this.buildAgentContext(params.agentId, params.chatId);
    const agentConfig = await loadPersistedRuntimeConfig({ agentId: params.agentId });
    const builtInSystemPrompt = getBuiltInSystemPrompt();
    const workspaceSystemPrompt = await loadWorkspaceSystemPrompt();
    const runtimeContextPrompt = await this.buildRuntimeContextPrompt(params.agentId, params.chatId);
    const skillInventory = await loadSkillInventory();
    const pastMessages = Number(agentConfig.pastMessages);
    const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0
      ? pastMessages
      : 0;

    this.emit({
      type: 'run_started',
      chatId: params.chatId,
      agentId: params.agentId,
      createdAt: nowIsoString(),
    });

    const result = await runChatTurn({
      chat: {
        ...existingChat,
        messages: contextMessages,
      },
      userMessage: params.content,
      stream: params.stream !== false,
      historyMessageLimit,
      builtInSystemPrompt,
      workspaceSystemPrompt: [workspaceSystemPrompt, runtimeContextPrompt].filter(Boolean).join('\n\n'),
      skillInventory,
      agentConfig,
      onStreamChunk: (chunk) => {
        if (chunk.content) {
          this.emit({
            type: 'assistant_chunk',
            chatId: params.chatId,
            agentId: params.agentId,
            content: chunk.content,
            createdAt: nowIsoString(),
          });
        }
      },
      onToolCall: (toolCall) => {
        this.emit({
          type: 'tool_call',
          chatId: params.chatId,
          agentId: params.agentId,
          toolCall,
          createdAt: nowIsoString(),
        });
      },
      onToolResult: (toolResult) => {
        this.emit({
          type: 'tool_result',
          chatId: params.chatId,
          agentId: params.agentId,
          toolResult,
          createdAt: nowIsoString(),
        });
      },
    });
    const previousLength = contextMessages.length;
    const newMessages = result.messages.slice(previousLength);

    await persistCompletedChat({
      chat: {
        id: params.chatId,
        createdAt: existingChat.createdAt,
        updatedAt: new Date().toISOString(),
      },
      messages: result.messages,
      agentId: params.agentId,
    });
    await appendAgentMemory({
      agentId: params.agentId,
      chatId: params.chatId,
      messages: newMessages,
    });

    for (const message of newMessages) {
      this.emit({
        type: 'message',
        chatId: params.chatId,
        agentId: params.agentId,
        message: normalizeChatMessage(message, params.agentId, params.chatId),
        createdAt: nowIsoString(),
      });
    }

    this.emit({
      type: 'run_completed',
      chatId: params.chatId,
      agentId: params.agentId,
      createdAt: nowIsoString(),
    });

    return result;
  }

  private async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const content = String(input.content ?? input.message ?? '').trim();
    if (!content) {
      throw new Error('Message content is required.');
    }

    const chatId = await this.resolveChatId(input.chatId);
    const sender = String(input.sender ?? 'human').trim() || 'human';

    if (input.queue === true || this.processingChats.has(chatId)) {
      const row = await addQueuedMessage({ chatId, content, sender }) as QueuedMessage;
      this.emit({ type: 'queue_added', chatId, queueMessage: row, createdAt: nowIsoString() });
      if (!this.processingChats.has(chatId)) {
        void this.processQueue(chatId);
      }
      return { chatId, agentIds: [], queued: true, queueMessage: row };
    }

    return await this.dispatchMessage({ chatId, content, sender, stream: input.stream, agentId: input.agentId });
  }

  private async dispatchMessage(params: {
    chatId: string;
    content: string;
    sender: string;
    stream?: boolean;
    agentId?: string;
  }): Promise<SendMessageResult> {
    const route = await this.resolveRoutes(params.content, params.agentId, params.sender);

    if (route.error) {
      this.emit({ type: 'queue_failed', chatId: params.chatId, error: route.error, createdAt: nowIsoString() });
      throw new Error(route.error);
    }

    if (route.inlineMentionBlocked) {
      const error = 'Inline @mentions do not route messages. Put the mention at the beginning of a paragraph.';
      this.emit({ type: 'queue_failed', chatId: params.chatId, error, createdAt: nowIsoString() });
      throw new Error(error);
    }

    if (route.unknownMentions.length > 0 || route.agentIds.length === 0) {
      const unknown = route.unknownMentions[0] ?? 'unknown';
      const error = `No agent "@${unknown}" found in this world.`;
      this.emit({ type: 'queue_failed', chatId: params.chatId, error, createdAt: nowIsoString() });
      throw new Error(error);
    }

    this.processingChats.add(params.chatId);
    const assistantTexts: string[] = [];
    let messages: ChatMessage[] = [];

    try {
      for (const agentId of route.agentIds) {
        const result = await this.executeForAgent({
          agentId,
          chatId: params.chatId,
          content: params.content,
          sender: params.sender,
          stream: params.stream,
        });
        assistantTexts.push(result.assistantText);
        messages = result.messages as ChatMessage[];
      }

      return {
        chatId: params.chatId,
        agentIds: route.agentIds,
        assistantText: assistantTexts.join('\n\n'),
        messages,
      };
    } catch (error) {
      const firstAgentId = route.agentIds[0] ?? 'default';
      this.emit({
        type: 'run_failed',
        chatId: params.chatId,
        agentId: firstAgentId,
        error: error instanceof Error ? error.message : String(error),
        createdAt: nowIsoString(),
      });
      throw error;
    } finally {
      this.processingChats.delete(params.chatId);
      await this.processQueue(params.chatId);
    }
  }

  private async processQueue(chatId: string) {
    const targetChatId = String(chatId || '').trim();
    if (
      !targetChatId
      || this.processingChats.has(targetChatId)
      || this.queueProcessingChats.has(targetChatId)
      || this.blockedQueueChats.has(targetChatId)
    ) {
      return;
    }

    this.queueProcessingChats.add(targetChatId);

    try {
      const queueState = await loadQueueState(targetChatId);
      if (queueState.paused) {
        return;
      }

      const nextRow = queueState.rows.find((row: QueuedMessage) => row.status === 'sending')
        ?? queueState.rows.find((row: QueuedMessage) => row.status === 'queued');
      if (!nextRow) {
        return;
      }

      let activeRow = nextRow as QueuedMessage;
      if (activeRow.status === 'queued') {
        activeRow = await updateQueuedMessage(activeRow.messageId, { status: 'sending' }) as QueuedMessage;
        this.emit({ type: 'queue_updated', chatId: targetChatId, queueMessage: activeRow, createdAt: nowIsoString() });
      }

      try {
        await this.dispatchMessage({
          chatId: targetChatId,
          content: activeRow.content,
          sender: activeRow.sender,
        });
        await removeQueuedMessage(activeRow.messageId);
        this.emit({ type: 'queue_removed', chatId: targetChatId, queueMessage: activeRow, createdAt: nowIsoString() });
      } catch (error) {
        const failedRow = await updateQueuedMessage(activeRow.messageId, {
          status: 'error',
          retryCount: Number(activeRow.retryCount ?? 0) + 1,
        }) as QueuedMessage;
        this.emit({
          type: 'queue_failed',
          chatId: targetChatId,
          queueMessage: failedRow,
          error: error instanceof Error ? error.message : String(error),
          createdAt: nowIsoString(),
        });
      }
    } finally {
      this.queueProcessingChats.delete(targetChatId);
      const nextState = await loadQueueState(targetChatId).catch(() => null);
      if (nextState && !nextState.paused && nextState.rows.some((row: QueuedMessage) => row.status === 'queued')) {
        void this.processQueue(targetChatId);
      }
    }
  }

  private async resumeDurableQueues() {
    const rows = await listQueuedMessages() as QueuedMessage[];
    const chatIds = dedupe(rows.map((row) => row.chatId));

    for (const row of rows) {
      if (row.status === 'sending') {
        const action = await this.resolveSendingRowRestartAction(row);
        if (action === 'completed') {
          await removeQueuedMessage(row.messageId);
          this.emit({ type: 'queue_removed', chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
        } else if (action === 'blocked') {
          this.blockedQueueChats.add(row.chatId);
          this.emit({ type: 'queue_updated', chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
        } else {
          const recovered = await updateQueuedMessage(row.messageId, { status: 'queued' }) as QueuedMessage;
          this.blockedQueueChats.delete(row.chatId);
          this.emit({ type: 'queue_updated', chatId: row.chatId, queueMessage: recovered, createdAt: nowIsoString() });
        }
      }
    }

    for (const chatId of chatIds) {
      if (!this.blockedQueueChats.has(chatId)) {
        void this.processQueue(chatId);
      }
    }
  }

  private async resolveSendingRowRestartAction(row: QueuedMessage): Promise<SendingRowRestartAction> {
    try {
      const chat = await loadChatById(row.chatId);
      const messages = Array.isArray(chat.messages) ? chat.messages : [];
      const userMessageIndex = messages.findIndex((message: any) =>
        String(message?.role ?? '') === 'user'
        && String(message?.content ?? '') === row.content
      );

      if (userMessageIndex < 0) {
        return 'retry';
      }

      const afterUser = messages.slice(userMessageIndex + 1);
      const assistantMessageIndex = afterUser.findIndex((message: any) =>
        String(message?.role ?? '') === 'assistant'
      );

      if (assistantMessageIndex < 0) {
        return 'retry';
      }

      const assistantMessage = afterUser[assistantMessageIndex];
      const toolCallIds = Array.isArray(assistantMessage?.tool_calls)
        ? assistantMessage.tool_calls
          .map((toolCall: any) => String(toolCall?.id ?? '').trim())
          .filter(Boolean)
        : [];

      if (toolCallIds.length === 0) {
        return 'completed';
      }

      const answeredToolCallIds = new Set(
        afterUser
          .slice(assistantMessageIndex + 1)
          .filter((message: any) => String(message?.role ?? '') === 'tool')
          .map((message: any) => String(message?.tool_call_id ?? '').trim())
          .filter(Boolean),
      );

      return toolCallIds.every((toolCallId: string) => answeredToolCallIds.has(toolCallId))
        ? 'completed'
        : 'blocked';
    } catch {
      return 'retry';
    }
  }
}

export function createAgentWorldRuntime(options: AgentWorldRuntimeOptions = {}): AgentWorldRuntime {
  return new AgentWorldRuntime(options);
}

export default createAgentWorldRuntime;
