#!/usr/bin/env node

// cli/src/agent-world-cli.ts
import path5 from "node:path";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// core/agent-world-runtime.ts
import { EventEmitter } from "node:events";

// core/agent-config.ts
import { promises as fs } from "node:fs";

// core/paths.ts
import path from "node:path";
var WORKSPACE_ROOT_ENV_KEY = "AGENT_CLI_WORKSPACE";
var LEGACY_PROJECT_ROOT_ENV_KEY = "AGENT_CLI_ROOT";
function resolveWorkspaceRoot(workspaceRoot) {
  const configuredRoot = [
    workspaceRoot,
    process.env[WORKSPACE_ROOT_ENV_KEY],
    process.env[LEGACY_PROJECT_ROOT_ENV_KEY]
  ].map((value) => String(value ?? "").trim()).find((value) => value.length > 0) ?? "";
  return configuredRoot ? path.resolve(configuredRoot) : process.cwd();
}
var WORKSPACE_ROOT = "";
var REPO_ROOT = "";
var SYSTEM_PROMPT_PATH = "";
var ROOT_RUNTIME_CONFIG_PATH = "";
var SKILLS_ROOT = "";
var AGENT_WORLD_ROOT = "";
var WORLD_STATE_PATH = "";
var AGENT_WORLD_CHATS_ROOT = "";
var AGENT_WORLD_AGENTS_ROOT = "";
var AGENT_WORLD_QUEUES_ROOT = "";
var REMOTE_HOST_LOCK_PATH = "";
function configureWorkspaceRoot(workspaceRoot) {
  WORKSPACE_ROOT = resolveWorkspaceRoot(workspaceRoot);
  REPO_ROOT = WORKSPACE_ROOT;
  SYSTEM_PROMPT_PATH = path.join(WORKSPACE_ROOT, "AGENTS.md");
  ROOT_RUNTIME_CONFIG_PATH = path.join(WORKSPACE_ROOT, "runtime.json");
  AGENT_WORLD_ROOT = path.join(WORKSPACE_ROOT, ".agent-world");
  SKILLS_ROOT = path.join(AGENT_WORLD_ROOT, "skills");
  WORLD_STATE_PATH = path.join(AGENT_WORLD_ROOT, "world.json");
  AGENT_WORLD_CHATS_ROOT = path.join(AGENT_WORLD_ROOT, "chats");
  AGENT_WORLD_AGENTS_ROOT = path.join(AGENT_WORLD_ROOT, "agents");
  AGENT_WORLD_QUEUES_ROOT = path.join(AGENT_WORLD_ROOT, "queues");
  REMOTE_HOST_LOCK_PATH = path.join(AGENT_WORLD_ROOT, "remote-host.lock.json");
  return WORKSPACE_ROOT;
}
configureWorkspaceRoot();
function buildWorldChatDirectoryPath(chatId) {
  return path.join(AGENT_WORLD_CHATS_ROOT, chatId);
}
function buildWorldChatMetadataPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), "chat.json");
}
function buildWorldChatMessagesPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), "messages.jsonl");
}
function buildWorldChatSummaryPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), "summary.md");
}
function buildAgentDirectoryPath(agentId) {
  return path.join(AGENT_WORLD_AGENTS_ROOT, agentId);
}
function buildAgentMetadataPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "agent.json");
}
function buildAgentInboxPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "inbox.jsonl");
}
function buildAgentStatePath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "state.json");
}
function buildAgentEventsPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "events.jsonl");
}
function buildAgentMemoryPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "memory.md");
}
function buildAgentMemoryLogPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "memory.jsonl");
}
function buildAgentRuntimeConfigPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "runtime.json");
}
function buildWorldQueuePath(chatId) {
  return path.join(AGENT_WORLD_QUEUES_ROOT, `${chatId}.json`);
}

// core/agent-config.ts
var REASONING_EFFORTS = /* @__PURE__ */ new Set(["default", "none", "low", "medium", "high"]);
var TOOL_PERMISSIONS = /* @__PURE__ */ new Set(["auto", "ask", "read"]);
var WEB_SEARCH_CONTEXT_SIZES = /* @__PURE__ */ new Set(["low", "medium", "high"]);
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function readAliasedValue(source, keys) {
  for (const key of keys) {
    if (Object.hasOwn(source, key)) {
      return source[key];
    }
  }
  return void 0;
}
function normalizeString(value, label) {
  if (value === void 0 || value === null) {
    return void 0;
  }
  const normalized = String(value).trim();
  if (!normalized) {
    throw new Error(`Invalid agent config value for ${label}: expected a non-empty string.`);
  }
  return normalized;
}
function normalizeNumber(value, label) {
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) {
    throw new Error(`Invalid agent config value for ${label}: expected a number.`);
  }
  return normalized;
}
function normalizePositiveInteger(value, label) {
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1) {
    throw new Error(`Invalid agent config value for ${label}: expected a positive integer.`);
  }
  return normalized;
}
function normalizeNonNegativeInteger(value, label) {
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0) {
    throw new Error(`Invalid agent config value for ${label}: expected a non-negative integer.`);
  }
  return normalized;
}
function normalizeBoolean(value, label) {
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  throw new Error(`Invalid agent config value for ${label}: expected true or false.`);
}
function normalizeEnum(value, label, allowedValues) {
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  const normalized = String(value).trim().toLowerCase();
  if (!allowedValues.has(normalized)) {
    throw new Error(
      `Invalid agent config value for ${label}: expected one of ${[...allowedValues].join(", ")}.`
    );
  }
  return normalized;
}
function normalizeReasoningEffort(value) {
  if (isPlainObject(value)) {
    return normalizeReasoningEffort(readAliasedValue(value, ["effort", "reasoningEffort"]));
  }
  return normalizeEnum(value, "reasoning", REASONING_EFFORTS);
}
function normalizeToolPermission(value) {
  if (isPlainObject(value)) {
    return normalizeToolPermission(readAliasedValue(value, ["default", "toolPermission", "permission"]));
  }
  return normalizeEnum(value, "permissions", TOOL_PERMISSIONS);
}
function normalizeWebSearch(value) {
  if (value === void 0 || value === null || value === "") {
    return void 0;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
    const searchContextSize2 = normalizeEnum(normalized, "webSearch.searchContextSize", WEB_SEARCH_CONTEXT_SIZES);
    return searchContextSize2 ? { searchContextSize: searchContextSize2 } : void 0;
  }
  if (!isPlainObject(value)) {
    throw new Error("Invalid agent config value for webSearch: expected a boolean, string, or object.");
  }
  const enabled = readAliasedValue(value, ["enabled"]);
  if (enabled === false) {
    return false;
  }
  const searchContextSize = normalizeEnum(
    readAliasedValue(value, ["searchContextSize", "contextSize", "size"]),
    "webSearch.searchContextSize",
    WEB_SEARCH_CONTEXT_SIZES
  );
  if (searchContextSize) {
    return { searchContextSize };
  }
  return true;
}
var AGENT_CONFIG_ALIASES = {
  provider: ["provider"],
  model: ["model", "modal"],
  temperature: ["temperature"],
  maxTokens: ["maxTokens", "maxOutputTokens", "tokens", "max-tokens", "max-output-tokens"],
  toolPermission: ["toolPermission", "permission", "permissions", "tool-permission"],
  reasoningEffort: ["reasoningEffort", "reasoning", "reasoning-effort"],
  pastMessages: ["pastMessages", "historyMessages", "past_messages", "past-messages", "history-messages"],
  stream: ["stream"],
  streamTrace: ["streamTrace", "stream_trace", "stream-trace"],
  webSearch: ["webSearch", "web_search", "web-search"]
};
function normalizeAgentConfig(source) {
  const configSource = isPlainObject(source.runtime) ? {
    ...source,
    ...source.runtime
  } : source;
  const normalizedConfig = {
    provider: normalizeString(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.provider), "provider"),
    model: normalizeString(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.model), "model"),
    temperature: normalizeNumber(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.temperature), "temperature"),
    maxTokens: normalizePositiveInteger(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.maxTokens),
      "maxTokens"
    ),
    toolPermission: normalizeToolPermission(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.toolPermission)
    ),
    reasoningEffort: normalizeReasoningEffort(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.reasoningEffort)
    ),
    pastMessages: normalizeNonNegativeInteger(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.pastMessages),
      "pastMessages"
    ),
    stream: normalizeBoolean(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.stream),
      "stream"
    ),
    streamTrace: normalizeBoolean(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.streamTrace),
      "streamTrace"
    )
  };
  const webSearch = normalizeWebSearch(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.webSearch));
  if (webSearch !== void 0) {
    normalizedConfig.webSearch = webSearch;
  }
  return Object.fromEntries(
    Object.entries(normalizedConfig).filter(([, value]) => value !== void 0)
  );
}
async function readJsonFileIfPresent(filePath, label) {
  let content;
  try {
    content = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Invalid ${label}: ${filePath}`);
  }
  if (!isPlainObject(parsed)) {
    throw new Error(`Invalid ${label}: ${filePath}`);
  }
  return parsed;
}
function validateRuntimeSchemaVersion(schemaVersion, filePath) {
  if (schemaVersion === void 0 || schemaVersion === null || schemaVersion === "") {
    return;
  }
  const normalizedSchemaVersion = Number(schemaVersion);
  if (normalizedSchemaVersion !== 1) {
    throw new Error(`Unsupported runtime config schemaVersion in ${filePath}: expected 1.`);
  }
}
function normalizeRuntimeConfigFile(source, filePath) {
  validateRuntimeSchemaVersion(source.schemaVersion, filePath);
  return normalizeAgentConfig(source);
}
async function loadRuntimeConfigFile(filePath) {
  const config = await readJsonFileIfPresent(filePath, "runtime config");
  if (!config) {
    return {};
  }
  return normalizeRuntimeConfigFile(config, filePath);
}
function normalizeAgentId(agentId) {
  if (agentId === void 0 || agentId === null) {
    return "";
  }
  const normalizedAgentId = String(agentId).trim();
  return normalizedAgentId;
}
async function loadDefaultAgentIdFromWorld() {
  const world = await readJsonFileIfPresent(WORLD_STATE_PATH, "world metadata");
  if (!world) {
    return "";
  }
  return normalizeAgentId(world.defaultAgentId);
}
async function loadPersistedRuntimeConfig(options = {}) {
  const rootRuntimeConfig = await loadRuntimeConfigFile(ROOT_RUNTIME_CONFIG_PATH);
  const configuredAgentId = normalizeAgentId(options.agentId);
  const defaultAgentId = configuredAgentId || await loadDefaultAgentIdFromWorld();
  if (!defaultAgentId) {
    return rootRuntimeConfig;
  }
  const agentMetadataConfig = normalizeAgentConfig(
    await readJsonFileIfPresent(buildAgentMetadataPath(defaultAgentId), "agent metadata") ?? {}
  );
  const agentRuntimeConfig = await loadRuntimeConfigFile(buildAgentRuntimeConfigPath(defaultAgentId));
  return {
    ...rootRuntimeConfig,
    ...agentMetadataConfig,
    ...agentRuntimeConfig
  };
}

// core/agent-files.ts
import { promises as fs2 } from "node:fs";
import path2 from "node:path";
var DEFAULT_SYSTEM_PROMPT = [
  "You are Agent CLI.",
  "Be concise, factual, and action-oriented.",
  "Prefer workspace evidence over speculation when an answer depends on files, configuration, environment variables, logs, generated outputs, or repository state.",
  "Use available read-only tools before asking the user for information that may already exist in the workspace.",
  "When a task depends on domain-specific instructions, procedures, or contracts, use `load_skill` when a relevant skill is available.",
  "Do not claim files, configuration, or prerequisites are missing until you have inspected likely sources when appropriate.",
  "Do not reveal secret values by default; report presence, absence, or non-sensitive metadata unless the user explicitly asks to inspect file contents."
].join(" ");
function getBuiltInSystemPrompt() {
  return DEFAULT_SYSTEM_PROMPT;
}
async function assertReadableFile(filePath, label) {
  let stats;
  try {
    stats = await fs2.stat(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
    throw new Error(`Missing ${label}: ${filePath}`);
  }
  if (!stats.isFile()) {
    throw new Error(`Expected ${label} to be a file: ${filePath}`);
  }
}
async function assertReadableDirectory(directoryPath, label) {
  let stats;
  try {
    stats = await fs2.stat(directoryPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") {
      throw error;
    }
    throw new Error(`Missing ${label}: ${directoryPath}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Expected ${label} to be a directory: ${directoryPath}`);
  }
}
function parseSkillFrontMatter(content) {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const frontMatterMatch = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontMatterMatch || !frontMatterMatch[1]) {
    return { skillId: "", description: "" };
  }
  let skillId = "";
  let description = "";
  for (const line of frontMatterMatch[1].split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) {
      continue;
    }
    const key = String(match[1] ?? "").trim();
    const value = String(match[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
    if (key === "name") {
      skillId = value;
    }
    if (key === "description") {
      description = value;
    }
  }
  return { skillId, description };
}
async function collectSkillFilePaths(rootPath) {
  const discoveredPaths = [];
  const queue = [rootPath];
  while (queue.length > 0) {
    const currentPath = queue.shift();
    if (!currentPath) {
      continue;
    }
    const entries = await fs2.readdir(currentPath, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path2.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        queue.push(entryPath);
        continue;
      }
      if (entry.isFile() && entry.name === "SKILL.md") {
        discoveredPaths.push(entryPath);
      }
    }
  }
  return discoveredPaths.sort((left, right) => left.localeCompare(right));
}
async function loadWorkspaceSystemPrompt() {
  try {
    await assertReadableFile(SYSTEM_PROMPT_PATH, "system prompt");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing system prompt:")) {
      return "";
    }
    throw error;
  }
  const content = (await fs2.readFile(SYSTEM_PROMPT_PATH, "utf8")).trim();
  return content;
}
async function loadSkillInventory() {
  try {
    await assertReadableDirectory(SKILLS_ROOT, "skills root");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing skills root:")) {
      return [];
    }
    throw error;
  }
  const skillFilePaths = await collectSkillFilePaths(SKILLS_ROOT);
  const skills = [];
  for (const skillFilePath of skillFilePaths) {
    const content = await fs2.readFile(skillFilePath, "utf8");
    const metadata = parseSkillFrontMatter(content);
    if (!metadata.skillId) {
      continue;
    }
    skills.push({
      skillId: metadata.skillId,
      description: metadata.description,
      sourcePath: skillFilePath
    });
  }
  return skills;
}
function buildSkillInventoryMessage(skills) {
  if (skills.length === 0) {
    return "";
  }
  const lines = skills.map((skill) => {
    const description = skill.description || "No description provided.";
    return `- ${skill.skillId}: ${description}`;
  });
  return [
    "Available skills can be loaded through the `load_skill` tool.",
    "When a skill is relevant, call `load_skill` with the exact `skillId` before answering.",
    "",
    ...lines
  ].join("\n");
}

// core/agent-runtime.ts
import {
  createRuntime,
  executeToolCall as executeRuntimeToolCall,
  executeToolCalls as executeRuntimeToolCalls,
  runCompletionLoop
} from "llm-runtime";
var SUPPORTED_PROVIDERS = /* @__PURE__ */ new Set([
  "openai",
  "anthropic",
  "google",
  "azure",
  "xai",
  "openai-compatible",
  "ollama"
]);
var DEFAULT_MODELS = {
  openai: "gpt-5"
};
function buildEnvironmentDefaults(agentConfig = {}) {
  const defaults = {};
  if (agentConfig.reasoningEffort) {
    defaults.reasoningEffort = agentConfig.reasoningEffort;
  }
  if (agentConfig.toolPermission) {
    defaults.toolPermission = agentConfig.toolPermission;
  }
  return defaults;
}
function buildExecutionContext(agentConfig = {}) {
  const context = {
    workingDirectory: WORKSPACE_ROOT
  };
  if (agentConfig.reasoningEffort) {
    context.reasoningEffort = agentConfig.reasoningEffort;
  }
  if (agentConfig.toolPermission) {
    context.toolPermission = agentConfig.toolPermission;
  }
  if (agentConfig.abortSignal) {
    context.abortSignal = agentConfig.abortSignal;
  }
  return context;
}
function requireEnvironmentVariable(environment, variableName) {
  const value = String(environment[variableName] ?? "").trim();
  if (!value) {
    throw new Error(`Missing environment variable: ${variableName}`);
  }
  return value;
}
function resolveProviderConfig(provider, environment) {
  switch (provider) {
    case "openai":
      return {
        apiKey: requireEnvironmentVariable(environment, "OPENAI_API_KEY")
      };
    case "anthropic":
      return {
        apiKey: requireEnvironmentVariable(environment, "ANTHROPIC_API_KEY")
      };
    case "google":
      return {
        apiKey: requireEnvironmentVariable(environment, "GOOGLE_API_KEY")
      };
    case "xai":
      return {
        apiKey: requireEnvironmentVariable(environment, "XAI_API_KEY")
      };
    case "openai-compatible":
      return {
        apiKey: requireEnvironmentVariable(environment, "OPENAI_COMPATIBLE_API_KEY"),
        baseUrl: requireEnvironmentVariable(environment, "OPENAI_COMPATIBLE_BASE_URL")
      };
    case "ollama":
      return {
        baseUrl: requireEnvironmentVariable(environment, "OLLAMA_BASE_URL")
      };
    case "azure":
      return {
        apiKey: requireEnvironmentVariable(environment, "AZURE_OPENAI_API_KEY"),
        resourceName: requireEnvironmentVariable(environment, "AZURE_OPENAI_RESOURCE_NAME"),
        deployment: requireEnvironmentVariable(environment, "AZURE_OPENAI_DEPLOYMENT_NAME"),
        ...String(environment.AZURE_OPENAI_API_VERSION ?? "").trim() ? { apiVersion: String(environment.AZURE_OPENAI_API_VERSION).trim() } : {}
      };
    default:
      throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}
function validateRuntimeEnvironment(environment = process.env, agentConfig = {}) {
  const configuredProvider = String(agentConfig.provider ?? "openai").trim();
  const normalizedProvider = configuredProvider.toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(
    /** @type {LLMProviderName} */
    normalizedProvider
  )) {
    throw new Error(`Unsupported LLM provider: ${configuredProvider}`);
  }
  const provider = (
    /** @type {LLMProviderName} */
    normalizedProvider
  );
  const providerConfig = resolveProviderConfig(provider, environment);
  const providerDefaultModel = provider === "azure" && "deployment" in providerConfig ? providerConfig.deployment : DEFAULT_MODELS[provider];
  const model = String(
    agentConfig.model ?? providerDefaultModel ?? ""
  ).trim();
  if (!model) {
    throw new Error(`Missing LLM model. Set it in runtime.json or pass --model for provider ${provider}.`);
  }
  const providers = (
    /** @type {LLMProviderConfigs} */
    {
      [provider]: providerConfig
    }
  );
  return {
    provider,
    model,
    providers
  };
}
function buildBaseSystemMessages(builtInSystemPrompt, workspaceSystemPrompt, skillInventory) {
  const layers = [builtInSystemPrompt.trim()];
  if (String(workspaceSystemPrompt ?? "").trim()) {
    layers.push(String(workspaceSystemPrompt).trim());
  }
  const skillInventoryMessage = buildSkillInventoryMessage(skillInventory);
  if (skillInventoryMessage) {
    layers.push(skillInventoryMessage);
  }
  return [{
    role: "system",
    content: layers.join("\n\n")
  }];
}
function parseToolArguments(argumentsText) {
  if (!argumentsText || !String(argumentsText).trim()) {
    return {};
  }
  try {
    return JSON.parse(argumentsText);
  } catch {
    return {
      __raw: argumentsText
    };
  }
}
function createToolExecutor(runtime) {
  return {
    executeToolCall: async (toolCall, context, options = {}) => executeRuntimeToolCall({
      toolCall,
      environment: runtime,
      builtIns: {
        load_skill: true
      },
      ...context ? { context } : {},
      ...options.errorMode ? { errorMode: options.errorMode } : {}
    }),
    executeToolCalls: async (toolCalls, context, options = {}) => executeRuntimeToolCalls({
      toolCalls,
      environment: runtime,
      builtIns: {
        load_skill: true
      },
      ...context ? { context } : {},
      ...options.errorMode ? { errorMode: options.errorMode } : {}
    })
  };
}
function createRejectedToolResult(toolCallId, toolName, message) {
  return {
    ok: false,
    status: "rejected",
    errorType: "tool_execution_rejected",
    toolCallId,
    toolName,
    message
  };
}
function serializeToolResult(result) {
  if (typeof result === "string") {
    return result;
  }
  return JSON.stringify(result ?? null, null, 2);
}
function selectContextMessages(messages, historyMessageLimit) {
  if (typeof historyMessageLimit !== "number" || !Number.isInteger(historyMessageLimit) || historyMessageLimit < 0) {
    return messages;
  }
  if (historyMessageLimit === 0) {
    return [];
  }
  return messages.slice(-historyMessageLimit);
}
async function runChatTurn({
  chat,
  userMessage,
  stream = true,
  onStreamChunk,
  onToolCall,
  onToolResult,
  handleToolCall,
  historyMessageLimit,
  builtInSystemPrompt,
  workspaceSystemPrompt,
  projectSystemPrompt,
  skillInventory,
  approvalGate,
  agentConfig = {},
  abortSignal
}) {
  const runtimeSettings = validateRuntimeEnvironment(process.env, agentConfig);
  const environmentDefaults = buildEnvironmentDefaults(agentConfig);
  const executionContext = buildExecutionContext({
    ...agentConfig,
    abortSignal
  });
  const runtime = createRuntime({
    providers: runtimeSettings.providers,
    skillRoots: [SKILLS_ROOT],
    ...Object.keys(environmentDefaults).length > 0 ? { defaults: environmentDefaults } : {}
  });
  const pendingUserMessage = {
    role: "user",
    content: userMessage,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const contextMessages = selectContextMessages(chat.messages, historyMessageLimit);
  const toolExecutor = createToolExecutor(runtime);
  try {
    const result = await runCompletionLoop({
      initialState: {
        conversationMessages: [...contextMessages, pendingUserMessage],
        persistedMessages: [...chat.messages, pendingUserMessage],
        finalText: ""
      },
      emptyTextRetryLimit: 0,
      rejectedTextRetryLimit: 0,
      modelRequest: {
        mode: stream ? "stream" : "generate",
        environment: runtime,
        provider: runtimeSettings.provider,
        model: runtimeSettings.model,
        ...stream && typeof onStreamChunk === "function" ? { onChunk: onStreamChunk } : {},
        ...typeof agentConfig.temperature === "number" ? { temperature: agentConfig.temperature } : {},
        ...typeof agentConfig.maxTokens === "number" ? { maxTokens: agentConfig.maxTokens } : {},
        ...agentConfig.webSearch !== void 0 ? { webSearch: agentConfig.webSearch } : {},
        builtIns: {
          load_skill: true,
          ask_user_input: true
        },
        context: executionContext
      },
      ...abortSignal ? { abortSignal } : {},
      buildMessages: async ({ state, transientInstruction }) => {
        const baseMessages = [
          ...buildBaseSystemMessages(
            builtInSystemPrompt,
            workspaceSystemPrompt ?? projectSystemPrompt,
            skillInventory
          ),
          ...state.conversationMessages
        ];
        if (!transientInstruction) {
          return baseMessages;
        }
        return [
          ...baseMessages,
          {
            role: "system",
            content: transientInstruction
          }
        ];
      },
      onToolCallsResponse: async ({ state, response, toolExecutor: providedToolExecutor }) => {
        const nextConversationMessages = [...state.conversationMessages, response.assistantMessage];
        const nextPersistedMessages = [...state.persistedMessages, response.assistantMessage];
        const activeToolExecutor = providedToolExecutor ?? toolExecutor;
        for (const toolCall of response.tool_calls ?? []) {
          const toolName = toolCall.function?.name ?? "unknown_tool";
          const toolArguments = toolCall.function?.arguments;
          if (typeof onToolCall === "function") {
            onToolCall({
              id: toolCall.id,
              name: toolName,
              arguments: toolArguments
            });
          }
          let toolResult;
          const toolStartedAt = Date.now();
          if (executionContext.toolPermission === "ask" && approvalGate?.requestApproval) {
            const approvalDecision = await approvalGate.requestApproval({
              toolCallId: toolCall.id,
              toolName,
              arguments: parseToolArguments(toolArguments ?? "{}")
            });
            if (!approvalDecision?.approved) {
              toolResult = createRejectedToolResult(
                toolCall.id,
                toolName,
                approvalDecision?.reason || `Tool execution rejected: ${toolName}`
              );
            }
          }
          const toolContext = {
            ...executionContext,
            toolCallId: toolCall.id
          };
          const executeDefaultToolCall = async () => activeToolExecutor.executeToolCall(toolCall, toolContext, {
            errorMode: "return-artifact"
          });
          if (typeof toolResult === "undefined" && typeof handleToolCall === "function") {
            const handlerResult = await handleToolCall({
              toolCall,
              toolName,
              arguments: toolArguments,
              parsedArguments: parseToolArguments(toolArguments ?? "{}"),
              context: toolContext,
              executeDefault: executeDefaultToolCall
            });
            if (handlerResult?.handled) {
              toolResult = handlerResult.result;
            }
          }
          if (typeof toolResult === "undefined") {
            toolResult = await executeDefaultToolCall();
          }
          if (typeof onToolResult === "function") {
            onToolResult({
              id: toolCall.id,
              name: toolName,
              result: toolResult,
              arguments: toolArguments,
              durationMs: Date.now() - toolStartedAt
            });
          }
          const toolMessage = {
            role: "tool",
            tool_call_id: toolCall.id,
            content: serializeToolResult(toolResult),
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          };
          nextConversationMessages.push(toolMessage);
          nextPersistedMessages.push(toolMessage);
        }
        return {
          state: {
            ...state,
            conversationMessages: nextConversationMessages,
            persistedMessages: nextPersistedMessages
          },
          next: {
            control: "continue"
          }
        };
      },
      onTextResponse: async ({ state, response, responseText }) => ({
        state: {
          ...state,
          conversationMessages: [...state.conversationMessages, response.assistantMessage],
          persistedMessages: [...state.persistedMessages, response.assistantMessage],
          finalText: responseText
        }
      })
    });
    if (!result.state.finalText.trim()) {
      throw new Error(`LLM turn ended without a final text response. Stop reason: ${result.reason}`);
    }
    return {
      assistantText: result.state.finalText.trim(),
      messages: result.state.persistedMessages ?? result.state.conversationMessages
    };
  } finally {
    await runtime.dispose();
  }
}

// core/world-store.ts
import { randomUUID } from "node:crypto";
import { promises as fs3 } from "node:fs";
import path3 from "node:path";
var DEFAULT_AGENT_ID = "default";
function defaultWorldName() {
  return path3.basename(WORKSPACE_ROOT) || "agent-world";
}
function normalizeAgentId2(agentId) {
  const normalizedAgentId = String(agentId ?? "").trim();
  if (!normalizedAgentId) {
    return DEFAULT_AGENT_ID;
  }
  return normalizedAgentId;
}
function createChatId(now = /* @__PURE__ */ new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}
function createWorldId() {
  return randomUUID();
}
function normalizeTimestamp(value, fallbackTimestamp) {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return fallbackTimestamp;
}
function pickLatestTimestamp(values) {
  let latestTimestamp = "";
  let latestValue = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const normalizedValue = typeof value === "string" ? value.trim() : value instanceof Date ? value.toISOString() : "";
    if (!normalizedValue) {
      continue;
    }
    const parsedValue = Date.parse(normalizedValue);
    if (!Number.isFinite(parsedValue)) {
      continue;
    }
    if (!latestTimestamp || parsedValue > latestValue) {
      latestTimestamp = normalizedValue;
      latestValue = parsedValue;
    }
  }
  return latestTimestamp;
}
function normalizeToolCalls(value) {
  return Array.isArray(value) ? value : void 0;
}
function normalizePersistedMessage(message, fallbackTimestamp) {
  if (!message || typeof message !== "object") {
    throw new Error("Encountered an invalid chat message while persisting the session.");
  }
  const role = String(message.role ?? "").trim();
  const content = String(message.content ?? "");
  if (!role) {
    throw new Error("Encountered a chat message without a role while persisting the session.");
  }
  const toolCalls = normalizeToolCalls(message.tool_calls);
  return {
    role,
    content,
    createdAt: normalizeTimestamp(message.createdAt, fallbackTimestamp),
    ...typeof message.tool_call_id === "string" ? { tool_call_id: message.tool_call_id } : {},
    ...toolCalls ? { tool_calls: toolCalls } : {}
  };
}
async function writeJsonAtomic(filePath, value) {
  const directoryPath = path3.dirname(filePath);
  const fileName = path3.basename(filePath);
  const temporaryPath = path3.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  await fs3.mkdir(directoryPath, { recursive: true });
  await fs3.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, "utf8");
  await fs3.rename(temporaryPath, filePath);
}
async function writeTextAtomic(filePath, text) {
  const directoryPath = path3.dirname(filePath);
  const fileName = path3.basename(filePath);
  const temporaryPath = path3.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  await fs3.mkdir(directoryPath, { recursive: true });
  await fs3.writeFile(temporaryPath, text, "utf8");
  await fs3.rename(temporaryPath, filePath);
}
async function writeJsonlAtomic(filePath, values) {
  const serialized = values.length > 0 ? `${values.map((value) => JSON.stringify(value)).join("\n")}
` : "";
  await writeTextAtomic(filePath, serialized);
}
async function appendJsonl(filePath, values) {
  if (!Array.isArray(values) || values.length === 0) {
    return;
  }
  await fs3.mkdir(path3.dirname(filePath), { recursive: true });
  const serialized = `${values.map((value) => JSON.stringify(value)).join("\n")}
`;
  await fs3.appendFile(filePath, serialized, "utf8");
}
async function readJson(filePath, missingMessage, invalidMessage) {
  let rawContent;
  try {
    rawContent = await fs3.readFile(filePath, "utf8");
  } catch {
    throw new Error(missingMessage);
  }
  try {
    return JSON.parse(rawContent);
  } catch {
    throw new Error(invalidMessage);
  }
}
async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs3.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function pathExists(filePath) {
  try {
    await fs3.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function ensureTextFile(filePath, defaultText = "") {
  if (await pathExists(filePath)) {
    return;
  }
  await writeTextAtomic(filePath, defaultText);
}
async function readJsonl(filePath) {
  let rawContent;
  try {
    rawContent = await fs3.readFile(filePath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Missing chat session file: ${filePath}`);
    }
    throw error;
  }
  const lines = rawContent.split(/\r?\n/u).filter(Boolean);
  try {
    return lines.map((line) => JSON.parse(line));
  } catch {
    throw new Error(`Invalid chat session file: ${filePath}`);
  }
}
async function ensureAgentWorldDirectories() {
  await Promise.all([
    fs3.mkdir(AGENT_WORLD_ROOT, { recursive: true }),
    fs3.mkdir(AGENT_WORLD_CHATS_ROOT, { recursive: true }),
    fs3.mkdir(AGENT_WORLD_AGENTS_ROOT, { recursive: true }),
    fs3.mkdir(AGENT_WORLD_QUEUES_ROOT, { recursive: true })
  ]);
}
function createEmptyChat() {
  const createdAt = (/* @__PURE__ */ new Date()).toISOString();
  return {
    id: createChatId(),
    createdAt,
    updatedAt: createdAt,
    messages: []
  };
}
function createMessageId() {
  return `msg-${Date.now()}-${randomUUID().slice(0, 8)}`;
}
async function inferDefaultAgentRuntime(agentId) {
  const runtimeConfig = await loadPersistedRuntimeConfig({ agentId });
  const provider = String(runtimeConfig.provider ?? "openai").trim() || "openai";
  const model = String(runtimeConfig.model ?? (provider === "openai" ? "gpt-5" : "")).trim();
  return {
    provider,
    model
  };
}
async function ensureDefaultAgentFiles(agentId, metadata = {}) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existingAgentMetadata = await readJsonIfPresent(buildAgentMetadataPath(agentId));
  const inferredRuntime = await inferDefaultAgentRuntime(agentId);
  const name = String(metadata.name ?? existingAgentMetadata?.name ?? `${defaultWorldName()} agent`).trim() || `${defaultWorldName()} agent`;
  const provider = String(metadata.provider ?? existingAgentMetadata?.provider ?? inferredRuntime.provider).trim() || inferredRuntime.provider;
  const model = String(metadata.model ?? existingAgentMetadata?.model ?? inferredRuntime.model).trim() || inferredRuntime.model;
  await writeJsonAtomic(buildAgentMetadataPath(agentId), {
    id: agentId,
    name,
    provider,
    model,
    createdAt: String(existingAgentMetadata?.createdAt ?? now),
    updatedAt: now
  });
  if (metadata.provider || metadata.model || !await pathExists(buildAgentRuntimeConfigPath(agentId))) {
    await writeJsonAtomic(buildAgentRuntimeConfigPath(agentId), {
      schemaVersion: 1,
      provider,
      model
    });
  }
  if (!await pathExists(buildAgentStatePath(agentId))) {
    await writeJsonAtomic(buildAgentStatePath(agentId), {
      id: agentId,
      updatedAt: now
    });
  }
  await ensureTextFile(buildAgentEventsPath(agentId));
  await ensureTextFile(buildAgentInboxPath(agentId));
  await ensureTextFile(buildAgentMemoryPath(agentId));
  await ensureTextFile(buildAgentMemoryLogPath(agentId));
}
async function readWorldState() {
  const world = await readJsonIfPresent(WORLD_STATE_PATH);
  if (!world || typeof world !== "object") {
    return null;
  }
  return world;
}
async function writeWorldState({ world, updates }) {
  const nextWorld = {
    ...world,
    ...updates,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeJsonAtomic(WORLD_STATE_PATH, nextWorld);
  return nextWorld;
}
async function persistWorldChat(chat, agentId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const messages = chat.messages.map((message) => normalizePersistedMessage(message, now));
  const createdAt = normalizeTimestamp(chat.createdAt, now);
  const updatedAt = pickLatestTimestamp([
    chat.updatedAt,
    messages.at(-1)?.createdAt,
    createdAt
  ]) || now;
  const metadata = {
    id: chat.id,
    agentId,
    createdAt,
    updatedAt,
    messageCount: messages.length
  };
  await writeJsonAtomic(buildWorldChatMetadataPath(chat.id), metadata);
  await writeJsonlAtomic(buildWorldChatMessagesPath(chat.id), messages);
  await ensureTextFile(buildWorldChatSummaryPath(chat.id));
  return {
    ...metadata,
    messages
  };
}
async function ensureWorldBootstrap() {
  await ensureAgentWorldDirectories();
  let world = await readWorldState();
  let changed = false;
  if (!world) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    world = {
      id: createWorldId(),
      name: defaultWorldName(),
      defaultAgentId: DEFAULT_AGENT_ID,
      currentChatId: "",
      createdAt: now,
      updatedAt: now
    };
    changed = true;
  }
  if (!String(world.defaultAgentId ?? "").trim()) {
    world.defaultAgentId = DEFAULT_AGENT_ID;
    changed = true;
  }
  await ensureDefaultAgentFiles(String(world.defaultAgentId));
  if (changed) {
    world = await writeWorldState({ world, updates: {} });
  }
  return (
    /** @type {{ id: string, name: string, defaultAgentId: string, currentChatId: string, createdAt?: string, updatedAt?: string }} */
    world
  );
}
async function loadAgentMetadata(agentId) {
  const normalizedAgentId = normalizeAgentId2(agentId);
  const metadata = await readJsonIfPresent(buildAgentMetadataPath(normalizedAgentId));
  return metadata && typeof metadata === "object" ? metadata : null;
}
async function loadWorldSnapshot() {
  const world = await ensureWorldBootstrap();
  return {
    ...world,
    agents: await listAgentMetadata(),
    chats: await listPersistedChats()
  };
}
async function updateWorldMetadata(updates) {
  const world = await ensureWorldBootstrap();
  return await writeWorldState({ world, updates });
}
async function listAgentMetadata() {
  await ensureWorldBootstrap();
  const entries = await fs3.readdir(AGENT_WORLD_AGENTS_ROOT, { withFileTypes: true });
  const agents = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const metadata = await readJsonIfPresent(buildAgentMetadataPath(entry.name));
    if (metadata && typeof metadata === "object") {
      agents.push(metadata);
    }
  }
  return agents.sort((left, right) => String(left.id ?? "").localeCompare(String(right.id ?? "")));
}
async function createAgentMetadata(options = {}) {
  return await ensureAgentSelection(options);
}
async function updateAgentMetadata(agentId, updates) {
  const normalizedAgentId = normalizeAgentId2(agentId);
  await ensureWorldBootstrap();
  const existingAgentMetadata = await readJsonIfPresent(buildAgentMetadataPath(normalizedAgentId));
  if (!existingAgentMetadata || typeof existingAgentMetadata !== "object") {
    throw new Error(`Missing agent: ${normalizedAgentId}`);
  }
  const nextMetadata = {
    ...existingAgentMetadata,
    ...updates,
    id: normalizedAgentId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeJsonAtomic(buildAgentMetadataPath(normalizedAgentId), nextMetadata);
  if (updates.provider || updates.model) {
    const existingRuntime = await readJsonIfPresent(buildAgentRuntimeConfigPath(normalizedAgentId));
    await writeJsonAtomic(buildAgentRuntimeConfigPath(normalizedAgentId), {
      ...existingRuntime && typeof existingRuntime === "object" ? existingRuntime : { schemaVersion: 1 },
      ...updates.provider ? { provider: updates.provider } : {},
      ...updates.model ? { model: updates.model } : {}
    });
  }
  return nextMetadata;
}
async function deleteAgentMetadata(agentId) {
  const normalizedAgentId = normalizeAgentId2(agentId);
  const world = await ensureWorldBootstrap();
  if (String(world.defaultAgentId ?? "") === normalizedAgentId) {
    throw new Error("Cannot delete the default agent.");
  }
  await fs3.rm(path3.join(AGENT_WORLD_AGENTS_ROOT, normalizedAgentId), { recursive: true, force: true });
  return true;
}
async function ensureAgentSelection(options = {}) {
  const agentId = normalizeAgentId2(options.agentId);
  const world = await ensureWorldBootstrap();
  await ensureDefaultAgentFiles(agentId, {
    name: options.name,
    provider: options.provider,
    model: options.model
  });
  if (options.setDefault !== false && String(world.defaultAgentId ?? "") !== agentId) {
    await writeWorldState({
      world,
      updates: {
        defaultAgentId: agentId,
        currentChatId: ""
      }
    });
  }
  return await loadAgentMetadata(agentId);
}
async function loadWorldChatMetadata(chatId) {
  return await readJson(
    buildWorldChatMetadataPath(chatId),
    `Missing chat session file: ${buildWorldChatMessagesPath(chatId)}`,
    `Invalid chat session file: ${buildWorldChatMetadataPath(chatId)}`
  );
}
async function loadWorldChatById(chatId) {
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  const metadata = await loadWorldChatMetadata(normalizedChatId);
  const messages = (await readJsonl(buildWorldChatMessagesPath(normalizedChatId))).map((message) => normalizePersistedMessage(message, (/* @__PURE__ */ new Date()).toISOString()));
  return {
    id: String(metadata.id ?? normalizedChatId),
    createdAt: String(metadata.createdAt ?? ""),
    updatedAt: String(metadata.updatedAt ?? ""),
    messages
  };
}
function normalizeAgentMemoryEntry(message, context) {
  const normalizedMessage = normalizePersistedMessage(message, context.fallbackTimestamp);
  return {
    ...normalizedMessage,
    messageId: String(message.messageId ?? message.id ?? "").trim() || createMessageId(),
    agentId: context.agentId,
    chatId: context.chatId,
    sender: typeof message.sender === "string" ? message.sender : normalizedMessage.role === "assistant" ? context.agentId : normalizedMessage.role
  };
}
async function appendAgentMemory({ agentId, chatId, messages }) {
  const normalizedAgentId = normalizeAgentId2(agentId);
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  await ensureWorldBootstrap();
  await ensureDefaultAgentFiles(normalizedAgentId);
  const fallbackTimestamp = (/* @__PURE__ */ new Date()).toISOString();
  const entries = messages.map((message) => normalizeAgentMemoryEntry(message, {
    agentId: normalizedAgentId,
    chatId: normalizedChatId,
    fallbackTimestamp
  }));
  await appendJsonl(buildAgentMemoryLogPath(normalizedAgentId), entries);
  return entries;
}
async function replaceAgentMemory({ agentId, chatId, messages }) {
  const normalizedAgentId = normalizeAgentId2(agentId);
  const normalizedChatId = String(chatId ?? "").trim();
  await ensureWorldBootstrap();
  await ensureDefaultAgentFiles(normalizedAgentId);
  let retainedEntries = [];
  const memoryPath = buildAgentMemoryLogPath(normalizedAgentId);
  try {
    retainedEntries = await readJsonl(memoryPath);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith("Missing chat session file: ")) {
      throw error;
    }
  }
  const fallbackTimestamp = (/* @__PURE__ */ new Date()).toISOString();
  const replacementEntries = messages.map((message) => normalizeAgentMemoryEntry(message, {
    agentId: normalizedAgentId,
    chatId: String(message.chatId ?? normalizedChatId).trim(),
    fallbackTimestamp
  }));
  const nextEntries = normalizedChatId ? [
    ...retainedEntries.filter((entry) => String(entry.chatId ?? "") !== normalizedChatId),
    ...replacementEntries
  ] : replacementEntries;
  await writeJsonlAtomic(memoryPath, nextEntries);
  return replacementEntries;
}
async function loadAgentMemory(options = {}) {
  await ensureWorldBootstrap();
  const normalizedAgentId = options.agentId ? normalizeAgentId2(options.agentId) : "";
  const normalizedChatId = String(options.chatId ?? "").trim();
  const agentIds = normalizedAgentId ? [normalizedAgentId] : (await listAgentMetadata()).map((agent) => String(agent.id ?? "")).filter(Boolean);
  const entries = [];
  for (const agentId of agentIds) {
    const memoryPath = buildAgentMemoryLogPath(agentId);
    let memoryEntries;
    try {
      memoryEntries = await readJsonl(memoryPath);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Missing chat session file: ")) {
        continue;
      }
      throw error;
    }
    for (const entry of memoryEntries) {
      if (normalizedChatId && String(entry.chatId ?? "") !== normalizedChatId) {
        continue;
      }
      entries.push(entry);
    }
  }
  return entries.sort((left, right) => {
    const leftTime = Date.parse(String(left.createdAt ?? ""));
    const rightTime = Date.parse(String(right.createdAt ?? ""));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return String(left.messageId ?? "").localeCompare(String(right.messageId ?? ""));
  });
}
async function loadChatById(chatId) {
  await ensureWorldBootstrap();
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  return await loadWorldChatById(normalizedChatId);
}
async function listPersistedChats() {
  const world = await ensureWorldBootstrap();
  const currentChatId = String(world.currentChatId ?? "").trim();
  const entries = await fs3.readdir(AGENT_WORLD_CHATS_ROOT, { withFileTypes: true });
  const chats = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const chatId = String(entry.name ?? "").trim();
    if (!chatId) {
      continue;
    }
    const metadata = await readJsonIfPresent(buildWorldChatMetadataPath(chatId));
    if (!metadata || typeof metadata !== "object") {
      continue;
    }
    chats.push({
      id: String(metadata.id ?? chatId),
      createdAt: String(metadata.createdAt ?? ""),
      updatedAt: String(metadata.updatedAt ?? ""),
      messageCount: Number(metadata.messageCount ?? 0),
      isCurrent: String(metadata.id ?? chatId) === currentChatId
    });
  }
  return chats.sort((left, right) => {
    const leftTimestamp = Date.parse(left.updatedAt || left.createdAt || "0");
    const rightTimestamp = Date.parse(right.updatedAt || right.createdAt || "0");
    if (Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp !== rightTimestamp) {
      return rightTimestamp - leftTimestamp;
    }
    return left.id.localeCompare(right.id);
  });
}
async function createPersistedChat(options = {}) {
  const chat = createEmptyChat();
  await persistCompletedChat({
    chat,
    messages: chat.messages,
    setCurrent: options.setCurrent !== false
  });
  return chat;
}
async function deletePersistedChat(chatId) {
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  const world = await ensureWorldBootstrap();
  await fs3.rm(path3.join(AGENT_WORLD_CHATS_ROOT, normalizedChatId), { recursive: true, force: true });
  await fs3.rm(buildWorldQueuePath(normalizedChatId), { force: true });
  if (String(world.currentChatId ?? "") === normalizedChatId) {
    await writeWorldState({
      world,
      updates: {
        currentChatId: ""
      }
    });
  }
  return {
    chatId: normalizedChatId,
    deleted: true
  };
}
async function setCurrentChat(chatId) {
  const world = await ensureWorldBootstrap();
  const chat = await loadChatById(chatId);
  await writeWorldState({
    world,
    updates: {
      currentChatId: chat.id
    }
  });
  return chat;
}
async function persistCompletedChat({ chat, messages, setCurrent = true, agentId }) {
  const world = await ensureWorldBootstrap();
  const selectedAgentId = normalizeAgentId2(agentId ?? world.defaultAgentId);
  const persistedChat = await persistWorldChat({
    id: chat.id,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages
  }, selectedAgentId);
  if (setCurrent) {
    await writeWorldState({
      world,
      updates: {
        currentChatId: chat.id
      }
    });
  }
  return persistedChat;
}
function createEmptyQueueState() {
  return {
    paused: false,
    rows: [],
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function normalizeQueueState(value) {
  if (!value || typeof value !== "object") {
    return createEmptyQueueState();
  }
  return {
    paused: value.paused === true,
    rows: Array.isArray(value.rows) ? value.rows : [],
    updatedAt: String(value.updatedAt ?? (/* @__PURE__ */ new Date()).toISOString())
  };
}
async function readQueueState(chatId) {
  const existingState = await readJsonIfPresent(buildWorldQueuePath(chatId));
  return normalizeQueueState(existingState);
}
async function writeQueueState(chatId, state) {
  const nextState = {
    paused: state.paused === true,
    rows: state.rows,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeJsonAtomic(buildWorldQueuePath(chatId), nextState);
  return nextState;
}
async function listQueueChatIds(chatId) {
  const normalizedChatId = String(chatId ?? "").trim();
  if (normalizedChatId) {
    return [normalizedChatId];
  }
  try {
    const entries = await fs3.readdir(AGENT_WORLD_QUEUES_ROOT, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name.replace(/\.json$/u, "")).sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
function normalizeQueueRow(chatId, row) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return {
    messageId: String(row.messageId ?? "").trim() || createMessageId(),
    chatId,
    content: String(row.content ?? ""),
    sender: String(row.sender ?? "human").trim() || "human",
    status: ["queued", "sending", "error", "cancelled"].includes(String(row.status ?? "")) ? String(row.status) : "queued",
    retryCount: Number.isInteger(Number(row.retryCount)) ? Number(row.retryCount) : 0,
    createdAt: normalizeTimestamp(row.createdAt, now),
    updatedAt: normalizeTimestamp(row.updatedAt, now)
  };
}
async function listQueuedMessages(options = {}) {
  await ensureWorldBootstrap();
  const chatIds = await listQueueChatIds(options.chatId);
  const rows = [];
  for (const chatId of chatIds) {
    const queueState = await readQueueState(chatId);
    rows.push(...queueState.rows.map((row) => normalizeQueueRow(chatId, row)));
  }
  return rows.sort((left, right) => {
    const leftTime = Date.parse(String(left.createdAt ?? ""));
    const rightTime = Date.parse(String(right.createdAt ?? ""));
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return String(left.messageId).localeCompare(String(right.messageId));
  });
}
async function addQueuedMessage({ chatId, content, sender = "human", messageId, status = "queued" }) {
  await ensureWorldBootstrap();
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  const queueState = await readQueueState(normalizedChatId);
  const row = normalizeQueueRow(normalizedChatId, {
    messageId,
    content,
    sender,
    status,
    retryCount: 0,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  await writeQueueState(normalizedChatId, {
    ...queueState,
    rows: [...queueState.rows, row]
  });
  return row;
}
async function updateQueuedMessage(messageId, updates) {
  await ensureWorldBootstrap();
  const normalizedMessageId = String(messageId ?? "").trim();
  if (!normalizedMessageId) {
    throw new Error("Missing queue message ID.");
  }
  const chatIds = await listQueueChatIds();
  for (const chatId of chatIds) {
    const queueState = await readQueueState(chatId);
    const rowIndex = queueState.rows.findIndex((row) => String(row.messageId ?? "") === normalizedMessageId);
    if (rowIndex < 0) {
      continue;
    }
    const nextRow = normalizeQueueRow(chatId, {
      ...queueState.rows[rowIndex],
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    const nextRows = [...queueState.rows];
    nextRows[rowIndex] = nextRow;
    await writeQueueState(chatId, {
      ...queueState,
      rows: nextRows
    });
    return nextRow;
  }
  throw new Error(`Missing queue message: ${normalizedMessageId}`);
}
async function removeQueuedMessage(messageId) {
  await ensureWorldBootstrap();
  const normalizedMessageId = String(messageId ?? "").trim();
  const chatIds = await listQueueChatIds();
  for (const chatId of chatIds) {
    const queueState = await readQueueState(chatId);
    const nextRows = queueState.rows.filter((row) => String(row.messageId ?? "") !== normalizedMessageId);
    if (nextRows.length === queueState.rows.length) {
      continue;
    }
    await writeQueueState(chatId, {
      ...queueState,
      rows: nextRows
    });
    return true;
  }
  return false;
}
async function clearQueuedMessages(chatId) {
  await ensureWorldBootstrap();
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  await writeQueueState(normalizedChatId, {
    paused: false,
    rows: []
  });
}
async function setQueuePaused(chatId, paused) {
  await ensureWorldBootstrap();
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  const queueState = await readQueueState(normalizedChatId);
  await writeQueueState(normalizedChatId, {
    ...queueState,
    paused: paused === true
  });
}
async function stopQueuedMessages(chatId) {
  await ensureWorldBootstrap();
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  const queueState = await readQueueState(normalizedChatId);
  await writeQueueState(normalizedChatId, {
    paused: true,
    rows: queueState.rows.map((row) => normalizeQueueRow(normalizedChatId, {
      ...row,
      status: String(row.status ?? "") === "queued" ? "cancelled" : row.status,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }))
  });
}
async function loadQueueState(chatId) {
  await ensureWorldBootstrap();
  const normalizedChatId = String(chatId ?? "").trim();
  if (!normalizedChatId) {
    throw new Error("Missing chat ID.");
  }
  const queueState = await readQueueState(normalizedChatId);
  return {
    ...queueState,
    rows: queueState.rows.map((row) => normalizeQueueRow(normalizedChatId, row))
  };
}

// core/agent-world-runtime.ts
var EVENT_NAME = "world-event";
function nowIsoString() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function normalizeMentionToken(value) {
  return String(value || "").trim().replace(/[,:;.!?]+$/g, "").replace(/\s+/g, "-").toLowerCase();
}
function parseParagraphBeginningMention(line) {
  const trimmed = line.trimStart();
  if (!trimmed) {
    return null;
  }
  const withoutGreetingPrefix = trimmed.replace(/^(?:hey|hi|hello|to)\s+/i, "");
  const directMatch = /^@([A-Za-z0-9][A-Za-z0-9_-]*)\b/.exec(withoutGreetingPrefix);
  if (!directMatch?.[1]) {
    return null;
  }
  let mention = directMatch[1];
  if (!mention.includes("-") && !mention.includes("_") && /^[A-Z]/.test(mention)) {
    const remainder = withoutGreetingPrefix.slice(directMatch[0].length);
    const nextWordMatch = /^\s+([A-Z][A-Za-z0-9_-]*)\b/.exec(remainder);
    if (nextWordMatch?.[1]) {
      mention += ` ${nextWordMatch[1]}`;
    }
  }
  return normalizeMentionToken(mention);
}
function extractParagraphBeginningMentions(content) {
  const mentions = [];
  for (const line of String(content || "").split(/\n/u)) {
    const mention = parseParagraphBeginningMention(line);
    if (mention) {
      mentions.push(mention);
    }
  }
  return mentions;
}
function extractFirstInlineMention(content) {
  const match = /@(\w+(?:[-_]\w+)*)/u.exec(String(content || ""));
  return match?.[1] ? normalizeMentionToken(match[1]) : null;
}
function dedupe(values) {
  const seen = /* @__PURE__ */ new Set();
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
    role: String(message?.role ?? ""),
    content: String(message?.content ?? ""),
    ...agentId ? { agentId } : {},
    ...chatId ? { chatId } : {}
  };
}
var AgentWorldRuntime = class {
  eventEmitter = new EventEmitter();
  eventLog = [];
  subscriptions = /* @__PURE__ */ new Map();
  processingChats = /* @__PURE__ */ new Set();
  queueProcessingChats = /* @__PURE__ */ new Set();
  blockedQueueChats = /* @__PURE__ */ new Set();
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
      loadWorld: async () => this.loadSnapshot()
    };
    this.world = {
      get: async () => this.loadSnapshot(),
      update: async (patch) => {
        const updated = await updateWorldMetadata(patch);
        return updated;
      },
      export: async () => this.loadSnapshot()
    };
    this.agents = {
      list: async () => listAgentMetadata(),
      create: async (input) => {
        const agent = await createAgentMetadata({
          agentId: String(input.agentId ?? input.id ?? "").trim(),
          name: typeof input.name === "string" ? input.name : void 0,
          provider: typeof input.provider === "string" ? input.provider : void 0,
          model: typeof input.model === "string" ? input.model : void 0,
          setDefault: input.setDefault === true
        });
        this.emit({ type: "agent_created", agentId: agent.id, createdAt: nowIsoString() });
        return agent;
      },
      update: async (agentId, patch) => {
        const agent = await updateAgentMetadata(agentId, patch);
        this.emit({ type: "agent_updated", agentId: agent.id, createdAt: nowIsoString() });
        return agent;
      },
      delete: async (agentId) => {
        await deleteAgentMetadata(agentId);
        this.emit({ type: "agent_deleted", agentId, createdAt: nowIsoString() });
        return { agentId, deleted: true };
      },
      import: async () => {
        throw new Error("Agent import is not implemented in the lean world runtime.");
      }
    };
    this.chats = {
      list: async () => listPersistedChats(),
      create: async () => {
        const chat = await createPersistedChat();
        const summary = this.summarizeChat(chat);
        this.emit({ type: "chat_created", chatId: chat.id, createdAt: nowIsoString() });
        return { chatId: chat.id, chat: summary };
      },
      select: async (chatId) => {
        const chat = await setCurrentChat(chatId);
        const summary = this.summarizeChat(chat);
        this.emit({ type: "chat_selected", chatId: chat.id, createdAt: nowIsoString() });
        return { chatId: chat.id, chat: summary };
      },
      branchFromMessage: async () => {
        throw new Error("Chat branching is not implemented in the lean world runtime.");
      },
      delete: async (chatId) => {
        const deleted = await deletePersistedChat(chatId);
        this.emit({ type: "chat_deleted", chatId, createdAt: nowIsoString() });
        return { chatId: deleted.chatId, deleted: true };
      },
      current: async () => {
        const snapshot = await this.loadSnapshot();
        return snapshot.chats.find((chat) => chat.id === snapshot.currentChatId) ?? null;
      }
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
        this.emit({ type: "queue_stopped", chatId: targetChatId, createdAt: nowIsoString() });
        return { chatId: targetChatId, stopped: true };
      },
      events: async (chatId) => {
        const normalizedChatId = String(chatId ?? "").trim();
        return normalizedChatId ? this.eventLog.filter((event) => "chatId" in event && event.chatId === normalizedChatId) : [...this.eventLog];
      }
    };
    this.queue = {
      list: async (chatId) => listQueuedMessages({ chatId }),
      add: async (content, sender = "human", chatId) => {
        const targetChatId = await this.resolveChatId(chatId);
        const row = await addQueuedMessage({ chatId: targetChatId, content, sender });
        this.emit({ type: "queue_added", chatId: targetChatId, queueMessage: row, createdAt: nowIsoString() });
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
          type: "queue_removed",
          chatId: row?.chatId ?? "",
          ...row ? { queueMessage: row } : {},
          createdAt: nowIsoString()
        });
      },
      clear: async (chatId) => {
        const targetChatId = await this.resolveChatId(chatId);
        await clearQueuedMessages(targetChatId);
        this.blockedQueueChats.delete(targetChatId);
        this.emit({ type: "queue_cleared", chatId: targetChatId, createdAt: nowIsoString() });
      },
      pause: async (chatId) => {
        const targetChatId = await this.resolveChatId(chatId);
        await setQueuePaused(targetChatId, true);
        this.emit({ type: "queue_paused", chatId: targetChatId, createdAt: nowIsoString() });
      },
      resume: async (chatId) => {
        const targetChatId = await this.resolveChatId(chatId);
        await setQueuePaused(targetChatId, false);
        this.emit({ type: "queue_resumed", chatId: targetChatId, createdAt: nowIsoString() });
        void this.processQueue(targetChatId);
      },
      stop: async (chatId) => {
        const targetChatId = await this.resolveChatId(chatId);
        await stopQueuedMessages(targetChatId);
        this.blockedQueueChats.delete(targetChatId);
        this.emit({ type: "queue_stopped", chatId: targetChatId, createdAt: nowIsoString() });
      },
      retry: async (messageId, chatId) => {
        const row = await updateQueuedMessage(messageId, {
          status: "queued",
          retryCount: 0
        });
        this.blockedQueueChats.delete(row.chatId);
        this.emit({ type: "queue_updated", chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
        void this.processQueue(chatId ?? row.chatId);
        return row;
      }
    };
    this.skills = {
      list: async () => loadSkillInventory(),
      listGitHub: async () => [],
      listLocal: async () => [],
      import: async () => {
        throw new Error("Skill import is not implemented in the lean world runtime.");
      },
      previewImport: async () => null,
      read: async () => {
        throw new Error("Skill read is not implemented in the lean world runtime.");
      },
      write: async () => {
        throw new Error("Skill write is not implemented in the lean world runtime.");
      },
      tree: async () => [],
      delete: async () => {
      }
    };
    this.heartbeat = {
      list: async () => [],
      run: async () => ({ ran: false }),
      pause: async () => {
      },
      stop: async () => {
      }
    };
    this.events = {
      subscribe: async (input = {}) => {
        const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const types = new Set((input.types ?? []).map((type) => String(type)));
        const chatId = String(input.chatId ?? "").trim();
        const listener = (event) => {
          if (types.size > 0 && !types.has(event.type)) {
            return;
          }
          if (chatId && (!("chatId" in event) || event.chatId !== chatId)) {
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
      }
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
      id: String(chat.id ?? ""),
      createdAt: String(chat.createdAt ?? ""),
      updatedAt: String(chat.updatedAt ?? ""),
      messageCount: Array.isArray(chat.messages) ? chat.messages.length : Number(chat.messageCount ?? 0)
    };
  }
  async resolveChatId(chatId) {
    const normalizedChatId = String(chatId ?? "").trim();
    if (normalizedChatId) {
      return normalizedChatId;
    }
    const snapshot = await this.loadSnapshot();
    if (snapshot.currentChatId) {
      return snapshot.currentChatId;
    }
    const chat = await createPersistedChat();
    this.emit({ type: "chat_created", chatId: chat.id, createdAt: nowIsoString() });
    return chat.id;
  }
  resolveAgentByMention(agents, mention) {
    const normalizedMention = normalizeMentionToken(mention);
    return agents.find((agent) => {
      const agentId = normalizeMentionToken(String(agent.id ?? ""));
      const agentName = normalizeMentionToken(String(agent.name ?? ""));
      return agentId === normalizedMention || agentName === normalizedMention;
    }) ?? null;
  }
  resolveSenderAgent(agents, sender) {
    const normalizedSender = normalizeMentionToken(sender);
    if (!normalizedSender || ["human", "user", "world"].includes(normalizedSender)) {
      return null;
    }
    return this.resolveAgentByMention(agents, normalizedSender);
  }
  async resolveRoutes(content, explicitAgentId, sender = "human") {
    const snapshot = await this.loadSnapshot();
    const agents = snapshot.agents;
    const senderAgent = this.resolveSenderAgent(agents, sender);
    if (explicitAgentId) {
      const agent = this.resolveAgentByMention(agents, explicitAgentId);
      return agent ? { agentIds: [agent.id], inlineMentionBlocked: false, unknownMentions: [] } : { agentIds: [], inlineMentionBlocked: false, unknownMentions: [explicitAgentId] };
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
        } else {
          unknownMentions.push(mention);
        }
      }
      if (agentIds.length === 0 && unknownMentions.length === 0 && senderAgent) {
        return {
          agentIds: [],
          inlineMentionBlocked: false,
          unknownMentions: [],
          error: "Agent self-messages do not trigger that same agent again."
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
        error: "Agent-originated messages require a paragraph-beginning @mention to route."
      };
    }
    const mainAgent = typeof snapshot.mainAgent === "string" ? snapshot.mainAgent : "";
    if (mainAgent) {
      const agent = this.resolveAgentByMention(agents, mainAgent);
      if (agent) {
        return { agentIds: [agent.id], inlineMentionBlocked: false, unknownMentions: [] };
      }
    }
    return {
      agentIds: [snapshot.defaultAgentId || "default"],
      inlineMentionBlocked: false,
      unknownMentions: []
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
      "World runtime context:",
      `- worldId: ${snapshot.id}`,
      `- currentChatId: ${chatId}`,
      `- activeAgentId: ${agentId}`,
      `- defaultAgentId: ${snapshot.defaultAgentId}`,
      typeof snapshot.mainAgent === "string" && snapshot.mainAgent ? `- mainAgent: ${snapshot.mainAgent}` : "",
      "- taskPlan: none persisted for this agent"
    ].filter(Boolean).join("\n");
  }
  async replaceChatMemory(chatId, messages) {
    const agentIds = dedupe(
      messages.map((message) => String(message.agentId ?? "").trim()).filter(Boolean)
    );
    const snapshot = await this.loadSnapshot();
    const fallbackAgentId = String(snapshot.defaultAgentId ?? "default").trim() || "default";
    const targetAgentIds = agentIds.length > 0 ? agentIds : [fallbackAgentId];
    for (const agentId of targetAgentIds) {
      await replaceAgentMemory({
        agentId,
        chatId,
        messages: messages.filter((message) => String(message.agentId ?? agentId) === agentId)
      });
    }
    const existingChat = await loadChatById(chatId).catch(() => ({ id: chatId, messages: [] }));
    await persistCompletedChat({
      chat: {
        id: chatId,
        createdAt: existingChat.createdAt,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      messages,
      setCurrent: false
    });
  }
  async truncateChatAtMessage(chatId, messageId) {
    const targetChatId = await this.resolveChatId(chatId);
    const normalizedMessageId = String(messageId ?? "").trim();
    if (!normalizedMessageId) {
      throw new Error("Missing message ID.");
    }
    const messages = await loadAgentMemory({ chatId: targetChatId });
    const targetIndex = messages.findIndex((message) => String(message.messageId ?? "") === normalizedMessageId);
    if (targetIndex < 0) {
      throw new Error(`Missing message: ${normalizedMessageId}`);
    }
    const targetMessage = messages[targetIndex];
    if (String(targetMessage.role ?? "") !== "user") {
      throw new Error("Only user message chains can be edited or deleted.");
    }
    const retainedMessages = messages.slice(0, targetIndex);
    await this.replaceChatMemory(targetChatId, retainedMessages);
    return {
      chatId: targetChatId,
      messageId: normalizedMessageId,
      retainedMessages,
      removedMessages: messages.slice(targetIndex),
      targetMessage
    };
  }
  async editMessage(chatId, messageId, content) {
    const normalizedContent = String(content ?? "").trim();
    if (!normalizedContent) {
      throw new Error("Missing message content.");
    }
    const truncated = await this.truncateChatAtMessage(chatId, messageId);
    this.emit({
      type: "message_edited",
      chatId: truncated.chatId,
      messageId: truncated.messageId,
      createdAt: nowIsoString()
    });
    const result = await this.dispatchMessage({
      chatId: truncated.chatId,
      content: normalizedContent,
      sender: String(truncated.targetMessage.sender ?? "human")
    });
    return {
      ...result,
      edited: true,
      messageId: truncated.messageId,
      removedCount: truncated.removedMessages.length
    };
  }
  async deleteMessageChain(chatId, messageId) {
    const truncated = await this.truncateChatAtMessage(chatId, messageId);
    this.emit({
      type: "message_deleted",
      chatId: truncated.chatId,
      messageId: truncated.messageId,
      createdAt: nowIsoString()
    });
    return {
      chatId: truncated.chatId,
      messageId: truncated.messageId,
      deleted: true,
      removedCount: truncated.removedMessages.length,
      messages: truncated.retainedMessages
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
    const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0 ? pastMessages : 0;
    this.emit({
      type: "run_started",
      chatId: params.chatId,
      agentId: params.agentId,
      createdAt: nowIsoString()
    });
    const result = await runChatTurn({
      chat: {
        ...existingChat,
        messages: contextMessages
      },
      userMessage: params.content,
      stream: params.stream !== false,
      historyMessageLimit,
      builtInSystemPrompt,
      workspaceSystemPrompt: [workspaceSystemPrompt, runtimeContextPrompt].filter(Boolean).join("\n\n"),
      skillInventory,
      agentConfig,
      onStreamChunk: (chunk) => {
        void params.onStreamChunk?.(chunk);
        if (chunk.content) {
          this.emit({
            type: "assistant_chunk",
            chatId: params.chatId,
            agentId: params.agentId,
            content: chunk.content,
            createdAt: nowIsoString()
          });
        }
      },
      onToolCall: (toolCall) => {
        void params.onToolCall?.(toolCall);
        this.emit({
          type: "tool_call",
          chatId: params.chatId,
          agentId: params.agentId,
          toolCall,
          createdAt: nowIsoString()
        });
      },
      onToolResult: (toolResult) => {
        void params.onToolResult?.(toolResult);
        this.emit({
          type: "tool_result",
          chatId: params.chatId,
          agentId: params.agentId,
          toolResult,
          createdAt: nowIsoString()
        });
      },
      ...this.handleToolCall ? { handleToolCall: this.handleToolCall } : {}
    });
    const previousLength = contextMessages.length;
    const newMessages = result.messages.slice(previousLength);
    await persistCompletedChat({
      chat: {
        id: params.chatId,
        createdAt: existingChat.createdAt,
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      messages: result.messages,
      agentId: params.agentId
    });
    await appendAgentMemory({
      agentId: params.agentId,
      chatId: params.chatId,
      messages: newMessages
    });
    for (const message of newMessages) {
      this.emit({
        type: "message",
        chatId: params.chatId,
        agentId: params.agentId,
        message: normalizeChatMessage(message, params.agentId, params.chatId),
        createdAt: nowIsoString()
      });
    }
    this.emit({
      type: "run_completed",
      chatId: params.chatId,
      agentId: params.agentId,
      createdAt: nowIsoString()
    });
    return result;
  }
  async sendMessage(input) {
    const content = String(input.content ?? input.message ?? "").trim();
    if (!content) {
      throw new Error("Message content is required.");
    }
    const chatId = await this.resolveChatId(input.chatId);
    const sender = String(input.sender ?? "human").trim() || "human";
    if (input.queue === true || this.processingChats.has(chatId)) {
      const row = await addQueuedMessage({ chatId, content, sender });
      this.emit({ type: "queue_added", chatId, queueMessage: row, createdAt: nowIsoString() });
      if (!this.processingChats.has(chatId)) {
        void this.processQueue(chatId);
      }
      return { chatId, agentIds: [], queued: true, queueMessage: row };
    }
    return await this.dispatchMessage({
      chatId,
      content,
      sender,
      stream: input.stream,
      agentId: input.agentId,
      onStreamChunk: input.onStreamChunk,
      onToolCall: input.onToolCall,
      onToolResult: input.onToolResult
    });
  }
  async dispatchMessage(params) {
    const route = await this.resolveRoutes(params.content, params.agentId, params.sender);
    if (route.error) {
      this.emit({ type: "queue_failed", chatId: params.chatId, error: route.error, createdAt: nowIsoString() });
      throw new Error(route.error);
    }
    if (route.inlineMentionBlocked) {
      const error = "Inline @mentions do not route messages. Put the mention at the beginning of a paragraph.";
      this.emit({ type: "queue_failed", chatId: params.chatId, error, createdAt: nowIsoString() });
      throw new Error(error);
    }
    if (route.unknownMentions.length > 0 || route.agentIds.length === 0) {
      const unknown = route.unknownMentions[0] ?? "unknown";
      const error = `No agent "@${unknown}" found in this world.`;
      this.emit({ type: "queue_failed", chatId: params.chatId, error, createdAt: nowIsoString() });
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
          onStreamChunk: params.onStreamChunk,
          onToolCall: params.onToolCall,
          onToolResult: params.onToolResult
        });
        assistantTexts.push(result.assistantText);
        messages = result.messages;
      }
      return {
        chatId: params.chatId,
        agentIds: route.agentIds,
        assistantText: assistantTexts.join("\n\n"),
        messages
      };
    } catch (error) {
      const firstAgentId = route.agentIds[0] ?? "default";
      this.emit({
        type: "run_failed",
        chatId: params.chatId,
        agentId: firstAgentId,
        error: error instanceof Error ? error.message : String(error),
        createdAt: nowIsoString()
      });
      throw error;
    } finally {
      this.processingChats.delete(params.chatId);
      await this.processQueue(params.chatId);
    }
  }
  async processQueue(chatId) {
    const targetChatId = String(chatId || "").trim();
    if (!targetChatId || this.processingChats.has(targetChatId) || this.queueProcessingChats.has(targetChatId) || this.blockedQueueChats.has(targetChatId)) {
      return;
    }
    this.queueProcessingChats.add(targetChatId);
    try {
      const queueState = await loadQueueState(targetChatId);
      if (queueState.paused) {
        return;
      }
      const nextRow = queueState.rows.find((row) => row.status === "sending") ?? queueState.rows.find((row) => row.status === "queued");
      if (!nextRow) {
        return;
      }
      let activeRow = nextRow;
      if (activeRow.status === "queued") {
        activeRow = await updateQueuedMessage(activeRow.messageId, { status: "sending" });
        this.emit({ type: "queue_updated", chatId: targetChatId, queueMessage: activeRow, createdAt: nowIsoString() });
      }
      try {
        await this.dispatchMessage({
          chatId: targetChatId,
          content: activeRow.content,
          sender: activeRow.sender
        });
        await removeQueuedMessage(activeRow.messageId);
        this.emit({ type: "queue_removed", chatId: targetChatId, queueMessage: activeRow, createdAt: nowIsoString() });
      } catch (error) {
        const failedRow = await updateQueuedMessage(activeRow.messageId, {
          status: "error",
          retryCount: Number(activeRow.retryCount ?? 0) + 1
        });
        this.emit({
          type: "queue_failed",
          chatId: targetChatId,
          queueMessage: failedRow,
          error: error instanceof Error ? error.message : String(error),
          createdAt: nowIsoString()
        });
      }
    } finally {
      this.queueProcessingChats.delete(targetChatId);
      const nextState = await loadQueueState(targetChatId).catch(() => null);
      if (nextState && !nextState.paused && nextState.rows.some((row) => row.status === "queued")) {
        void this.processQueue(targetChatId);
      }
    }
  }
  async resumeDurableQueues() {
    const rows = await listQueuedMessages();
    const chatIds = dedupe(rows.map((row) => row.chatId));
    for (const row of rows) {
      if (row.status === "sending") {
        const action = await this.resolveSendingRowRestartAction(row);
        if (action === "completed") {
          await removeQueuedMessage(row.messageId);
          this.emit({ type: "queue_removed", chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
        } else if (action === "blocked") {
          this.blockedQueueChats.add(row.chatId);
          this.emit({ type: "queue_updated", chatId: row.chatId, queueMessage: row, createdAt: nowIsoString() });
        } else {
          const recovered = await updateQueuedMessage(row.messageId, { status: "queued" });
          this.blockedQueueChats.delete(row.chatId);
          this.emit({ type: "queue_updated", chatId: row.chatId, queueMessage: recovered, createdAt: nowIsoString() });
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
      const userMessageIndex = messages.findIndex(
        (message) => String(message?.role ?? "") === "user" && String(message?.content ?? "") === row.content
      );
      if (userMessageIndex < 0) {
        return "retry";
      }
      const afterUser = messages.slice(userMessageIndex + 1);
      const assistantMessageIndex = afterUser.findIndex(
        (message) => String(message?.role ?? "") === "assistant"
      );
      if (assistantMessageIndex < 0) {
        return "retry";
      }
      const assistantMessage = afterUser[assistantMessageIndex];
      const toolCallIds = Array.isArray(assistantMessage?.tool_calls) ? assistantMessage.tool_calls.map((toolCall) => String(toolCall?.id ?? "").trim()).filter(Boolean) : [];
      if (toolCallIds.length === 0) {
        return "completed";
      }
      const answeredToolCallIds = new Set(
        afterUser.slice(assistantMessageIndex + 1).filter((message) => String(message?.role ?? "") === "tool").map((message) => String(message?.tool_call_id ?? "").trim()).filter(Boolean)
      );
      return toolCallIds.every((toolCallId) => answeredToolCallIds.has(toolCallId)) ? "completed" : "blocked";
    } catch {
      return "retry";
    }
  }
};
function createAgentWorldRuntime(options = {}) {
  return new AgentWorldRuntime(options);
}

// core/workspace-environment.ts
import path4 from "node:path";
import { config as loadDotEnvConfig } from "dotenv";
var DOTENV_ALLOWED_ENV_KEYS = /* @__PURE__ */ new Set([
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "XAI_API_KEY",
  "OPENAI_COMPATIBLE_API_KEY",
  "OPENAI_COMPATIBLE_BASE_URL",
  "OLLAMA_BASE_URL",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_RESOURCE_NAME",
  "AZURE_OPENAI_DEPLOYMENT_NAME",
  "AZURE_OPENAI_API_VERSION",
  "AGENT_CLI_RELAY_SERVER_URL"
]);
var loadedDotEnvRoots = /* @__PURE__ */ new Set();
function loadAllowedDotEnvEnvironment() {
  if (loadedDotEnvRoots.has(WORKSPACE_ROOT)) {
    return;
  }
  loadedDotEnvRoots.add(WORKSPACE_ROOT);
  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: path4.join(WORKSPACE_ROOT, ".env"),
    quiet: true
  }).parsed ?? {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!DOTENV_ALLOWED_ENV_KEYS.has(key)) {
      continue;
    }
    if (typeof process.env[key] === "string" && process.env[key].trim()) {
      continue;
    }
    process.env[key] = value;
  }
}
function readWorkspaceRootDotEnvFallback() {
  if (String(process.env[WORKSPACE_ROOT_ENV_KEY] ?? "").trim() || String(process.env[LEGACY_PROJECT_ROOT_ENV_KEY] ?? "").trim()) {
    return void 0;
  }
  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: path4.join(process.cwd(), ".env"),
    quiet: true
  }).parsed ?? {};
  const workspaceRoot = String(parsed[WORKSPACE_ROOT_ENV_KEY] ?? "").trim();
  const legacyProjectRoot = String(parsed[LEGACY_PROJECT_ROOT_ENV_KEY] ?? "").trim();
  return workspaceRoot || legacyProjectRoot || void 0;
}
function prepareWorkspaceEnvironment(workspaceRoot) {
  const resolvedRoot = configureWorkspaceRoot(workspaceRoot ?? readWorkspaceRootDotEnvFallback());
  loadAllowedDotEnvEnvironment();
  return resolvedRoot;
}

// cli/src/human-input-ui.ts
var EXIT_HUMAN_INPUT_TOKEN = "0";
var HUMAN_INPUT_TOOL_NAMES = /* @__PURE__ */ new Set([
  "ask_user_input",
  "ask_human_input",
  "human_intervention_request",
  "ask_user_question"
]);
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJsonRecord(value) {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function readTrimmedString(record, fieldName) {
  const value = record?.[fieldName];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function sanitizeDisplayText(value) {
  return value.replace(/\s{2,}/g, " ").trim();
}
function parseHumanInputOption(value, index) {
  if (typeof value === "string" && value.trim()) {
    return {
      id: String(index + 1),
      label: sanitizeDisplayText(value)
    };
  }
  if (!isRecord(value)) {
    return null;
  }
  const label = readTrimmedString(value, "label") ?? readTrimmedString(value, "text");
  if (!label) {
    return null;
  }
  return {
    id: readTrimmedString(value, "id") ?? String(index + 1),
    label: sanitizeDisplayText(label),
    ...readTrimmedString(value, "description") ? { description: sanitizeDisplayText(readTrimmedString(value, "description") ?? "") } : {}
  };
}
function parseHumanInputQuestion(value, index) {
  if (!isRecord(value)) {
    return null;
  }
  const question = readTrimmedString(value, "question") ?? readTrimmedString(value, "prompt");
  if (!question) {
    return null;
  }
  const rawOptions = Array.isArray(value.options) ? value.options : [];
  const options = rawOptions.map(parseHumanInputOption).filter((option) => option !== null);
  return {
    header: readTrimmedString(value, "header") ?? "Input",
    id: readTrimmedString(value, "id") ?? `question-${index + 1}`,
    question: sanitizeDisplayText(question),
    options,
    ...value.allowFreeformInput === false ? { allowFreeformInput: false } : {}
  };
}
function normalizeQuestions(record) {
  if (Array.isArray(record.questions)) {
    return record.questions.map(parseHumanInputQuestion).filter((question) => question !== null);
  }
  const singleQuestion = parseHumanInputQuestion(record, 0);
  return singleQuestion ? [singleQuestion] : [];
}
function allowsFreeformInput(question) {
  return question.allowFreeformInput !== false;
}
function parseHumanInputRequest(toolName, payload, fallbackRequestId = "") {
  if (!HUMAN_INPUT_TOOL_NAMES.has(toolName)) {
    return null;
  }
  const record = parseJsonRecord(payload);
  if (!record) {
    return null;
  }
  const rawType = record.type;
  const type = rawType === "multiple-select" ? "multiple-select" : "single-select";
  if (rawType !== void 0 && rawType !== "single-select" && rawType !== "multiple-select") {
    return null;
  }
  const questions = normalizeQuestions(record);
  if (questions.length === 0) {
    return null;
  }
  return {
    toolName,
    requestId: readTrimmedString(record, "requestId") ?? fallbackRequestId,
    type,
    allowSkip: record.allowSkip === true,
    questions
  };
}
function resolveHumanInputOption(question, token) {
  const index = Number(token);
  if (Number.isInteger(index) && index >= 1 && index <= question.options.length) {
    return question.options[index - 1] ?? null;
  }
  return question.options.find((option) => option.id === token) ?? null;
}
function parseSelection(question, selectionType, allowSkip, rawInput) {
  const trimmedInput = rawInput.trim();
  if (!trimmedInput) {
    if (allowSkip) {
      return {
        questionId: question.id,
        questionText: question.question,
        skipped: true,
        selectedOptions: []
      };
    }
    return "Select an option before continuing.";
  }
  const tokens = trimmedInput.split(",").map((token) => token.trim()).filter(Boolean);
  if (selectionType === "single-select" && tokens.length !== 1) {
    if (allowsFreeformInput(question)) {
      return {
        questionId: question.id,
        questionText: question.question,
        skipped: false,
        selectedOptions: [],
        enteredText: trimmedInput
      };
    }
    return "Select exactly one option.";
  }
  const selectedOptions = [];
  for (const token of tokens) {
    const option = resolveHumanInputOption(question, token);
    if (!option) {
      if (allowsFreeformInput(question)) {
        return {
          questionId: question.id,
          questionText: question.question,
          skipped: false,
          selectedOptions: [],
          enteredText: trimmedInput
        };
      }
      return `Unknown option: ${token}`;
    }
    if (!selectedOptions.some((selectedOption) => selectedOption.id === option.id)) {
      selectedOptions.push(option);
    }
  }
  return {
    questionId: question.id,
    questionText: question.question,
    skipped: false,
    selectedOptions
  };
}
function formatHumanInputCheckpoint(request, question) {
  const lines = ["assistant needs input:", `  ${question.question}`, ""];
  question.options.forEach((option, index) => {
    const description = option.description ? ` - ${option.description}` : "";
    lines.push(`  ${index + 1}. ${option.label}${description}`);
  });
  lines.push(`  ${EXIT_HUMAN_INPUT_TOKEN}. Exit UI`);
  if (request.allowSkip) {
    lines.push("", "  Press Enter to skip.");
  }
  return `${lines.join("\n")}
`;
}
function createHumanInputPrompt(request, question) {
  const selectionHint = question.options.length === 0 ? "Type your answer" : request.type === "multiple-select" ? "Select numbers or option ids separated by commas" : "Select a number or option id";
  const freeformHint = allowsFreeformInput(question) ? ", or type a custom answer" : "";
  const skipHint = request.allowSkip ? ", or press Enter to skip" : "";
  return `${selectionHint}${freeformHint}${skipHint}. Enter ${EXIT_HUMAN_INPUT_TOKEN} to exit UI: `;
}
async function collectHumanInputAnswer(request, prompt, output) {
  if (!prompt) {
    return {
      ok: false,
      status: "unavailable",
      requestId: request.requestId,
      selections: [],
      message: "Interactive input is unavailable for ask_user_input."
    };
  }
  const selections = [];
  for (const question of request.questions) {
    output.write(`
${formatHumanInputCheckpoint(request, question)}`);
    while (true) {
      const rawSelection = await prompt.question(createHumanInputPrompt(request, question));
      if (rawSelection.trim() === EXIT_HUMAN_INPUT_TOKEN) {
        return {
          ok: false,
          status: "cancelled",
          requestId: request.requestId,
          selections,
          message: "User cancelled input."
        };
      }
      const selection = parseSelection(question, request.type, request.allowSkip, rawSelection);
      if (typeof selection !== "string") {
        selections.push(selection);
        break;
      }
      output.write(`${selection}
`);
    }
  }
  return {
    ok: true,
    status: selections.every((selection) => selection.skipped) ? "skipped" : "answered",
    requestId: request.requestId,
    selections
  };
}

// cli/src/pending-display.ts
function createPendingDisplay(output) {
  const frames = [".", "..", "..."];
  let frameIndex = frames.length - 1;
  let interval = null;
  let pendingVisible = false;
  let wroteText = false;
  const writeFrame = (frame) => {
    output.write(`\r\x1B[2K${frame}`);
  };
  const stop = () => {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  };
  return {
    start() {
      if (!output.isTTY || interval || pendingVisible) {
        return;
      }
      pendingVisible = true;
      frameIndex = frames.length - 1;
      output.write(frames[frameIndex] ?? "...");
      interval = setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        writeFrame(frames[frameIndex] ?? "...");
      }, 250);
      interval.unref?.();
    },
    clear() {
      stop();
      if (pendingVisible) {
        output.write("\r\x1B[2K");
        pendingVisible = false;
      }
    },
    writeText(text) {
      this.clear();
      if (text) {
        wroteText = true;
        output.write(text);
      }
    },
    hasWrittenText() {
      return wroteText;
    }
  };
}

// cli/src/tool-trace-renderer.ts
var MAX_COMMAND_WIDTH = 100;
var MAX_PREVIEW_LINES = 5;
var MAX_PREVIEW_LINE_WIDTH = 120;
var MAX_VERBOSE_JSON_WIDTH = 320;
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function stringifyCompact(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}
function parseJsonRecord2(value) {
  if (isRecord2(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord2(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function truncateOneLine(value, maxWidth) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxWidth) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxWidth - 1)).trimEnd()}...`;
}
function countLines(value) {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines.length;
}
function previewLines(value, maxLines = MAX_PREVIEW_LINES, maxWidth = MAX_PREVIEW_LINE_WIDTH) {
  const normalized = value.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trimEnd()).filter((line) => line.trim().length > 0).map((line) => truncateOneLine(line, maxWidth));
  const compactLines = lines.filter((line) => !/^[\[{]$|^[}\])][,]?$/.test(line.trim()));
  if (compactLines.length > 0) {
    return compactLines.slice(0, maxLines);
  }
  if (lines.length <= maxLines) {
    return lines;
  }
  const closingLine = lines.at(-1);
  if (closingLine && /^[}\])][,]?$/.test(closingLine.trim())) {
    return [
      ...lines.slice(0, maxLines),
      closingLine
    ];
  }
  return lines.slice(0, maxLines);
}
function readFirstString(record, ...keys) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}
function readFirstNumber(record, ...keys) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}
function readFirstBoolean(record, ...keys) {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}
function formatToken(token) {
  return /^[A-Za-z0-9_./:=@%-]+$/.test(token) ? token : JSON.stringify(token);
}
function compactJsonPreview(value, maxWidth = MAX_COMMAND_WIDTH) {
  const serialized = stringifyCompact(value);
  return truncateOneLine(serialized ?? String(value), maxWidth);
}
function formatLineCount(lineCount) {
  return `${lineCount} line${lineCount === 1 ? "" : "s"}`;
}
function formatRequestedLineSummary(args) {
  const record = parseJsonRecord2(args);
  if (!record) {
    return null;
  }
  const startLine = readFirstNumber(record, "startLine");
  const endLine = readFirstNumber(record, "endLine");
  if (startLine !== null && endLine !== null && startLine > 0 && endLine >= startLine) {
    return startLine === endLine ? `line ${startLine}` : `lines ${startLine}-${endLine}`;
  }
  if (startLine !== null && startLine > 0) {
    return `from line ${startLine}`;
  }
  if (endLine !== null && endLine > 0) {
    return `through line ${endLine}`;
  }
  return null;
}
function isReadFileLikeToolName(toolName) {
  return toolName === "read_file";
}
function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes >= 10 * 1024 ? 0 : 1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function extractMeaningfulLine(value) {
  if (typeof value !== "string") {
    if (isRecord2(value)) {
      return extractMeaningfulLine(
        readFirstString(value, "message", "error", "stderr", "stdout", "detail", "reason")
      );
    }
    return null;
  }
  const line = value.replace(/\r\n/g, "\n").split("\n").map((candidate) => candidate.trim()).find((candidate) => candidate.length > 0);
  return line ? truncateOneLine(line, MAX_PREVIEW_LINE_WIDTH) : null;
}
function summarizeShellInvocation(command, parameters) {
  if (/python(?:\d+(?:\.\d+)*)?$/.test(command) && parameters[0] === "-c") {
    const remainder = parameters.slice(2).map(formatToken);
    return truncateOneLine([command, "-c", JSON.stringify("..."), ...remainder].join(" "), MAX_COMMAND_WIDTH);
  }
  if (/node$/.test(command) && parameters[0] === "-e") {
    const remainder = parameters.slice(2).map(formatToken);
    return truncateOneLine([command, "-e", JSON.stringify("..."), ...remainder].join(" "), MAX_COMMAND_WIDTH);
  }
  return truncateOneLine([command, ...parameters.map(formatToken)].join(" "), MAX_COMMAND_WIDTH);
}
function summarizeShellToolCall(args) {
  const command = typeof args.command === "string" ? args.command : "shell";
  const parameters = Array.isArray(args.parameters) ? args.parameters.filter((value) => typeof value === "string") : [];
  return summarizeShellInvocation(command, parameters);
}
function summarizePathLikeCall(args, ...keys) {
  const value = readFirstString(args, ...keys);
  return value ? truncateOneLine(value, MAX_COMMAND_WIDTH) : compactJsonPreview(args);
}
function summarizePathExistsCall(args) {
  return summarizePathLikeCall(args, "path", "filePath");
}
function summarizeLoadSkillCall(args) {
  const skillId = readFirstString(args, "skillId", "id", "name");
  return skillId ? truncateOneLine(skillId, MAX_COMMAND_WIDTH) : compactJsonPreview(args);
}
function summarizeGenericCall(args) {
  const record = parseJsonRecord2(args);
  if (!record) {
    return typeof args === "undefined" ? "" : compactJsonPreview(args);
  }
  const value = readFirstString(record, "url", "path", "filePath", "query", "pattern", "glob");
  return value ? truncateOneLine(value, MAX_COMMAND_WIDTH) : compactJsonPreview(record);
}
function inferOk(record, fallback = true) {
  if (!record) {
    return fallback;
  }
  const ok = readFirstBoolean(record, "ok", "success");
  if (ok !== null) {
    return ok;
  }
  const exitCode = readFirstNumber(record, "exit_code", "exitCode", "code");
  if (exitCode !== null) {
    return exitCode === 0;
  }
  if (record.error !== void 0) {
    return false;
  }
  return fallback;
}
function countMatches(result) {
  if (Array.isArray(result)) {
    return result.length;
  }
  const record = parseJsonRecord2(result);
  if (!record) {
    return null;
  }
  for (const key of ["matches", "results", "files", "items", "entries"]) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.length;
    }
  }
  return readFirstNumber(record, "count", "matchCount", "total");
}
function summarizeShellToolResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const exitCode = readFirstNumber(record, "exit_code", "exitCode");
  const aborted = readFirstBoolean(record, "aborted") === true;
  const timedOut = readFirstBoolean(record, "timed_out", "timedOut") === true;
  const stdout = readFirstString(record, "stdout");
  const stderr = readFirstString(record, "stderr");
  const ok = !aborted && !timedOut && (exitCode === null ? inferOk(record, true) : exitCode === 0);
  if (timedOut) {
    return {
      name: "shell_cmd",
      ok: false,
      durationMs,
      summary: "timed out",
      preview: stderr ? previewLines(stderr, 3) : void 0,
      raw: result
    };
  }
  if (aborted) {
    return {
      name: "shell_cmd",
      ok: false,
      durationMs,
      summary: "aborted",
      preview: stderr ? previewLines(stderr, 3) : void 0,
      raw: result
    };
  }
  if (!ok) {
    return {
      name: "shell_cmd",
      ok: false,
      durationMs,
      summary: extractMeaningfulLine(stderr) ?? extractMeaningfulLine(record?.error) ?? extractMeaningfulLine(stdout) ?? (exitCode === null ? "command failed" : `exit ${exitCode}`),
      preview: stderr ? previewLines(stderr, 3) : void 0,
      raw: result
    };
  }
  if (stdout) {
    const lineCount = countLines(stdout);
    return {
      name: "shell_cmd",
      ok: true,
      durationMs,
      summary: `stdout ${formatLineCount(lineCount)}`,
      preview: previewLines(stdout, Math.min(MAX_PREVIEW_LINES, lineCount || 1)),
      raw: result
    };
  }
  return {
    name: "shell_cmd",
    ok: true,
    durationMs,
    summary: exitCode === null ? "completed" : `exit ${exitCode}`,
    raw: result
  };
}
function summarizeSearchFilesResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const count = countMatches(result);
  return {
    name: "search_files",
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0,
    summary: count === null ? "completed" : `${count} match${count === 1 ? "" : "es"}`,
    raw: result
  };
}
function summarizeReadFileResult(result, forcedDurationMs, callArgs, toolName = "read_file") {
  const record = parseJsonRecord2(result);
  const content = typeof result === "string" ? result : readFirstString(record, "content", "text", "result");
  const lineCount = content ? countLines(content) : null;
  return {
    name: toolName,
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0,
    summary: formatRequestedLineSummary(callArgs) ?? (lineCount === null ? "completed" : formatLineCount(lineCount)),
    raw: result
  };
}
function summarizePathExistsResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  const exists = readFirstBoolean(record, "exists");
  const path6 = readFirstString(record, "path", "filePath");
  const type = readFirstString(record, "type", "kind");
  const preview = [
    path6 ? truncateOneLine(`path: ${path6}`, MAX_PREVIEW_LINE_WIDTH) : null,
    type ? `type: ${type}` : null
  ].filter((line) => line !== null);
  return {
    name: "path_exists",
    ok,
    durationMs,
    summary: exists === null ? ok ? "completed" : "failed" : String(exists),
    ...preview.length > 0 ? { preview } : {},
    raw: result
  };
}
function summarizeWriteFileResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const bytes = readFirstNumber(record, "bytesWritten", "bytes", "size") ?? (typeof result === "string" ? Buffer.byteLength(result, "utf8") : null);
  return {
    name: "write_file",
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0,
    summary: bytes === null ? "written" : `${formatFileSize(bytes)} written`,
    raw: result
  };
}
function summarizeListFilesResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const entryCount = countMatches(result) ?? readFirstNumber(record, "entryCount", "lineCount") ?? (typeof result === "string" ? countLines(result) : null);
  return {
    name: "list_files",
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0,
    summary: entryCount === null ? "completed" : formatLineCount(entryCount),
    raw: result
  };
}
function summarizeCreateDirectoryResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const status = readFirstString(record, "status", "message");
  return {
    name: "create_directory",
    ok: inferOk(record, true),
    durationMs: forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0,
    summary: status ? truncateOneLine(status, MAX_PREVIEW_LINE_WIDTH) : "completed",
    raw: result
  };
}
function summarizeApiRequestResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  const bodySaved = readFirstBoolean(record, "bodySaved") === true;
  const bodyFilePath = readFirstString(record, "bodyFilePath");
  if (ok && bodySaved && bodyFilePath) {
    return {
      name: "api_request",
      ok,
      durationMs,
      summary: `completed \xB7 saved to ${truncateOneLine(bodyFilePath, MAX_PREVIEW_LINE_WIDTH)}`,
      raw: result
    };
  }
  return summarizeGenericToolResult(result, "api_request", forcedDurationMs);
}
function summarizeApiRequestOutputPathFailure(result, forcedDurationMs, callArgs) {
  const record = parseJsonRecord2(result);
  const errorText = readFirstString(record, "error", "message", "detail");
  const args = parseJsonRecord2(callArgs);
  const outputFilePath = readFirstString(args, "outputFilePath");
  if (!errorText || !outputFilePath) {
    return null;
  }
  if (!/api_request outputFilePath must /i.test(errorText)) {
    return null;
  }
  return {
    name: "api_request",
    ok: false,
    durationMs: forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0,
    summary: `cannot save to: ${truncateOneLine(outputFilePath, MAX_PREVIEW_LINE_WIDTH)}`,
    raw: result
  };
}
function readDataField(result) {
  const record = parseJsonRecord2(result);
  return record?.data;
}
function summarizeResolveObjectResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  if (!ok) {
    return summarizeGenericToolResult(result, "resolve_object", forcedDurationMs);
  }
  const data = readDataField(result);
  const matches = Array.isArray(data) ? data.filter(isRecord2) : [];
  const first = matches[0];
  const displayName = readFirstString(first ?? null, "displayName");
  const canonicalPath = readFirstString(first ?? null, "canonicalPath");
  const preview = displayName || canonicalPath ? [truncateOneLine([displayName, canonicalPath].filter((value) => !!value).join(" \xB7 "), MAX_PREVIEW_LINE_WIDTH)] : void 0;
  return {
    name: "resolve_object",
    ok: true,
    durationMs,
    summary: `${matches.length} match${matches.length === 1 ? "" : "es"}`,
    preview,
    raw: result
  };
}
function summarizeSearchContentResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  if (!ok) {
    return summarizeGenericToolResult(result, "search_content", forcedDurationMs);
  }
  const data = readDataField(result);
  const matches = Array.isArray(data) ? data.filter(isRecord2) : [];
  const firstPath = readFirstString(matches[0] ?? null, "path");
  return {
    name: "search_content",
    ok: true,
    durationMs,
    summary: `${matches.length} match${matches.length === 1 ? "" : "es"}`,
    preview: firstPath ? [truncateOneLine(firstPath, MAX_PREVIEW_LINE_WIDTH)] : void 0,
    raw: result
  };
}
function summarizeListContentResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  if (!ok) {
    return summarizeGenericToolResult(result, "list_content", forcedDurationMs);
  }
  const data = readDataField(result);
  const entries = Array.isArray(data) ? data.filter(isRecord2) : [];
  const firstPath = readFirstString(entries[0] ?? null, "path");
  return {
    name: "list_content",
    ok: true,
    durationMs,
    summary: `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`,
    preview: firstPath ? [truncateOneLine(firstPath, MAX_PREVIEW_LINE_WIDTH)] : void 0,
    raw: result
  };
}
function summarizeReadContentResult(result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  if (!ok) {
    return summarizeGenericToolResult(result, "read_content", forcedDurationMs);
  }
  const data = parseJsonRecord2(readDataField(result));
  const contentType = readFirstString(data, "contentType") ?? "content";
  const contentEncoding = readFirstString(data, "contentEncoding") ?? "utf8";
  const path6 = readFirstString(data, "path");
  const content = readFirstString(data, "content");
  const sizeSummary = contentEncoding === "base64" ? "base64" : content === null ? null : formatLineCount(countLines(content));
  const summary = sizeSummary ? `${contentType} \xB7 ${sizeSummary}` : contentType;
  return {
    name: "read_content",
    ok: true,
    durationMs,
    summary,
    preview: path6 ? [`path: ${truncateOneLine(path6, MAX_PREVIEW_LINE_WIDTH - 6)}`] : void 0,
    raw: result
  };
}
function summarizeAiwContentMutationResult(toolName, result, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  if (!ok) {
    return summarizeGenericToolResult(result, toolName, forcedDurationMs);
  }
  const data = isRecord2(record?.data) ? record.data : null;
  const path6 = readFirstString(data, "path") ?? readFirstString(record, "path");
  const summary = toolName === "delete_content" ? "deleted" : toolName === "create_content" || readFirstBoolean(data, "created") === true ? "created" : "updated";
  return {
    name: toolName,
    ok: true,
    durationMs,
    summary: path6 ? `${summary} \xB7 ${truncateOneLine(path6, MAX_PREVIEW_LINE_WIDTH)}` : summary,
    raw: result
  };
}
function summarizeGenericToolResult(result, toolName, forcedDurationMs) {
  const record = parseJsonRecord2(result);
  const durationMs = forcedDurationMs ?? readFirstNumber(record, "duration_ms", "durationMs") ?? void 0;
  const ok = inferOk(record, true);
  const textPreview = typeof result === "string" ? result : readFirstString(record, "stdout", "stderr", "text", "content", "message", "result", "detail");
  if (!ok) {
    return {
      name: toolName,
      ok: false,
      durationMs,
      summary: extractMeaningfulLine(record?.error) ?? extractMeaningfulLine(textPreview) ?? "failed",
      preview: textPreview ? previewLines(textPreview, 3) : void 0,
      raw: result
    };
  }
  if (textPreview) {
    const lineCount = countLines(textPreview);
    return {
      name: toolName,
      ok: true,
      durationMs,
      summary: lineCount > 1 ? formatLineCount(lineCount) : truncateOneLine(textPreview, MAX_PREVIEW_LINE_WIDTH),
      preview: lineCount > 1 ? previewLines(textPreview, 3) : void 0,
      raw: result
    };
  }
  const status = readFirstString(record, "status", "message");
  return {
    name: toolName,
    ok,
    durationMs,
    summary: status ? truncateOneLine(status, MAX_PREVIEW_LINE_WIDTH) : ok ? "completed" : "failed",
    raw: result
  };
}
function rawFieldLines(record) {
  return Object.entries(record).map(([key, value]) => {
    const serialized = stringifyCompact(value);
    return serialized ? `  ${key}: ${serialized}` : null;
  }).filter((line) => line !== null);
}
function formatRawCallPayload(toolName, args) {
  if (toolName === "shell_cmd" && isRecord2(args)) {
    const lines = [];
    if (typeof args.command === "string") {
      lines.push(`  command: ${JSON.stringify(args.command)}`);
    }
    if (Array.isArray(args.parameters)) {
      lines.push(`  args: ${JSON.stringify(args.parameters)}`);
    }
    for (const key of ["directory", "timeout", "output_format", "output_detail"]) {
      if (args[key] !== void 0) {
        const serialized = stringifyCompact(args[key]);
        if (serialized) {
          lines.push(`  ${key}: ${serialized}`);
        }
      }
    }
    return lines.length > 0 ? `
${lines.join("\n")}` : "";
  }
  if (isRecord2(args)) {
    const lines = rawFieldLines(args);
    return lines.length > 0 ? `
${lines.join("\n")}` : "";
  }
  if (typeof args === "string") {
    return `
  result: ${JSON.stringify(args)}`;
  }
  return "";
}
function formatRawResultPayload(result) {
  const record = parseJsonRecord2(result);
  if (record) {
    const lines = rawFieldLines(record);
    return lines.length > 0 ? `
${lines.join("\n")}` : "";
  }
  if (typeof result === "string") {
    return `
  result: ${JSON.stringify(result)}`;
  }
  return "";
}
function summarizeToolCall(toolName, args) {
  const record = parseJsonRecord2(args);
  if (toolName === "shell_cmd" && record) {
    return { name: toolName, summary: summarizeShellToolCall(record), args: record };
  }
  if (toolName === "load_skill" && record) {
    return { name: toolName, summary: summarizeLoadSkillCall(record), args: record };
  }
  if (toolName === "path_exists" && record) {
    return { name: toolName, summary: summarizePathExistsCall(record), args: record };
  }
  if (toolName === "search_files" && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, "query", "pattern", "glob", "includePattern"), args: record };
  }
  if (toolName === "list_files" && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, "requestedPath", "path", "filePath"), args: record };
  }
  if (isReadFileLikeToolName(toolName) && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, "filePath", "path"), args: record };
  }
  if ((toolName === "write_file" || toolName === "create_directory") && record) {
    return { name: toolName, summary: summarizePathLikeCall(record, "filePath", "path"), args: record };
  }
  return { name: toolName, summary: summarizeGenericCall(args), args };
}
function summarizeToolResult(toolName, result, durationMs, callArgs) {
  if (toolName === "shell_cmd") {
    return summarizeShellToolResult(result, durationMs);
  }
  if (toolName === "search_files") {
    return summarizeSearchFilesResult(result, durationMs);
  }
  if (isReadFileLikeToolName(toolName)) {
    return summarizeReadFileResult(result, durationMs, callArgs, toolName);
  }
  if (toolName === "path_exists") {
    return summarizePathExistsResult(result, durationMs);
  }
  if (toolName === "write_file") {
    return summarizeWriteFileResult(result, durationMs);
  }
  if (toolName === "list_files") {
    return summarizeListFilesResult(result, durationMs);
  }
  if (toolName === "create_directory") {
    return summarizeCreateDirectoryResult(result, durationMs);
  }
  if (toolName === "api_request") {
    return summarizeApiRequestOutputPathFailure(result, durationMs, callArgs) ?? summarizeApiRequestResult(result, durationMs);
  }
  if (toolName === "resolve_object") {
    return summarizeResolveObjectResult(result, durationMs);
  }
  if (toolName === "search_content") {
    return summarizeSearchContentResult(result, durationMs);
  }
  if (toolName === "list_content") {
    return summarizeListContentResult(result, durationMs);
  }
  if (toolName === "read_content") {
    return summarizeReadContentResult(result, durationMs);
  }
  if (toolName === "write_content" || toolName === "create_content" || toolName === "delete_content") {
    return summarizeAiwContentMutationResult(toolName, result, durationMs);
  }
  return summarizeGenericToolResult(result, toolName, durationMs);
}
function renderToolCall(view, mode) {
  if (mode === "debug") {
    return `
[tool.call] ${view.name}${formatRawCallPayload(view.name, view.args)}`;
  }
  const lines = [`  \u21B3 ${view.name}${view.summary ? ` ${view.summary}` : ""}`];
  if (mode === "verbose" && typeof view.args !== "undefined") {
    lines.push(`    args: ${compactJsonPreview(view.args, MAX_VERBOSE_JSON_WIDTH)}`);
  }
  return `
${lines.join("\n")}`;
}
function renderToolResult(view, mode) {
  if (mode === "debug") {
    return `
[tool.result] ${view.name}${formatRawResultPayload(view.raw)}
`;
  }
  const statusIcon = view.ok ? "\u2713" : "\u2717";
  const parts = [];
  if (typeof view.durationMs === "number" && Number.isFinite(view.durationMs)) {
    parts.push(`${Math.round(view.durationMs)}ms`);
  }
  parts.push(view.summary || (view.ok ? "completed" : "failed"));
  const lines = [`  ${statusIcon} ${view.name} ${parts.join(" \xB7 ")}`];
  for (const previewLine of view.preview ?? []) {
    lines.push(`    ${previewLine}`);
  }
  if (mode === "verbose" && typeof view.raw !== "undefined") {
    lines.push(`    raw: ${compactJsonPreview(view.raw, MAX_VERBOSE_JSON_WIDTH)}`);
  }
  return `
${lines.join("\n")}
`;
}
function formatToolCallDiagnostic(toolCall, mode = "default") {
  const view = summarizeToolCall(toolCall.name, toolCall.arguments);
  return renderToolCall(view, mode);
}
function formatToolResultDiagnostic(toolResult, mode = "default") {
  const view = summarizeToolResult(toolResult.name, toolResult.result, toolResult.durationMs, toolResult.arguments);
  return renderToolResult(view, mode);
}

// cli/src/agent-world-cli.ts
var VALUE_FLAGS = /* @__PURE__ */ new Set(["workspace", "project", "name", "provider", "model", "chat", "agent"]);
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set(["default", "queue", "help"]);
function usageText() {
  return [
    "agent-world-cli commands:",
    "  agent-world-cli [--workspace <path>] <command>",
    "  agent-world-cli [--project <path>] <command>",
    "  help",
    "  interactive",
    "  world",
    "  agents list",
    "  agents create <agentId> [--name <name>] [--provider <provider>] [--model <model>] [--default]",
    "  agents delete <agentId>",
    "  chats list",
    "  chats new",
    "  chats use <chatId>",
    "  chats delete <chatId>",
    "  messages list [chatId]",
    "  messages edit <chatId> <messageId> <message...>",
    "  messages delete-from <chatId> <messageId>",
    "  send [--chat <chatId>] [--agent <agentId>] [--queue] <message...>",
    "  queue list [chatId]",
    "  queue pause|resume|stop|clear [chatId]"
  ].join("\n");
}
function interactiveHelpText() {
  return [
    "agent-world-cli interactive commands:",
    "  /help",
    "  /world",
    "  /agents list",
    "  /agents create <agentId> [--name <name>] [--provider <provider>] [--model <model>] [--default]",
    "  /agents delete <agentId>",
    "  /chats list",
    "  /new",
    "  /use <chatId>",
    "  /delete-chat <chatId>",
    "  /messages [chatId]",
    "  /edit <chatId> <messageId> <message...>",
    "  /delete <chatId> <messageId>",
    "  /send [--chat <chatId>] [--agent <agentId>] [--queue] <message...>",
    "  /queue [chatId]",
    "  /pause [chatId]",
    "  /resume [chatId]",
    "  /stop [chatId]",
    "  /clear [chatId]",
    "  /exit",
    "Plain text sends a message to the current chat."
  ].join("\n");
}
function defaultIo() {
  return {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr
  };
}
function writeJson(io, value) {
  io.stdout.write(`${JSON.stringify(value, null, 2)}
`);
}
function writeText(io, value) {
  io.stdout.write(`${value}
`);
}
function setRuntimeToolCallHandler(runtime, handler) {
  const runtimeWithToolHandler = runtime;
  runtimeWithToolHandler.setToolCallHandler?.(handler);
}
function createHumanInputToolHandler(prompt, io) {
  return async ({ toolCall, toolName, arguments: toolArguments }) => {
    const request = parseHumanInputRequest(toolName, toolArguments ?? "{}", String(toolCall.id ?? ""));
    if (!request) {
      return void 0;
    }
    const result = await collectHumanInputAnswer(request, prompt, {
      write: (chunk) => {
        io.stdout.write(chunk);
      }
    });
    return {
      handled: true,
      result
    };
  };
}
function parseArgs(argv) {
  const command = [];
  const flags = /* @__PURE__ */ new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token === "--") {
      command.push(...argv.slice(index + 1));
      break;
    }
    if (token === "-h") {
      flags.set("help", true);
      continue;
    }
    if (token.startsWith("--")) {
      const flagBody = token.slice(2);
      const equalsIndex = flagBody.indexOf("=");
      const flag = equalsIndex >= 0 ? flagBody.slice(0, equalsIndex) : flagBody;
      const inlineValue = equalsIndex >= 0 ? flagBody.slice(equalsIndex + 1) : void 0;
      if (BOOLEAN_FLAGS.has(flag)) {
        if (inlineValue !== void 0) {
          throw new Error(`Option --${flag} does not accept a value`);
        }
        flags.set(flag, true);
        continue;
      }
      if (!VALUE_FLAGS.has(flag)) {
        throw new Error(`Unknown option: --${flag}`);
      }
      const value = inlineValue ?? argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for --${flag}`);
      }
      flags.set(flag, value);
      if (inlineValue === void 0) {
        index += 1;
      }
      continue;
    }
    command.push(token);
  }
  return { command, flags };
}
function splitCommandLine(input) {
  const tokens = [];
  let current = "";
  let quote = "";
  let escaping = false;
  for (const character of String(input ?? "")) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = "";
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/u.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (escaping) {
    current += "\\";
  }
  if (quote) {
    throw new Error("Unterminated quoted string.");
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}
function flagString(flags, name) {
  const value = flags.get(name);
  return typeof value === "string" ? value : void 0;
}
function flagBoolean(flags, name) {
  return flags.get(name) === true;
}
function requireValue(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`Missing ${label}.`);
  }
  return normalized;
}
async function sendMessageWithInteractiveDisplay(runtime, input, io) {
  const pendingDisplay = createPendingDisplay(io.stdout);
  pendingDisplay.start();
  try {
    const result = await runtime.messages.send({
      ...input,
      onStreamChunk: (chunk) => {
        if (chunk.content) {
          pendingDisplay.writeText(chunk.content);
        }
      },
      onToolCall: (toolCall) => {
        pendingDisplay.clear();
        io.stderr.write(formatToolCallDiagnostic(toolCall));
      },
      onToolResult: (toolResult) => {
        pendingDisplay.clear();
        io.stderr.write(formatToolResultDiagnostic(toolResult));
      }
    });
    if (pendingDisplay.hasWrittenText()) {
      io.stdout.write("\n");
    } else if (result.assistantText) {
      pendingDisplay.clear();
      io.stdout.write(`${result.assistantText}
`);
    } else {
      pendingDisplay.clear();
    }
    return result;
  } catch (error) {
    pendingDisplay.clear();
    throw error;
  }
}
async function executeAgentWorldCommand(parsed, io, runtime, options = {}) {
  const [area, action, ...rest] = parsed.command;
  if (!area || area === "help" || flagBoolean(parsed.flags, "help")) {
    writeText(io, usageText());
    return 0;
  }
  if (area === "world") {
    writeJson(io, await runtime.world.get());
    return 0;
  }
  if (area === "agents") {
    if (action === "list") {
      writeJson(io, await runtime.agents.list());
      return 0;
    }
    if (action === "create") {
      const agentId = requireValue(rest[0], "agent ID");
      const input = {
        agentId,
        setDefault: flagBoolean(parsed.flags, "default")
      };
      const name = flagString(parsed.flags, "name");
      const provider = flagString(parsed.flags, "provider");
      const model = flagString(parsed.flags, "model");
      if (name) input.name = name;
      if (provider) input.provider = provider;
      if (model) input.model = model;
      writeJson(io, await runtime.agents.create(input));
      return 0;
    }
    if (action === "delete") {
      writeJson(io, await runtime.agents.delete(requireValue(rest[0], "agent ID")));
      return 0;
    }
  }
  if (area === "chats") {
    if (action === "list") {
      writeJson(io, await runtime.chats.list());
      return 0;
    }
    if (action === "new") {
      writeJson(io, await runtime.chats.create());
      return 0;
    }
    if (action === "use") {
      writeJson(io, await runtime.chats.select(requireValue(rest[0], "chat ID")));
      return 0;
    }
    if (action === "delete") {
      writeJson(io, await runtime.chats.delete(requireValue(rest[0], "chat ID")));
      return 0;
    }
  }
  if (area === "messages" && action === "list") {
    writeJson(io, await runtime.messages.list(rest[0]));
    return 0;
  }
  if (area === "messages" && action === "edit") {
    const chatId = requireValue(rest[0], "chat ID");
    const messageId = requireValue(rest[1], "message ID");
    const content = requireValue(rest.slice(2).join(" "), "message");
    writeJson(io, await runtime.messages.edit(chatId, messageId, content));
    return 0;
  }
  if (area === "messages" && action === "delete-from") {
    const chatId = requireValue(rest[0], "chat ID");
    const messageId = requireValue(rest[1], "message ID");
    writeJson(io, await runtime.messages.deleteFrom(chatId, messageId));
    return 0;
  }
  if (area === "send") {
    const content = requireValue([action, ...rest].filter(Boolean).join(" "), "message");
    const chatId = flagString(parsed.flags, "chat");
    if (flagBoolean(parsed.flags, "queue")) {
      const row = await runtime.queue.add(content, "human", chatId);
      writeJson(io, {
        chatId: row.chatId,
        agentIds: [],
        queued: true,
        queueMessage: row
      });
      return 0;
    }
    const sendInput = {
      content,
      ...chatId ? { chatId } : {},
      ...flagString(parsed.flags, "agent") ? { agentId: flagString(parsed.flags, "agent") } : {}
    };
    const result = options.renderSendEvents ? await sendMessageWithInteractiveDisplay(runtime, sendInput, io) : await runtime.messages.send(sendInput);
    if (!options.suppressRenderedSendJson || !options.renderSendEvents) {
      writeJson(io, result);
    }
    return 0;
  }
  if (area === "queue") {
    if (action === "list") {
      writeJson(io, await runtime.queue.list(rest[0]));
      return 0;
    }
    if (action === "pause") {
      await runtime.queue.pause(rest[0]);
      writeJson(io, { paused: true, chatId: rest[0] ?? null });
      return 0;
    }
    if (action === "resume") {
      await runtime.queue.resume(rest[0]);
      writeJson(io, { resumed: true, chatId: rest[0] ?? null });
      return 0;
    }
    if (action === "stop") {
      await runtime.queue.stop(rest[0]);
      writeJson(io, { stopped: true, chatId: rest[0] ?? null });
      return 0;
    }
    if (action === "clear") {
      await runtime.queue.clear(rest[0]);
      writeJson(io, { cleared: true, chatId: rest[0] ?? null });
      return 0;
    }
  }
  throw new Error(`Unknown command: ${parsed.command.join(" ")}`);
}
function toInteractiveArgv(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) {
    return [];
  }
  if (!trimmed.startsWith("/")) {
    return ["send", trimmed];
  }
  const [command = "", ...rest] = splitCommandLine(trimmed.slice(1));
  switch (command) {
    case "exit":
    case "quit":
      return null;
    case "help":
      return ["interactive-help"];
    case "world":
      return ["world", ...rest];
    case "agents":
      return ["agents", ...rest];
    case "chats":
      return ["chats", ...rest];
    case "new":
      return ["chats", "new", ...rest];
    case "use":
      return ["chats", "use", ...rest];
    case "delete-chat":
      return ["chats", "delete", ...rest];
    case "messages":
      return ["messages", "list", ...rest];
    case "edit":
      return ["messages", "edit", ...rest];
    case "delete":
      return ["messages", "delete-from", ...rest];
    case "send":
      return ["send", ...rest];
    case "queue":
      return ["queue", "list", ...rest];
    case "pause":
    case "resume":
    case "stop":
    case "clear":
      return ["queue", command, ...rest];
    default:
      return [command, ...rest];
  }
}
async function buildInteractivePrompt(runtime) {
  const currentChat = await runtime.chats.current().catch(() => null);
  return currentChat?.id ? `agent-world:${currentChat.id}> ` : "agent-world> ";
}
async function executeInteractiveLine(line, runtime, io) {
  const argv = toInteractiveArgv(line);
  if (argv === null) {
    return false;
  }
  if (argv.length === 0) {
    return true;
  }
  if (argv[0] === "interactive-help") {
    writeText(io, interactiveHelpText());
    return true;
  }
  try {
    const parsed = parseArgs(argv);
    const isRenderedSend = parsed.command[0] === "send" && !flagBoolean(parsed.flags, "queue");
    await executeAgentWorldCommand(parsed, io, runtime, {
      renderSendEvents: isRenderedSend,
      suppressRenderedSendJson: true
    });
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  }
  return true;
}
async function runScriptedInteractiveInput(input, runtime, io) {
  await new Promise((resolve, reject) => {
    let buffer = "";
    let processing = Promise.resolve();
    let stopped = false;
    let resolved = false;
    let activeQuestionResolver = null;
    setRuntimeToolCallHandler(runtime, createHumanInputToolHandler({
      question: async (query) => {
        io.stdout.write(query);
        return await new Promise((questionResolve) => {
          activeQuestionResolver = questionResolve;
        });
      }
    }, io));
    const cleanup = () => {
      setRuntimeToolCallHandler(runtime, void 0);
      input.off("data", handleData);
      input.off("end", handleEnd);
      input.off("error", handleError);
    };
    const resolveAfterProcessing = () => {
      if (resolved) {
        return;
      }
      resolved = true;
      cleanup();
      processing.then(() => resolve(), reject);
    };
    const stopAfterProcessing = () => {
      stopped = true;
      if (typeof input.pause === "function") {
        input.pause();
      }
      if (typeof input.destroy === "function") {
        input.destroy();
      }
      resolveAfterProcessing();
    };
    const enqueueLine = (line) => {
      processing = processing.then(async () => {
        if (stopped || !line.trim()) {
          return;
        }
        const shouldContinue = await executeInteractiveLine(line, runtime, io);
        if (!shouldContinue) {
          stopAfterProcessing();
          return;
        }
        io.stdout.write(await buildInteractivePrompt(runtime));
      }, reject);
    };
    const handleData = (chunk) => {
      buffer += String(chunk);
      const lines = buffer.split(/\r?\n/u);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (activeQuestionResolver) {
          const resolveQuestion = activeQuestionResolver;
          activeQuestionResolver = null;
          resolveQuestion(line);
          continue;
        }
        enqueueLine(line);
      }
    };
    const handleEnd = () => {
      if (activeQuestionResolver) {
        const resolveQuestion = activeQuestionResolver;
        activeQuestionResolver = null;
        resolveQuestion(buffer);
        buffer = "";
      }
      if (buffer.trim()) {
        enqueueLine(buffer);
        buffer = "";
      }
      resolveAfterProcessing();
    };
    const handleError = (error) => {
      stopped = true;
      resolved = true;
      cleanup();
      reject(error);
    };
    input.on("data", handleData);
    input.on("end", handleEnd);
    input.on("error", handleError);
  });
}
async function runAgentWorldInteractive(runtime, io = defaultIo()) {
  const input = io.stdin ?? process.stdin;
  let exitRequested = false;
  const isTerminal = Boolean(input.isTTY);
  writeText(io, "agent-world-cli interactive. Type /help for commands, /exit to quit.");
  if (!isTerminal) {
    io.stdout.write(await buildInteractivePrompt(runtime));
    await runScriptedInteractiveInput(input, runtime, io);
    return 0;
  }
  const readline = createInterface({
    input,
    output: io.stdout,
    terminal: true
  });
  readline.on("SIGINT", () => {
    exitRequested = true;
    readline.close();
  });
  try {
    setRuntimeToolCallHandler(runtime, createHumanInputToolHandler({
      question: async (query) => await readline.question(query)
    }, io));
    readline.setPrompt(await buildInteractivePrompt(runtime));
    readline.prompt();
    for await (const line of readline) {
      if (exitRequested) {
        break;
      }
      const shouldContinue = await executeInteractiveLine(line, runtime, io);
      if (!shouldContinue) {
        exitRequested = true;
        break;
      }
      readline.setPrompt(await buildInteractivePrompt(runtime));
      readline.prompt();
    }
  } finally {
    setRuntimeToolCallHandler(runtime, void 0);
    readline.close();
  }
  return 0;
}
async function runAgentWorldCli(argv = process.argv.slice(2), io = defaultIo()) {
  try {
    const parsed = parseArgs(argv);
    const [area] = parsed.command;
    if (area === "help" || flagBoolean(parsed.flags, "help")) {
      writeText(io, usageText());
      return 0;
    }
    const workspaceRoot = prepareWorkspaceEnvironment(
      flagString(parsed.flags, "workspace") ?? flagString(parsed.flags, "project")
    );
    const runtime = createAgentWorldRuntime({
      workspaceRoot,
      autoResume: false
    });
    if (!area || area === "interactive") {
      return await runAgentWorldInteractive(runtime, io);
    }
    return await executeAgentWorldCommand(parsed, io, runtime);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message}
`);
    return 1;
  }
}
function isAgentWorldCliEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!argvPath) {
    return false;
  }
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return pathToFileURL(path5.resolve(argvPath)).href === moduleUrl;
  }
}
async function main() {
  const exitCode = await runAgentWorldCli();
  process.exitCode = exitCode;
}
if (isAgentWorldCliEntrypoint()) {
  await main();
}
export {
  interactiveHelpText,
  isAgentWorldCliEntrypoint,
  main,
  runAgentWorldCli,
  runAgentWorldInteractive,
  splitCommandLine,
  usageText
};
