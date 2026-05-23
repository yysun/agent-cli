#!/usr/bin/env node

// cli/src/agent-world-cli.ts
import path4 from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

// cli/src/agent-world-runtime.ts
import { EventEmitter } from "node:events";

// core/agent-config.js
import { promises as fs } from "node:fs";

// core/paths.js
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

// core/agent-config.js
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
    throw new Error(`Invalid agent config value for ${label}: expected one of ${[...allowedValues].join(", ")}.`);
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
  const searchContextSize = normalizeEnum(readAliasedValue(value, ["searchContextSize", "contextSize", "size"]), "webSearch.searchContextSize", WEB_SEARCH_CONTEXT_SIZES);
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
    maxTokens: normalizePositiveInteger(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.maxTokens), "maxTokens"),
    toolPermission: normalizeToolPermission(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.toolPermission)),
    reasoningEffort: normalizeReasoningEffort(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.reasoningEffort)),
    pastMessages: normalizeNonNegativeInteger(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.pastMessages), "pastMessages"),
    stream: normalizeBoolean(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.stream), "stream"),
    streamTrace: normalizeBoolean(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.streamTrace), "streamTrace")
  };
  const webSearch = normalizeWebSearch(readAliasedValue(configSource, AGENT_CONFIG_ALIASES.webSearch));
  if (webSearch !== void 0) {
    normalizedConfig.webSearch = webSearch;
  }
  return Object.fromEntries(Object.entries(normalizedConfig).filter(([, value]) => value !== void 0));
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
  const agentMetadataConfig = normalizeAgentConfig(await readJsonFileIfPresent(buildAgentMetadataPath(defaultAgentId), "agent metadata") ?? {});
  const agentRuntimeConfig = await loadRuntimeConfigFile(buildAgentRuntimeConfigPath(defaultAgentId));
  return {
    ...rootRuntimeConfig,
    ...agentMetadataConfig,
    ...agentRuntimeConfig
  };
}

// core/agent-files.js
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

// core/runtime-client.js
import { createRuntime, executeToolCall as executeRuntimeToolCall, executeToolCalls as executeRuntimeToolCalls, runCompletionLoop } from "llm-runtime";
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
  const model = String(agentConfig.model ?? providerDefaultModel ?? "").trim();
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
async function runChatTurn({ chat, userMessage, stream = true, onStreamChunk, onToolCall, onToolResult, handleToolCall, historyMessageLimit, builtInSystemPrompt, workspaceSystemPrompt, projectSystemPrompt, skillInventory, approvalGate, agentConfig = {}, abortSignal }) {
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
          load_skill: true
        },
        context: executionContext
      },
      ...abortSignal ? { abortSignal } : {},
      buildMessages: async ({ state, transientInstruction }) => {
        const baseMessages = [
          ...buildBaseSystemMessages(builtInSystemPrompt, workspaceSystemPrompt ?? projectSystemPrompt, skillInventory),
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
              toolResult = createRejectedToolResult(toolCall.id, toolName, approvalDecision?.reason || `Tool execution rejected: ${toolName}`);
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

// core/world-store.js
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
  return await readJson(buildWorldChatMetadataPath(chatId), `Missing chat session file: ${buildWorldChatMessagesPath(chatId)}`, `Invalid chat session file: ${buildWorldChatMetadataPath(chatId)}`);
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

// cli/src/agent-world-runtime.ts
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
      edit: async () => {
        throw new Error("Message edit is not implemented in the lean world runtime.");
      },
      deleteFrom: async () => {
        throw new Error("Message delete-from is not implemented in the lean world runtime.");
      },
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
        this.emit({
          type: "tool_call",
          chatId: params.chatId,
          agentId: params.agentId,
          toolCall,
          createdAt: nowIsoString()
        });
      },
      onToolResult: (toolResult) => {
        this.emit({
          type: "tool_result",
          chatId: params.chatId,
          agentId: params.agentId,
          toolResult,
          createdAt: nowIsoString()
        });
      }
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
    return await this.dispatchMessage({ chatId, content, sender, stream: input.stream, agentId: input.agentId });
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
          stream: params.stream
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

// cli/src/agent-world-cli.ts
var VALUE_FLAGS = /* @__PURE__ */ new Set(["workspace", "name", "provider", "model", "chat", "agent"]);
var BOOLEAN_FLAGS = /* @__PURE__ */ new Set(["default", "queue", "help"]);
function usageText() {
  return [
    "agent-world-cli commands:",
    "  help",
    "  interactive",
    "  world [--workspace <path>]",
    "  agents list",
    "  agents create <agentId> [--name <name>] [--provider <provider>] [--model <model>] [--default]",
    "  chats list",
    "  chats new",
    "  chats use <chatId>",
    "  messages list [chatId]",
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
    "  /chats list",
    "  /new",
    "  /use <chatId>",
    "  /messages [chatId]",
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
      const flag = token.slice(2);
      if (BOOLEAN_FLAGS.has(flag)) {
        flags.set(flag, true);
        continue;
      }
      if (!VALUE_FLAGS.has(flag)) {
        throw new Error(`Unknown option: --${flag}`);
      }
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for --${flag}`);
      }
      flags.set(flag, value);
      index += 1;
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
async function executeAgentWorldCommand(parsed, io, runtime) {
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
  }
  if (area === "messages" && action === "list") {
    writeJson(io, await runtime.messages.list(rest[0]));
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
    writeJson(io, await runtime.messages.send({
      content,
      ...chatId ? { chatId } : {},
      ...flagString(parsed.flags, "agent") ? { agentId: flagString(parsed.flags, "agent") } : {}
    }));
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
    case "messages":
      return ["messages", "list", ...rest];
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
    await executeAgentWorldCommand(parseArgs(argv), io, runtime);
  } catch (error) {
    io.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  }
  return true;
}
async function readAllInput(input) {
  let content = "";
  for await (const chunk of input) {
    content += String(chunk);
  }
  return content;
}
async function runAgentWorldInteractive(runtime, io = defaultIo()) {
  const input = io.stdin ?? process.stdin;
  let exitRequested = false;
  const isTerminal = Boolean(input.isTTY);
  writeText(io, "agent-world-cli interactive. Type /help for commands, /exit to quit.");
  if (!isTerminal) {
    const content = await readAllInput(input);
    const lines = content.split(/\r?\n/u);
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      io.stdout.write(await buildInteractivePrompt(runtime));
      const shouldContinue = await executeInteractiveLine(line, runtime, io);
      if (!shouldContinue) {
        break;
      }
    }
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
    const runtime = createAgentWorldRuntime({
      workspaceRoot: flagString(parsed.flags, "workspace"),
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
function isAgentWorldCliEntrypoint(argv = process.argv) {
  const entrypoint = argv[1] ? path4.resolve(argv[1]) : "";
  if (!entrypoint) {
    return false;
  }
  return entrypoint === fileURLToPath(import.meta.url) || path4.basename(entrypoint) === "agent-world-cli.js";
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
