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
 * - 2026-05-23: Moved from CLI source into core while keeping HITL UI in shell layers.
 * - 2026-05-23: Made queue API add enqueue-only so CLI queued sends do not auto-dispatch.
 * - 2026-05-23: Implemented the world API runtime, event emitter, mention routing, agent memory, and queue dispatch.
 */
import { EventEmitter } from 'node:events';
import { loadPersistedRuntimeConfig } from './agent-config.js';
import { getBuiltInSystemPrompt, loadSkillInventory, loadWorkspaceSystemPrompt, } from './agent-files.js';
import { configureWorkspaceRoot } from './paths.js';
import { runChatTurn } from './runtime-client.js';
import { addQueuedMessage, appendAgentMemory, clearQueuedMessages, createAgentMetadata, createPersistedChat, deleteAgentMetadata, deletePersistedChat, listAgentMetadata, listPersistedChats, listQueuedMessages, loadAgentMemory, loadChatById, loadQueueState, loadWorldSnapshot, persistCompletedChat, removeQueuedMessage, replaceAgentMemory, setCurrentChat, setQueuePaused, stopQueuedMessages, updateAgentMetadata, updateQueuedMessage, updateWorldMetadata, } from './world-store.js';
const EVENT_NAME = 'world-event';
function nowIsoString() {
    return new Date().toISOString();
}
function normalizeMentionToken(value) {
    return String(value || '')
        .trim()
        .replace(/[,:;.!?]+$/g, '')
        .replace(/\s+/g, '-')
        .toLowerCase();
}
function parseParagraphBeginningMention(line) {
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
export function extractParagraphBeginningMentions(content) {
    const mentions = [];
    for (const line of String(content || '').split(/\n/u)) {
        const mention = parseParagraphBeginningMention(line);
        if (mention) {
            mentions.push(mention);
        }
    }
    return mentions;
}
export function extractFirstInlineMention(content) {
    const match = /@(\w+(?:[-_]\w+)*)/u.exec(String(content || ''));
    return match?.[1] ? normalizeMentionToken(match[1]) : null;
}
function dedupe(values) {
    const seen = new Set();
    const result = [];
    for (const value of values) {
        if (!value || seen.has(value)) {
            continue;
        }
        seen.add(value);
        result.push(value);
    }
    return result;
}
function normalizeChatMessage(message, agentId, chatId) {
    return {
        ...message,
        role: String(message?.role ?? ''),
        content: String(message?.content ?? ''),
        ...(agentId ? { agentId } : {}),
        ...(chatId ? { chatId } : {}),
    };
}
export class AgentWorldRuntime {
    eventEmitter = new EventEmitter();
    eventLog = [];
    subscriptions = new Map();
    processingChats = new Set();
    queueProcessingChats = new Set();
    blockedQueueChats = new Set();
    workspaceRoot;
    handleToolCall;
    workspace;
    world;
    agents;
    chats;
    messages;
    queue;
    skills;
    heartbeat;
    events;
    constructor(options = {}) {
        this.workspaceRoot = configureWorkspaceRoot(options.workspaceRoot);
        this.handleToolCall = options.handleToolCall;
        this.workspace = {
            get: async () => ({ workspaceRoot: this.workspaceRoot, worldLoaded: true }),
            open: async (nextPath) => {
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
            update: async (patch) => {
                const updated = await updateWorldMetadata(patch);
                return updated;
            },
            export: async () => this.loadSnapshot(),
        };
        this.agents = {
            list: async () => listAgentMetadata(),
            create: async (input) => {
                const agent = await createAgentMetadata({
                    agentId: String(input.agentId ?? input.id ?? '').trim(),
                    name: typeof input.name === 'string' ? input.name : undefined,
                    provider: typeof input.provider === 'string' ? input.provider : undefined,
                    model: typeof input.model === 'string' ? input.model : undefined,
                    setDefault: input.setDefault === true,
                });
                this.emit({ type: 'agent_created', agentId: agent.id, createdAt: nowIsoString() });
                return agent;
            },
            update: async (agentId, patch) => {
                const agent = await updateAgentMetadata(agentId, patch);
                this.emit({ type: 'agent_updated', agentId: agent.id, createdAt: nowIsoString() });
                return agent;
            },
            delete: async (agentId) => {
                await deleteAgentMetadata(agentId);
                this.emit({ type: 'agent_deleted', agentId, createdAt: nowIsoString() });
                return { agentId, deleted: true };
            },
            import: async () => {
                throw new Error('Agent import is not implemented in the lean world runtime.');
            },
        };
        this.chats = {
            list: async () => listPersistedChats(),
            create: async () => {
                const chat = await createPersistedChat();
                const summary = this.summarizeChat(chat);
                this.emit({ type: 'chat_created', chatId: chat.id, createdAt: nowIsoString() });
                return { chatId: chat.id, chat: summary };
            },
            select: async (chatId) => {
                const chat = await setCurrentChat(chatId);
                const summary = this.summarizeChat(chat);
                this.emit({ type: 'chat_selected', chatId: chat.id, createdAt: nowIsoString() });
                return { chatId: chat.id, chat: summary };
            },
            branchFromMessage: async () => {
                throw new Error('Chat branching is not implemented in the lean world runtime.');
            },
            delete: async (chatId) => {
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
            list: async (chatId) => {
                const targetChatId = await this.resolveChatId(chatId);
                const messages = await loadAgentMemory({ chatId: targetChatId });
                if (messages.length > 0) {
                    return messages;
                }
                return (await loadChatById(targetChatId)).messages;
            },
            send: async (input) => this.sendMessage(input),
            edit: async (chatId, messageId, content) => this.editMessage(chatId, messageId, content),
            deleteFrom: async (chatId, messageId) => this.deleteMessageChain(chatId, messageId),
            stop: async (chatId) => {
                const targetChatId = await this.resolveChatId(chatId);
                await stopQueuedMessages(targetChatId);
                this.blockedQueueChats.delete(targetChatId);
                this.emit({ type: 'queue_stopped', chatId: targetChatId, createdAt: nowIsoString() });
                return { chatId: targetChatId, stopped: true };
            },
            events: async (chatId) => {
                const normalizedChatId = String(chatId ?? '').trim();
                return normalizedChatId
                    ? this.eventLog.filter((event) => 'chatId' in event && event.chatId === normalizedChatId)
                    : [...this.eventLog];
            },
        };
        this.queue = {
            list: async (chatId) => listQueuedMessages({ chatId }),
            add: async (content, sender = 'human', chatId) => {
                const targetChatId = await this.resolveChatId(chatId);
                const row = await addQueuedMessage({ chatId: targetChatId, content, sender });
                this.emit({ type: 'queue_added', chatId: targetChatId, queueMessage: row, createdAt: nowIsoString() });
                return row;
            },
            remove: async (messageId) => {
                const rows = await listQueuedMessages();
                const row = rows.find((candidate) => candidate.messageId === messageId);
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
            clear: async (chatId) => {
                const targetChatId = await this.resolveChatId(chatId);
                await clearQueuedMessages(targetChatId);
                this.blockedQueueChats.delete(targetChatId);
                this.emit({ type: 'queue_cleared', chatId: targetChatId, createdAt: nowIsoString() });
            },
            pause: async (chatId) => {
                const targetChatId = await this.resolveChatId(chatId);
                await setQueuePaused(targetChatId, true);
                this.emit({ type: 'queue_paused', chatId: targetChatId, createdAt: nowIsoString() });
            },
            resume: async (chatId) => {
                const targetChatId = await this.resolveChatId(chatId);
                await setQueuePaused(targetChatId, false);
                this.emit({ type: 'queue_resumed', chatId: targetChatId, createdAt: nowIsoString() });
                void this.processQueue(targetChatId);
            },
            stop: async (chatId) => {
                const targetChatId = await this.resolveChatId(chatId);
                await stopQueuedMessages(targetChatId);
                this.blockedQueueChats.delete(targetChatId);
                this.emit({ type: 'queue_stopped', chatId: targetChatId, createdAt: nowIsoString() });
            },
            retry: async (messageId, chatId) => {
                const row = await updateQueuedMessage(messageId, {
                    status: 'queued',
                    retryCount: 0,
                });
                this.blockedQueueChats.delete(row.chatId);
                this.emit({ type: 'queue_updated', chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
                void this.processQueue(chatId ?? row.chatId);
                return row;
            },
        };
        this.skills = {
            list: async () => loadSkillInventory(),
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
            delete: async () => { },
        };
        this.heartbeat = {
            list: async () => [],
            run: async () => ({ ran: false }),
            pause: async () => { },
            stop: async () => { },
        };
        this.events = {
            subscribe: async (input = {}) => {
                const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const types = new Set((input.types ?? []).map((type) => String(type)));
                const chatId = String(input.chatId ?? '').trim();
                const listener = (event) => {
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
            unsubscribe: async (subscriptionId) => {
                const listener = this.subscriptions.get(subscriptionId);
                if (!listener) {
                    return;
                }
                this.eventEmitter.off(EVENT_NAME, listener);
                this.subscriptions.delete(subscriptionId);
            },
            onEvent: (callback) => {
                this.eventEmitter.on(EVENT_NAME, callback);
                return () => this.eventEmitter.off(EVENT_NAME, callback);
            },
        };
        if (options.autoResume !== false) {
            void this.resumeDurableQueues();
        }
    }
    emit(event) {
        this.eventLog.push(event);
        this.eventEmitter.emit(EVENT_NAME, event);
    }
    setToolCallHandler(handler) {
        this.handleToolCall = handler;
    }
    async loadSnapshot() {
        return await loadWorldSnapshot();
    }
    summarizeChat(chat) {
        return {
            id: String(chat.id ?? ''),
            createdAt: String(chat.createdAt ?? ''),
            updatedAt: String(chat.updatedAt ?? ''),
            messageCount: Array.isArray(chat.messages) ? chat.messages.length : Number(chat.messageCount ?? 0),
        };
    }
    async resolveChatId(chatId) {
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
    resolveAgentByMention(agents, mention) {
        const normalizedMention = normalizeMentionToken(mention);
        return agents.find((agent) => {
            const agentId = normalizeMentionToken(String(agent.id ?? ''));
            const agentName = normalizeMentionToken(String(agent.name ?? ''));
            return agentId === normalizedMention || agentName === normalizedMention;
        }) ?? null;
    }
    resolveSenderAgent(agents, sender) {
        const normalizedSender = normalizeMentionToken(sender);
        if (!normalizedSender || ['human', 'user', 'world'].includes(normalizedSender)) {
            return null;
        }
        return this.resolveAgentByMention(agents, normalizedSender);
    }
    async resolveRoutes(content, explicitAgentId, sender = 'human') {
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
            const agentIds = [];
            const unknownMentions = [];
            for (const mention of paragraphMentions) {
                const agent = this.resolveAgentByMention(agents, mention);
                if (agent) {
                    if (senderAgent?.id !== agent.id) {
                        agentIds.push(agent.id);
                    }
                }
                else {
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
    async buildAgentContext(agentId, chatId) {
        const agentMemory = await loadAgentMemory({ agentId, chatId });
        if (agentMemory.length > 0) {
            return agentMemory.map((message) => normalizeChatMessage(message, agentId, chatId));
        }
        const chat = await loadChatById(chatId);
        return (chat.messages ?? []).map((message) => normalizeChatMessage(message, agentId, chatId));
    }
    async buildRuntimeContextPrompt(agentId, chatId) {
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
    async replaceChatMemory(chatId, messages) {
        const agentIds = dedupe(messages
            .map((message) => String(message.agentId ?? '').trim())
            .filter(Boolean));
        const snapshot = await this.loadSnapshot();
        const fallbackAgentId = String(snapshot.defaultAgentId ?? 'default').trim() || 'default';
        const targetAgentIds = agentIds.length > 0 ? agentIds : [fallbackAgentId];
        for (const agentId of targetAgentIds) {
            await replaceAgentMemory({
                agentId,
                chatId,
                messages: messages.filter((message) => String(message.agentId ?? agentId) === agentId),
            });
        }
        const existingChat = await loadChatById(chatId).catch(() => ({ id: chatId, messages: [] }));
        await persistCompletedChat({
            chat: {
                id: chatId,
                createdAt: existingChat.createdAt,
                updatedAt: new Date().toISOString(),
            },
            messages,
            setCurrent: false,
        });
    }
    async truncateChatAtMessage(chatId, messageId) {
        const targetChatId = await this.resolveChatId(chatId);
        const normalizedMessageId = String(messageId ?? '').trim();
        if (!normalizedMessageId) {
            throw new Error('Missing message ID.');
        }
        const messages = await loadAgentMemory({ chatId: targetChatId });
        const targetIndex = messages.findIndex((message) => String(message.messageId ?? '') === normalizedMessageId);
        if (targetIndex < 0) {
            throw new Error(`Missing message: ${normalizedMessageId}`);
        }
        const targetMessage = messages[targetIndex];
        if (String(targetMessage.role ?? '') !== 'user') {
            throw new Error('Only user message chains can be edited or deleted.');
        }
        const retainedMessages = messages.slice(0, targetIndex);
        await this.replaceChatMemory(targetChatId, retainedMessages);
        return {
            chatId: targetChatId,
            messageId: normalizedMessageId,
            retainedMessages,
            removedMessages: messages.slice(targetIndex),
            targetMessage,
        };
    }
    async editMessage(chatId, messageId, content) {
        const normalizedContent = String(content ?? '').trim();
        if (!normalizedContent) {
            throw new Error('Missing message content.');
        }
        const truncated = await this.truncateChatAtMessage(chatId, messageId);
        this.emit({
            type: 'message_edited',
            chatId: truncated.chatId,
            messageId: truncated.messageId,
            createdAt: nowIsoString(),
        });
        const result = await this.dispatchMessage({
            chatId: truncated.chatId,
            content: normalizedContent,
            sender: String(truncated.targetMessage.sender ?? 'human'),
        });
        return {
            ...result,
            edited: true,
            messageId: truncated.messageId,
            removedCount: truncated.removedMessages.length,
        };
    }
    async deleteMessageChain(chatId, messageId) {
        const truncated = await this.truncateChatAtMessage(chatId, messageId);
        this.emit({
            type: 'message_deleted',
            chatId: truncated.chatId,
            messageId: truncated.messageId,
            createdAt: nowIsoString(),
        });
        return {
            chatId: truncated.chatId,
            messageId: truncated.messageId,
            deleted: true,
            removedCount: truncated.removedMessages.length,
            messages: truncated.retainedMessages,
        };
    }
    async executeForAgent(params) {
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
            ...(this.handleToolCall ? { handleToolCall: this.handleToolCall } : {}),
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
    async sendMessage(input) {
        const content = String(input.content ?? input.message ?? '').trim();
        if (!content) {
            throw new Error('Message content is required.');
        }
        const chatId = await this.resolveChatId(input.chatId);
        const sender = String(input.sender ?? 'human').trim() || 'human';
        if (input.queue === true || this.processingChats.has(chatId)) {
            const row = await addQueuedMessage({ chatId, content, sender });
            this.emit({ type: 'queue_added', chatId, queueMessage: row, createdAt: nowIsoString() });
            if (!this.processingChats.has(chatId)) {
                void this.processQueue(chatId);
            }
            return { chatId, agentIds: [], queued: true, queueMessage: row };
        }
        return await this.dispatchMessage({ chatId, content, sender, stream: input.stream, agentId: input.agentId });
    }
    async dispatchMessage(params) {
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
        const assistantTexts = [];
        let messages = [];
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
                messages = result.messages;
            }
            return {
                chatId: params.chatId,
                agentIds: route.agentIds,
                assistantText: assistantTexts.join('\n\n'),
                messages,
            };
        }
        catch (error) {
            const firstAgentId = route.agentIds[0] ?? 'default';
            this.emit({
                type: 'run_failed',
                chatId: params.chatId,
                agentId: firstAgentId,
                error: error instanceof Error ? error.message : String(error),
                createdAt: nowIsoString(),
            });
            throw error;
        }
        finally {
            this.processingChats.delete(params.chatId);
            await this.processQueue(params.chatId);
        }
    }
    async processQueue(chatId) {
        const targetChatId = String(chatId || '').trim();
        if (!targetChatId
            || this.processingChats.has(targetChatId)
            || this.queueProcessingChats.has(targetChatId)
            || this.blockedQueueChats.has(targetChatId)) {
            return;
        }
        this.queueProcessingChats.add(targetChatId);
        try {
            const queueState = await loadQueueState(targetChatId);
            if (queueState.paused) {
                return;
            }
            const nextRow = queueState.rows.find((row) => row.status === 'sending')
                ?? queueState.rows.find((row) => row.status === 'queued');
            if (!nextRow) {
                return;
            }
            let activeRow = nextRow;
            if (activeRow.status === 'queued') {
                activeRow = await updateQueuedMessage(activeRow.messageId, { status: 'sending' });
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
            }
            catch (error) {
                const failedRow = await updateQueuedMessage(activeRow.messageId, {
                    status: 'error',
                    retryCount: Number(activeRow.retryCount ?? 0) + 1,
                });
                this.emit({
                    type: 'queue_failed',
                    chatId: targetChatId,
                    queueMessage: failedRow,
                    error: error instanceof Error ? error.message : String(error),
                    createdAt: nowIsoString(),
                });
            }
        }
        finally {
            this.queueProcessingChats.delete(targetChatId);
            const nextState = await loadQueueState(targetChatId).catch(() => null);
            if (nextState && !nextState.paused && nextState.rows.some((row) => row.status === 'queued')) {
                void this.processQueue(targetChatId);
            }
        }
    }
    async resumeDurableQueues() {
        const rows = await listQueuedMessages();
        const chatIds = dedupe(rows.map((row) => row.chatId));
        for (const row of rows) {
            if (row.status === 'sending') {
                const action = await this.resolveSendingRowRestartAction(row);
                if (action === 'completed') {
                    await removeQueuedMessage(row.messageId);
                    this.emit({ type: 'queue_removed', chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
                }
                else if (action === 'blocked') {
                    this.blockedQueueChats.add(row.chatId);
                    this.emit({ type: 'queue_updated', chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
                }
                else {
                    const recovered = await updateQueuedMessage(row.messageId, { status: 'queued' });
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
    async resolveSendingRowRestartAction(row) {
        try {
            const chat = await loadChatById(row.chatId);
            const messages = Array.isArray(chat.messages) ? chat.messages : [];
            const userMessageIndex = messages.findIndex((message) => String(message?.role ?? '') === 'user'
                && String(message?.content ?? '') === row.content);
            if (userMessageIndex < 0) {
                return 'retry';
            }
            const afterUser = messages.slice(userMessageIndex + 1);
            const assistantMessageIndex = afterUser.findIndex((message) => String(message?.role ?? '') === 'assistant');
            if (assistantMessageIndex < 0) {
                return 'retry';
            }
            const assistantMessage = afterUser[assistantMessageIndex];
            const toolCallIds = Array.isArray(assistantMessage?.tool_calls)
                ? assistantMessage.tool_calls
                    .map((toolCall) => String(toolCall?.id ?? '').trim())
                    .filter(Boolean)
                : [];
            if (toolCallIds.length === 0) {
                return 'completed';
            }
            const answeredToolCallIds = new Set(afterUser
                .slice(assistantMessageIndex + 1)
                .filter((message) => String(message?.role ?? '') === 'tool')
                .map((message) => String(message?.tool_call_id ?? '').trim())
                .filter(Boolean));
            return toolCallIds.every((toolCallId) => answeredToolCallIds.has(toolCallId))
                ? 'completed'
                : 'blocked';
        }
        catch {
            return 'retry';
        }
    }
}
export function createAgentWorldRuntime(options = {}) {
    return new AgentWorldRuntime(options);
}
export default createAgentWorldRuntime;
