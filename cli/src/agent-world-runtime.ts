export type WorkspaceState = Record<string, unknown>;
export type WorldSnapshot = Record<string, unknown>;
export type WorldInfo = Record<string, unknown>;
export type UpdateWorldInput = Record<string, unknown>;
export type ExportWorldInput = Record<string, unknown>;
export type WorldExportResult = Record<string, unknown>;
export type AgentInfo = Record<string, unknown>;
export type CreateAgentInput = Record<string, unknown>;
export type UpdateAgentInput = Record<string, unknown>;
export type ImportAgentInput = Record<string, unknown>;
export type AgentImportResult = Record<string, unknown>;
export type ChatSummary = Record<string, unknown>;
export type ChatCreateResult = Record<string, unknown>;
export type ChatActivation = Record<string, unknown>;
export type ChatDeleteResult = Record<string, unknown>;
export type ChatMessage = Record<string, unknown>;
export type SendMessageInput = Record<string, unknown>;
export type SendMessageResult = Record<string, unknown>;
export type MessageMutationResult = Record<string, unknown>;
export type StopMessageResult = Record<string, unknown>;
export type WorldEvent = Record<string, unknown>;
export type QueuedMessage = Record<string, unknown>;
export type SkillListInput = Record<string, unknown>;
export type SkillSummary = Record<string, unknown>;
export type LocalSkillSummary = Record<string, unknown>;
export type ImportSkillInput = Record<string, unknown>;
export type SkillImportResult = Record<string, unknown>;
export type SkillImportPreview = Record<string, unknown>;
export type FileTreeEntry = Record<string, unknown>;
export type HeartbeatJobStatus = Record<string, unknown>;
export type HeartbeatRunResult = Record<string, unknown>;
export type WorldEventSubscriptionInput = Record<string, unknown>;
export type WorldEventSubscription = Record<string, unknown>;
export type WorldRealtimeEvent = Record<string, unknown>;

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
