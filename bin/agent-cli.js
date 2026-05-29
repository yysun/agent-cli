#!/usr/bin/env node

// cli/src/agent-cli.ts
import path6 from "node:path";
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  maxToolTurns: ["maxToolTurns", "max_tool_turns", "max-tool-turns", "maxConsecutiveToolTurns"],
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
    maxToolTurns: normalizePositiveInteger(
      readAliasedValue(configSource, AGENT_CONFIG_ALIASES.maxToolTurns),
      "maxToolTurns"
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
function loadPersistedRuntimeConfig() {
  return normalizeAgentConfig({
    provider: process.env.AGENT_CLI_PROVIDER,
    model: process.env.AGENT_CLI_MODEL,
    temperature: process.env.AGENT_CLI_TEMPERATURE,
    maxTokens: process.env.AGENT_CLI_MAX_TOKENS,
    maxToolTurns: process.env.AGENT_CLI_MAX_TOOL_TURNS,
    toolPermission: process.env.AGENT_CLI_TOOL_PERMISSION,
    reasoningEffort: process.env.AGENT_CLI_REASONING_EFFORT,
    pastMessages: process.env.AGENT_CLI_PAST_MESSAGES,
    stream: process.env.AGENT_CLI_STREAM,
    streamTrace: process.env.AGENT_CLI_STREAM_TRACE,
    webSearch: process.env.AGENT_CLI_WEB_SEARCH
  });
}

// core/agent-runtime.ts
import {
  complete,
  createRuntime,
  streamComplete
} from "llm-runtime";

// core/agent-files.ts
import { promises as fs2 } from "node:fs";
import path3 from "node:path";

// core/paths.ts
import path from "node:path";
import os from "node:os";
var WORKSPACE_ROOT_ENV_KEY = "AGENT_CLI_WORKSPACE";
function resolveWorkspaceRoot(workspaceRoot) {
  const configuredRoot = [
    workspaceRoot,
    process.env[WORKSPACE_ROOT_ENV_KEY]
  ].map((value) => String(value ?? "").trim()).find((value) => value.length > 0) ?? "";
  return configuredRoot ? path.resolve(configuredRoot) : process.cwd();
}
var WORKSPACE_ROOT = "";
var REPO_ROOT = "";
var SYSTEM_PROMPT_PATH = "";
var USER_SKILLS_ROOT = "";
var AGENTS_SKILLS_ROOT = "";
var GLOBAL_SKILLS_ROOTS = [];
var SKILLS_ROOT = "";
var AGENT_WORLD_ROOT = "";
var AGENT_WORLD_CONFIG_PATH = "";
var AGENT_WORLD_CHATS_ROOT = "";
var CURRENT_CHAT_PATH = "";
function configureWorkspaceRoot(workspaceRoot, options = {}) {
  WORKSPACE_ROOT = resolveWorkspaceRoot(workspaceRoot);
  if (options.publishEnvironment ?? true) {
    process.env[WORKSPACE_ROOT_ENV_KEY] = WORKSPACE_ROOT;
  }
  REPO_ROOT = WORKSPACE_ROOT;
  SYSTEM_PROMPT_PATH = path.join(WORKSPACE_ROOT, "AGENTS.md");
  USER_SKILLS_ROOT = path.join(os.homedir(), ".agent-world", "skills");
  AGENTS_SKILLS_ROOT = path.join(os.homedir(), ".agents", "skills");
  GLOBAL_SKILLS_ROOTS = [USER_SKILLS_ROOT, AGENTS_SKILLS_ROOT];
  AGENT_WORLD_ROOT = path.join(WORKSPACE_ROOT, ".agent-world");
  AGENT_WORLD_CONFIG_PATH = path.join(AGENT_WORLD_ROOT, "world.json");
  SKILLS_ROOT = path.join(AGENT_WORLD_ROOT, "skills");
  AGENT_WORLD_CHATS_ROOT = path.join(AGENT_WORLD_ROOT, "chats");
  CURRENT_CHAT_PATH = path.join(AGENT_WORLD_CHATS_ROOT, "current.json");
  return WORKSPACE_ROOT;
}
configureWorkspaceRoot(void 0, { publishEnvironment: false });
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
function buildWorldChatEventsPath(chatId) {
  return path.join(buildWorldChatDirectoryPath(chatId), "events.jsonl");
}

// core/workspace-store.ts
import { promises as fs } from "node:fs";
import path2 from "node:path";
function syncWorkspaceRootFromEnvironment() {
  const configuredWorkspaceRoot = String(process.env[WORKSPACE_ROOT_ENV_KEY] ?? "").trim();
  if (!configuredWorkspaceRoot) {
    return;
  }
  const resolvedWorkspaceRoot = path2.resolve(configuredWorkspaceRoot);
  if (resolvedWorkspaceRoot !== WORKSPACE_ROOT) {
    configureWorkspaceRoot(resolvedWorkspaceRoot);
  }
}
async function ensureWorkspaceStorage() {
  syncWorkspaceRootFromEnvironment();
  await Promise.all([
    fs.mkdir(AGENT_WORLD_ROOT, { recursive: true }),
    fs.mkdir(AGENT_WORLD_CHATS_ROOT, { recursive: true }),
    fs.mkdir(SKILLS_ROOT, { recursive: true })
  ]);
  return {
    workspaceRoot: WORKSPACE_ROOT,
    storageRoot: AGENT_WORLD_ROOT,
    chatsRoot: AGENT_WORLD_CHATS_ROOT,
    skillsRoot: SKILLS_ROOT
  };
}
async function ensureWorkspaceWorld() {
  return ensureWorkspaceStorage();
}

// core/agent-files.ts
var GLOBAL_SKILLS_ENV_KEY = "AGENT_CLI_GLOBAL_SKILLS";
var DEFAULT_SYSTEM_PROMPT = [
  "You are Agent CLI.",
  "Be concise, factual, and action-oriented.",
  "Prefer workspace evidence over speculation when an answer depends on files, configuration, environment variables, logs, generated outputs, or repository state.",
  "Use available read-only tools before asking the user for information that may already exist in the workspace.",
  "When a task depends on domain-specific instructions, procedures, or contracts, use `load_skill` when a relevant skill is available.",
  "When the task is complete, call the `final_answer` control tool with the final user-facing answer instead of sending final answers as plain assistant text.",
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
      const entryPath = path3.join(currentPath, entry.name);
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
async function loadSkillInventoryFromRoot(skillsRoot, sourceScope) {
  try {
    await assertReadableDirectory(skillsRoot, "skills root");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing skills root:")) {
      return [];
    }
    throw error;
  }
  const skillFilePaths = await collectSkillFilePaths(skillsRoot);
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
      sourcePath: skillFilePath,
      sourceScope
    });
  }
  return skills;
}
function isGlobalSkillLoadingEnabled(environment = process.env) {
  const normalized = String(environment[GLOBAL_SKILLS_ENV_KEY] ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
}
async function loadGlobalSkillInventory(skillRoots) {
  const scopedSkills = await Promise.all(
    skillRoots.map((skillRoot) => loadSkillInventoryFromRoot(skillRoot, "user"))
  );
  return scopedSkills.flat();
}
async function loadSkillInventoryByScope() {
  await ensureWorkspaceWorld();
  return {
    user: isGlobalSkillLoadingEnabled() ? await loadGlobalSkillInventory(GLOBAL_SKILLS_ROOTS) : [],
    project: await loadSkillInventoryFromRoot(SKILLS_ROOT, "project")
  };
}
function flattenSkillInventoryByPrecedence(scopedInventory) {
  const skillsById = /* @__PURE__ */ new Map();
  for (const skill of scopedInventory.user) {
    skillsById.set(skill.skillId, skill);
  }
  for (const skill of scopedInventory.project) {
    skillsById.set(skill.skillId, skill);
  }
  return [...skillsById.values()].sort((left, right) => left.skillId.localeCompare(right.skillId));
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
function resolveRuntimeSelection(environment = process.env, agentConfig) {
  const config = agentConfig ?? {};
  const provider = String(config.provider ?? "openai").trim().toLowerCase();
  const providerDefaultModel = provider === "azure" ? String(environment.AZURE_OPENAI_DEPLOYMENT_NAME ?? "").trim() : DEFAULT_MODELS[provider];
  const model = String(
    config.model ?? providerDefaultModel ?? ""
  ).trim();
  return { provider, model };
}
function buildEnvironmentDefaults(agentConfig) {
  const config = agentConfig ?? {};
  const defaults = {};
  if (config.reasoningEffort) {
    defaults.reasoningEffort = config.reasoningEffort;
  }
  if (config.toolPermission) {
    defaults.toolPermission = config.toolPermission;
  }
  return defaults;
}
function buildExecutionContext(agentConfig) {
  const config = agentConfig ?? {};
  const context = {
    workingDirectory: WORKSPACE_ROOT
  };
  if (config.reasoningEffort) {
    context.reasoningEffort = config.reasoningEffort;
  }
  if (config.toolPermission) {
    context.toolPermission = config.toolPermission;
  }
  if (config.abortSignal) {
    context.abortSignal = config.abortSignal;
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
  const runtimeSelection = resolveRuntimeSelection(environment, agentConfig);
  const configuredProvider = runtimeSelection.provider;
  const normalizedProvider = configuredProvider.toLowerCase();
  if (!SUPPORTED_PROVIDERS.has(normalizedProvider)) {
    throw new Error(`Unsupported LLM provider: ${configuredProvider}`);
  }
  const provider = normalizedProvider;
  const providerConfig = resolveProviderConfig(provider, environment);
  const model = runtimeSelection.model || (provider === "azure" && "deployment" in providerConfig ? providerConfig.deployment : "");
  if (!model) {
    throw new Error(`Missing LLM model. Set AGENT_CLI_MODEL in .env or pass --model for provider ${provider}.`);
  }
  const providers = {
    [provider]: providerConfig
  };
  return {
    provider,
    model,
    providers
  };
}
function buildRuntimeSkillRoots() {
  return [
    ...isGlobalSkillLoadingEnabled() ? GLOBAL_SKILLS_ROOTS : [],
    SKILLS_ROOT
  ];
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
var RUNTIME_CONTROL_TOOL_NAMES = /* @__PURE__ */ new Set(["final_answer", "need_user_input", "blocked"]);
var REJECTED_TEXT_RESPONSE_PREFIX = "Assistant response did not complete the task with required evidence:";
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function extractModelResponseMetadata(raw, fallbackType) {
  if (!isRecord(raw)) {
    return fallbackType ? { type: fallbackType } : void 0;
  }
  const response = raw;
  const metadata = {};
  if (typeof response.type === "string" && response.type.trim()) {
    metadata.type = response.type;
  } else if (fallbackType) {
    metadata.type = fallbackType;
  }
  if (typeof response.stopKind === "string" && response.stopKind.trim()) {
    metadata.stopKind = response.stopKind;
  }
  if (typeof response.providerStopReason === "string" && response.providerStopReason.trim()) {
    metadata.providerStopReason = response.providerStopReason;
  }
  if (isRecord(response.usage)) {
    metadata.usage = response.usage;
  }
  return Object.keys(metadata).length > 0 ? metadata : void 0;
}
function emitModelResponse(onModelResponse, raw, fallbackType) {
  if (typeof onModelResponse !== "function") {
    return;
  }
  const metadata = extractModelResponseMetadata(raw, fallbackType);
  if (metadata) {
    onModelResponse(metadata);
  }
}
function serializeToolResult(result) {
  if (typeof result === "string") {
    return result;
  }
  return JSON.stringify(result ?? null, null, 2);
}
function parseSerializedToolResult(content) {
  if (typeof content !== "string") {
    return content;
  }
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}
function parseToolCallArguments(toolCall) {
  const rawArguments = toolCall?.function?.arguments;
  if (typeof rawArguments !== "string" || !rawArguments.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(rawArguments);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function extractRejectedTextResponse(error) {
  const message = String(error ?? "");
  if (!message.startsWith(REJECTED_TEXT_RESPONSE_PREFIX)) {
    return "";
  }
  return message.slice(REJECTED_TEXT_RESPONSE_PREFIX.length).trim();
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
function selectNewRuntimeMessages(runtimeMessages, inputMessageCount) {
  return runtimeMessages.slice(inputMessageCount).filter((message) => message?.role !== "system");
}
function emitCompletedToolEvents(messages, callbacks) {
  const toolCallsById = /* @__PURE__ */ new Map();
  for (const message of messages) {
    if (message?.role !== "assistant") {
      continue;
    }
    for (const toolCall of message.tool_calls ?? []) {
      const toolName = toolCall.function?.name ?? "unknown_tool";
      if (RUNTIME_CONTROL_TOOL_NAMES.has(toolName)) {
        continue;
      }
      toolCallsById.set(toolCall.id, toolCall);
      callbacks.onToolCall?.({
        id: toolCall.id,
        name: toolName,
        arguments: toolCall.function?.arguments
      });
    }
  }
  for (const message of messages) {
    if (message?.role !== "tool" || !message.tool_call_id) {
      continue;
    }
    const toolCall = toolCallsById.get(message.tool_call_id);
    if (!toolCall) {
      continue;
    }
    callbacks.onToolResult?.({
      id: message.tool_call_id,
      name: toolCall.function?.name ?? "unknown_tool",
      result: parseSerializedToolResult(message.content),
      arguments: toolCall.function?.arguments
    });
  }
}
async function runChatTurn({
  chat,
  userMessage,
  stream = true,
  onStreamChunk,
  onModelResponse,
  onToolCall,
  onToolResult,
  handleToolCall,
  historyMessageLimit,
  builtInSystemPrompt,
  workspaceSystemPrompt,
  projectSystemPrompt,
  skillInventory,
  approvalGate,
  agentConfig,
  abortSignal
}) {
  const runtimeAgentConfig = agentConfig ?? {};
  const runtimeSettings = validateRuntimeEnvironment(process.env, runtimeAgentConfig);
  const environmentDefaults = buildEnvironmentDefaults(runtimeAgentConfig);
  const executionContext = buildExecutionContext({
    ...runtimeAgentConfig,
    abortSignal
  });
  const runtime = createRuntime({
    providers: runtimeSettings.providers,
    skillRoots: buildRuntimeSkillRoots(),
    ...Object.keys(environmentDefaults).length > 0 ? { defaults: environmentDefaults } : {}
  });
  const pendingUserMessage = {
    role: "user",
    content: userMessage,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const contextMessages = selectContextMessages(chat.messages, historyMessageLimit);
  const systemMessages = buildBaseSystemMessages(
    builtInSystemPrompt,
    workspaceSystemPrompt ?? projectSystemPrompt,
    skillInventory
  );
  try {
    const persistedMessages = [...chat.messages, pendingUserMessage];
    const toolStartTimes = /* @__PURE__ */ new Map();
    const emittedToolCallIds = /* @__PURE__ */ new Set();
    let finalText = "";
    let streamedAssistantText = "";
    let fallbackRejectedText = "";
    let failureError = null;
    let pendingToolCalls = [];
    const completionOptions = {
      environment: runtime,
      provider: runtimeSettings.provider,
      model: runtimeSettings.model,
      messages: [...systemMessages, ...contextMessages, pendingUserMessage],
      context: { ...executionContext, ...abortSignal ? { abortSignal } : {} },
      ...typeof runtimeAgentConfig.temperature === "number" ? { temperature: runtimeAgentConfig.temperature } : {},
      ...typeof runtimeAgentConfig.maxTokens === "number" ? { maxTokens: runtimeAgentConfig.maxTokens } : {},
      ...typeof runtimeAgentConfig.maxToolTurns === "number" ? { maxConsecutiveToolTurns: runtimeAgentConfig.maxToolTurns } : {},
      ...runtimeAgentConfig.webSearch !== void 0 ? { webSearch: runtimeAgentConfig.webSearch } : {},
      onToolApproval: async ({ toolCall, toolName, parsedArguments }) => {
        if (executionContext.toolPermission !== "ask" || typeof approvalGate?.requestApproval !== "function") {
          return { approved: true };
        }
        const decision = await approvalGate.requestApproval({
          toolCallId: toolCall.id,
          toolName,
          arguments: parsedArguments
        });
        if (decision?.approved) {
          return { approved: true };
        }
        return {
          approved: false,
          reason: decision?.reason || `Tool execution rejected: ${toolName}`
        };
      },
      ...typeof handleToolCall === "function" ? {
        onToolCall: async ({ toolCall, toolName, parsedArguments, context, executeDefault }) => {
          if (typeof onToolCall === "function" && !emittedToolCallIds.has(toolCall.id)) {
            emittedToolCallIds.add(toolCall.id);
            toolStartTimes.set(toolCall.id, Date.now());
            onToolCall({
              id: toolCall.id,
              name: toolName,
              arguments: toolCall.function?.arguments
            });
          }
          const handlerResult = await handleToolCall({
            toolCall,
            toolName,
            arguments: toolCall.function?.arguments,
            parsedArguments,
            context,
            executeDefault
          });
          return {
            handled: Boolean(handlerResult?.handled),
            result: handlerResult?.result
          };
        }
      } : {}
    };
    let resumeMessages = completionOptions.messages;
    const handlePendingToolCalls = async () => {
      if (pendingToolCalls.length === 0 || typeof handleToolCall !== "function") {
        return false;
      }
      const toolMessages = [];
      for (const toolCall of pendingToolCalls) {
        const toolName = toolCall.function?.name ?? "unknown_tool";
        const parsedArguments = parseToolCallArguments(toolCall);
        const startedAt = Date.now();
        if (typeof onToolCall === "function" && !emittedToolCallIds.has(toolCall.id)) {
          emittedToolCallIds.add(toolCall.id);
          toolStartTimes.set(toolCall.id, startedAt);
          onToolCall({
            id: toolCall.id,
            name: toolName,
            arguments: toolCall.function?.arguments
          });
        }
        const handlerResult = await handleToolCall({
          toolCall,
          toolName,
          arguments: toolCall.function?.arguments,
          parsedArguments,
          context: {
            ...executionContext,
            messages: [...resumeMessages, ...toolMessages]
          },
          executeDefault: async () => ({
            ok: false,
            status: "unhandled",
            message: `Tool "${toolName}" is host-owned and has no default executor.`
          })
        });
        if (!handlerResult?.handled) {
          return false;
        }
        const resultValue = handlerResult.result;
        const toolMessage = {
          role: "tool",
          tool_call_id: toolCall.id,
          content: serializeToolResult(resultValue)
        };
        toolMessages.push(toolMessage);
        if (typeof onToolResult === "function") {
          onToolResult({
            id: toolCall.id,
            name: toolName,
            result: resultValue,
            arguments: toolCall.function?.arguments,
            durationMs: Date.now() - startedAt
          });
        }
        persistedMessages.push({
          ...toolMessage,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
      }
      completionOptions.messages = [...resumeMessages, ...toolMessages];
      pendingToolCalls = [];
      return true;
    };
    while (true) {
      pendingToolCalls = [];
      resumeMessages = completionOptions.messages;
      if (!stream) {
        const completionResult = await complete(completionOptions);
        emitModelResponse(onModelResponse, completionResult.raw, void 0);
        resumeMessages = completionResult.messages ?? completionOptions.messages;
        if (completionResult.status === "failed") {
          const rejectedText = extractRejectedTextResponse(completionResult.error);
          if (rejectedText) {
            finalText = rejectedText;
          } else {
            failureError = String(completionResult.error || "LLM turn failed.");
          }
        } else if (completionResult.status === "tool_calls") {
          pendingToolCalls = completionResult.toolCalls ?? [];
        } else if (completionResult.status === "completed" && typeof completionResult.output === "string") {
          finalText = completionResult.output;
        } else {
          failureError = `LLM turn failed with status ${completionResult.status}.`;
        }
        const runtimeMessages = selectNewRuntimeMessages(
          completionResult.messages ?? [],
          completionOptions.messages.length
        );
        emitCompletedToolEvents(runtimeMessages, { onToolCall, onToolResult });
        for (const message of runtimeMessages) {
          for (const toolCall of message?.role === "assistant" ? message.tool_calls ?? [] : []) {
            emittedToolCallIds.add(toolCall.id);
          }
          persistedMessages.push({
            ...message,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
        if (finalText.trim() && !runtimeMessages.some((message) => message?.role === "assistant" && String(message.content ?? "") === finalText)) {
          persistedMessages.push({
            role: "assistant",
            content: finalText,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          });
        }
      }
      if (stream) {
        for await (const event of streamComplete(completionOptions)) {
          switch (event.type) {
            case "text_delta":
              break;
            case "reasoning_delta":
              if (typeof onStreamChunk === "function") {
                onStreamChunk({ reasoningContent: event.delta });
              }
              break;
            case "answer_delta":
              streamedAssistantText += event.delta;
              if (typeof onStreamChunk === "function") {
                onStreamChunk({ content: event.delta });
              }
              break;
            case "assistant_message":
              emitModelResponse(
                onModelResponse,
                void 0,
                event.message.tool_calls?.length ? "tool_calls" : "text"
              );
              if (event.message.tool_calls?.length) {
                persistedMessages.push({
                  ...event.message,
                  createdAt: (/* @__PURE__ */ new Date()).toISOString()
                });
              }
              break;
            case "tool_start":
              toolStartTimes.set(event.toolCall.id, Date.now());
              if (typeof onToolCall === "function" && !emittedToolCallIds.has(event.toolCall.id)) {
                emittedToolCallIds.add(event.toolCall.id);
                onToolCall({
                  id: event.toolCall.id,
                  name: event.toolCall.function?.name ?? "unknown_tool",
                  arguments: event.toolCall.function?.arguments
                });
              }
              break;
            case "tool_result":
            case "tool_error": {
              const resultValue = event.type === "tool_result" ? event.result : { error: event.error };
              const toolName = event.toolCall.function?.name ?? "unknown_tool";
              const startedAt = toolStartTimes.get(event.toolCall.id);
              if (typeof onToolResult === "function") {
                onToolResult({
                  id: event.toolCall.id,
                  name: toolName,
                  result: resultValue,
                  arguments: event.toolCall.function?.arguments,
                  ...typeof startedAt === "number" ? { durationMs: Date.now() - startedAt } : {}
                });
              }
              persistedMessages.push({
                role: "tool",
                tool_call_id: event.toolCall.id,
                content: serializeToolResult(resultValue),
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
              break;
            }
            case "completed":
              emitModelResponse(onModelResponse, event.result.raw, void 0);
              if (event.result.status === "completed" && typeof event.result.output === "string") {
                finalText = event.result.output;
                if (typeof onStreamChunk === "function") {
                  const remainingFinalText = finalText.startsWith(streamedAssistantText) ? finalText.slice(streamedAssistantText.length) : streamedAssistantText ? "" : finalText;
                  if (remainingFinalText) {
                    streamedAssistantText += remainingFinalText;
                    onStreamChunk({ content: remainingFinalText });
                  }
                }
                persistedMessages.push({
                  role: "assistant",
                  content: event.result.output,
                  createdAt: (/* @__PURE__ */ new Date()).toISOString()
                });
              }
              break;
            case "tool_calls": {
              emitModelResponse(onModelResponse, event.result.raw, void 0);
              pendingToolCalls = event.result.toolCalls ?? [];
              resumeMessages = event.result.messages ?? resumeMessages;
              for (const toolCall of pendingToolCalls) {
                if (typeof onToolCall === "function" && !emittedToolCallIds.has(toolCall.id)) {
                  emittedToolCallIds.add(toolCall.id);
                  onToolCall({
                    id: toolCall.id,
                    name: toolCall.function?.name ?? "unknown_tool",
                    arguments: toolCall.function?.arguments
                  });
                }
              }
              break;
            }
            case "failed":
              emitModelResponse(onModelResponse, event.result.raw, void 0);
              {
                const rejectedText = extractRejectedTextResponse(event.result.error);
                if (rejectedText) {
                  fallbackRejectedText = rejectedText;
                } else {
                  failureError = String(event.result.error || `LLM turn failed with status ${event.result.status}.`);
                }
              }
              break;
            default:
              break;
          }
        }
      }
      if (failureError || pendingToolCalls.length === 0) {
        break;
      }
      if (!await handlePendingToolCalls()) {
        break;
      }
    }
    if (!finalText.trim() && fallbackRejectedText) {
      finalText = fallbackRejectedText;
      if (typeof onStreamChunk === "function" && !streamedAssistantText) {
        streamedAssistantText = fallbackRejectedText;
        onStreamChunk({ content: fallbackRejectedText });
      }
      persistedMessages.push({
        role: "assistant",
        content: fallbackRejectedText,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      });
    }
    if (failureError) {
      throw new Error(failureError);
    }
    if (pendingToolCalls.length > 0) {
      return {
        status: "tool_calls",
        toolCalls: pendingToolCalls,
        assistantText: finalText.trim(),
        messages: persistedMessages
      };
    }
    if (!finalText.trim()) {
      throw new Error("LLM turn ended without a final text response.");
    }
    return {
      status: "completed",
      assistantText: finalText.trim(),
      messages: persistedMessages
    };
  } finally {
    await runtime.dispose();
  }
}

// core/agent-world-config.ts
import { promises as fs3 } from "node:fs";

// core/world.schema.json
var world_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://agent-world.local/world.schema.json",
  title: "Agent World Config",
  description: "Schema for .agent-world/world.json. It validates the config shape; the router still validates graph references and prompt file existence at runtime.",
  type: "object",
  additionalProperties: false,
  required: ["world", "workflow", "agents"],
  properties: {
    $schema: {
      type: "string"
    },
    world: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name"],
      properties: {
        id: {
          $ref: "#/$defs/id"
        },
        name: {
          type: "string",
          minLength: 1
        },
        entryAgent: {
          $ref: "#/$defs/id"
        },
        mainAgent: {
          $ref: "#/$defs/id"
        },
        stopToken: {
          type: "string",
          default: "<world>pass</world>"
        },
        turnLimit: {
          type: "integer",
          minimum: 1,
          default: 30
        },
        mode: {
          type: "string",
          enum: ["host_driven_router_only", "host_delegated"],
          default: "host_driven_router_only"
        }
      }
    },
    workflow: {
      type: "object",
      additionalProperties: false,
      required: ["entry", "entryAgent", "nodes", "edges"],
      properties: {
        type: {
          type: "string",
          enum: ["dag", "mention_graph"],
          default: "dag"
        },
        entry: {
          $ref: "#/$defs/id"
        },
        entryAgent: {
          $ref: "#/$defs/id"
        },
        enforceEdges: {
          type: "boolean",
          default: true
        },
        nodes: {
          type: "object",
          minProperties: 1,
          propertyNames: {
            $ref: "#/$defs/id"
          },
          additionalProperties: {
            $ref: "#/$defs/workflowNode"
          }
        },
        edges: {
          type: "object",
          propertyNames: {
            anyOf: [
              {
                $ref: "#/$defs/id"
              },
              {
                const: "human"
              }
            ]
          },
          additionalProperties: {
            type: "array",
            items: {
              $ref: "#/$defs/id"
            },
            uniqueItems: true
          }
        }
      }
    },
    routing: {
      type: "object",
      additionalProperties: false,
      properties: {
        noMentionFromHumanGoesTo: {
          $ref: "#/$defs/id"
        },
        stopToken: {
          type: "string"
        }
      }
    },
    agents: {
      type: "object",
      minProperties: 1,
      propertyNames: {
        $ref: "#/$defs/id"
      },
      additionalProperties: {
        $ref: "#/$defs/agent"
      }
    }
  },
  $defs: {
    id: {
      type: "string",
      pattern: "^[A-Za-z0-9_-]+$",
      minLength: 1
    },
    path: {
      type: "string",
      minLength: 1,
      pattern: "^[^\\u0000]+$"
    },
    workflowNode: {
      type: "object",
      additionalProperties: false,
      required: ["agent"],
      properties: {
        agent: {
          $ref: "#/$defs/id"
        },
        instruction: {
          type: "string"
        },
        requires: {
          type: "array",
          items: {
            $ref: "#/$defs/id"
          },
          uniqueItems: true
        }
      }
    },
    agent: {
      type: "object",
      additionalProperties: false,
      required: ["promptPath"],
      properties: {
        name: {
          type: "string",
          minLength: 1
        },
        role: {
          type: "string",
          minLength: 1
        },
        promptPath: {
          $ref: "#/$defs/path"
        }
      }
    }
  }
};

// core/agent-world-config.ts
function isRecord2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function normalizeScalarText(value) {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}
function formatStructuredValue(value) {
  const scalarText = normalizeScalarText(value);
  if (scalarText) {
    return scalarText;
  }
  if (Array.isArray(value)) {
    return value.map(formatStructuredValue).filter(Boolean).join(", ");
  }
  if (!isRecord2(value)) {
    return "";
  }
  for (const key of ["pattern", "type", "entry", "entryAgent", "name", "id", "mode"]) {
    const text = normalizeScalarText(value[key]);
    if (text) {
      return text;
    }
  }
  return Object.keys(value).sort((left, right) => left.localeCompare(right)).join(", ");
}
function extractWorkflowLabel(config) {
  return formatStructuredValue(config.workflow ?? config.workflowPattern ?? config.pattern);
}
function extractAgentLabel(value, fallbackLabel = "") {
  const scalarText = normalizeScalarText(value);
  if (scalarText) {
    return scalarText;
  }
  if (!isRecord2(value)) {
    return fallbackLabel;
  }
  for (const key of ["id", "name", "agent", "role"]) {
    const text = normalizeScalarText(value[key]);
    if (text) {
      return text;
    }
  }
  return fallbackLabel;
}
function extractAgentLabels(config) {
  const agents = config.agents;
  if (Array.isArray(agents)) {
    return agents.map((agent) => extractAgentLabel(agent)).filter(Boolean);
  }
  if (isRecord2(agents)) {
    return Object.keys(agents).filter(Boolean);
  }
  return [];
}
function readSchemaType(schema) {
  return normalizeScalarText(schema.type);
}
function describeSchemaType(schema) {
  const type = readSchemaType(schema);
  return type || "valid value";
}
function getJsonType(value) {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  if (Number.isInteger(value)) {
    return "integer";
  }
  return typeof value;
}
function formatJsonPath(pathParts) {
  return pathParts.length === 0 ? "$" : `$${pathParts.join("")}`;
}
function appendPathKey(pathParts, key) {
  return [...pathParts, /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`];
}
function appendPathIndex(pathParts, index) {
  return [...pathParts, `[${index}]`];
}
function resolveSchemaReference(reference, rootSchema) {
  if (!reference.startsWith("#/")) {
    return null;
  }
  let current = rootSchema;
  for (const rawPart of reference.slice(2).split("/")) {
    const part = rawPart.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (!isRecord2(current)) {
      return null;
    }
    current = current[part];
  }
  return isRecord2(current) ? current : null;
}
function valuesAreUnique(values) {
  const seen = /* @__PURE__ */ new Set();
  for (const value of values) {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
  }
  return true;
}
function validateJsonSchemaValue({
  value,
  schema,
  rootSchema,
  pathParts
}) {
  const reference = normalizeScalarText(schema.$ref);
  if (reference) {
    const resolvedSchema = resolveSchemaReference(reference, rootSchema);
    if (!resolvedSchema) {
      return [`${formatJsonPath(pathParts)} uses unsupported schema reference ${reference}`];
    }
    return validateJsonSchemaValue({
      value,
      schema: resolvedSchema,
      rootSchema,
      pathParts
    });
  }
  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : [];
  if (anyOf.length > 0) {
    const matched = anyOf.some((candidate) => isRecord2(candidate) && validateJsonSchemaValue({
      value,
      schema: candidate,
      rootSchema,
      pathParts
    }).length === 0);
    return matched ? [] : [`${formatJsonPath(pathParts)} does not match any allowed schema`];
  }
  if ("const" in schema && value !== schema.const) {
    return [`${formatJsonPath(pathParts)} must be ${JSON.stringify(schema.const)}`];
  }
  const errors = [];
  const type = readSchemaType(schema);
  if (type) {
    const actualType = getJsonType(value);
    const validType = type === "integer" ? Number.isInteger(value) : actualType === type;
    if (!validType) {
      return [`${formatJsonPath(pathParts)} must be ${describeSchemaType(schema)}, got ${actualType}`];
    }
  }
  if (type === "string" && typeof value === "string") {
    const minLength = Number(schema.minLength);
    if (Number.isFinite(minLength) && value.length < minLength) {
      errors.push(`${formatJsonPath(pathParts)} must be at least ${minLength} characters`);
    }
    const pattern = normalizeScalarText(schema.pattern);
    if (pattern && !new RegExp(pattern, "u").test(value)) {
      errors.push(`${formatJsonPath(pathParts)} must match /${pattern}/`);
    }
    const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
    if (enumValues.length > 0 && !enumValues.includes(value)) {
      errors.push(`${formatJsonPath(pathParts)} must be one of ${enumValues.map((item) => JSON.stringify(item)).join(", ")}`);
    }
  }
  if ((type === "integer" || type === "number") && typeof value === "number") {
    const minimum = Number(schema.minimum);
    if (Number.isFinite(minimum) && value < minimum) {
      errors.push(`${formatJsonPath(pathParts)} must be >= ${minimum}`);
    }
  }
  if (type === "array" && Array.isArray(value)) {
    const itemsSchema = isRecord2(schema.items) ? schema.items : null;
    if (itemsSchema) {
      value.forEach((item, index) => {
        errors.push(...validateJsonSchemaValue({
          value: item,
          schema: itemsSchema,
          rootSchema,
          pathParts: appendPathIndex(pathParts, index)
        }));
      });
    }
    if (schema.uniqueItems === true && !valuesAreUnique(value)) {
      errors.push(`${formatJsonPath(pathParts)} must contain unique items`);
    }
  }
  if (type === "object" && isRecord2(value)) {
    const properties = isRecord2(schema.properties) ? schema.properties : {};
    const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
    for (const key of required) {
      if (!(key in value)) {
        errors.push(`${formatJsonPath(pathParts)}.${key} is required`);
      }
    }
    const minProperties = Number(schema.minProperties);
    if (Number.isFinite(minProperties) && Object.keys(value).length < minProperties) {
      errors.push(`${formatJsonPath(pathParts)} must have at least ${minProperties} properties`);
    }
    if (isRecord2(schema.propertyNames)) {
      for (const key of Object.keys(value)) {
        errors.push(...validateJsonSchemaValue({
          value: key,
          schema: schema.propertyNames,
          rootSchema,
          pathParts: appendPathKey(pathParts, key)
        }).map((error) => `${error} as a property name`));
      }
    }
    const additionalProperties = schema.additionalProperties;
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[key];
      if (isRecord2(propertySchema)) {
        errors.push(...validateJsonSchemaValue({
          value: propertyValue,
          schema: propertySchema,
          rootSchema,
          pathParts: appendPathKey(pathParts, key)
        }));
        continue;
      }
      if (additionalProperties === false) {
        errors.push(`${formatJsonPath(appendPathKey(pathParts, key))} is not allowed`);
        continue;
      }
      if (isRecord2(additionalProperties)) {
        errors.push(...validateJsonSchemaValue({
          value: propertyValue,
          schema: additionalProperties,
          rootSchema,
          pathParts: appendPathKey(pathParts, key)
        }));
      }
    }
  }
  return errors;
}
function validateWorldConfig(config) {
  if (!isRecord2(world_schema_default)) {
    throw new Error("Invalid bundled Agent World schema: expected a JSON object");
  }
  const errors = validateJsonSchemaValue({
    value: config,
    schema: world_schema_default,
    rootSchema: world_schema_default,
    pathParts: []
  });
  if (errors.length > 0) {
    throw new Error(`Invalid Agent World config: ${AGENT_WORLD_CONFIG_PATH}: ${errors.slice(0, 8).join("; ")}`);
  }
}
async function loadAgentWorldStartupSummary() {
  let content = "";
  try {
    content = await fs3.readFile(AGENT_WORLD_CONFIG_PATH, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Agent World config: ${AGENT_WORLD_CONFIG_PATH}: ${message}`);
  }
  validateWorldConfig(parsed);
  return {
    filePath: AGENT_WORLD_CONFIG_PATH,
    workflow: extractWorkflowLabel(parsed),
    agents: extractAgentLabels(parsed)
  };
}
function agentWorldStartupText(summary) {
  if (!summary) {
    return "";
  }
  return [
    "Agent world:",
    `  workflow: ${summary.workflow || "(not set)"}`,
    `  agents: ${summary.agents.length > 0 ? summary.agents.join(", ") : "(none)"}`
  ].join("\n");
}

// core/workspace-environment.ts
import fs4 from "node:fs";
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
  "AGENT_CLI_PROVIDER",
  "AGENT_CLI_MODEL",
  "AGENT_CLI_TEMPERATURE",
  "AGENT_CLI_MAX_TOKENS",
  "AGENT_CLI_MAX_TOOL_TURNS",
  "AGENT_CLI_TOOL_PERMISSION",
  "AGENT_CLI_REASONING_EFFORT",
  "AGENT_CLI_PAST_MESSAGES",
  "AGENT_CLI_STREAM",
  "AGENT_CLI_STREAM_TRACE",
  "AGENT_CLI_WEB_SEARCH",
  "AGENT_CLI_GLOBAL_SKILLS"
]);
var DOTENV_EXAMPLE_CONTENT = `# Keep .env limited to credentials and Agent CLI runtime defaults.
# CLI flags override these runtime defaults.

# Agent CLI runtime
AGENT_CLI_PROVIDER=ollama
AGENT_CLI_MODEL=emma4:e4b
AGENT_CLI_TEMPERATURE=1
AGENT_CLI_MAX_TOKENS=4096
AGENT_CLI_MAX_TOOL_TURNS=24
AGENT_CLI_TOOL_PERMISSION=ask
AGENT_CLI_REASONING_EFFORT=medium
AGENT_CLI_PAST_MESSAGES=20
AGENT_CLI_STREAM=true
AGENT_CLI_STREAM_TRACE=false
AGENT_CLI_WEB_SEARCH=false
AGENT_CLI_GLOBAL_SKILLS=false

# Provider credentials
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=

# OpenAI-compatible
OPENAI_COMPATIBLE_API_KEY=
OPENAI_COMPATIBLE_BASE_URL=

# Ollama
OLLAMA_BASE_URL=http://localhost:11434/v1

# Azure OpenAI
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_RESOURCE_NAME=
AZURE_OPENAI_DEPLOYMENT_NAME=
# AZURE_OPENAI_API_VERSION=
`;
var loadedDotEnvPaths = /* @__PURE__ */ new Set();
function resolveWorkspaceDotEnvPath(workspaceRoot = WORKSPACE_ROOT) {
  return path4.join(workspaceRoot || process.cwd(), ".env");
}
function ensureDotEnvExampleFile(dotEnvPath) {
  if (fs4.existsSync(dotEnvPath)) {
    return;
  }
  const examplePath = path4.join(path4.dirname(dotEnvPath), ".env.example");
  if (fs4.existsSync(examplePath)) {
    return;
  }
  try {
    fs4.writeFileSync(examplePath, DOTENV_EXAMPLE_CONTENT, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return;
    }
    throw error;
  }
}
function loadAllowedDotEnvEnvironment(workspaceRoot = WORKSPACE_ROOT) {
  const dotEnvPath = resolveWorkspaceDotEnvPath(workspaceRoot);
  if (loadedDotEnvPaths.has(dotEnvPath)) {
    return;
  }
  loadedDotEnvPaths.add(dotEnvPath);
  ensureDotEnvExampleFile(dotEnvPath);
  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: dotEnvPath,
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
function prepareWorkspaceEnvironment(workspaceRoot) {
  const resolvedRoot = configureWorkspaceRoot(workspaceRoot);
  loadAllowedDotEnvEnvironment(resolvedRoot);
  return resolvedRoot;
}

// core/chat-store.ts
import { randomUUID } from "node:crypto";
import { promises as fs5 } from "node:fs";
import path5 from "node:path";
function createChatId(now = /* @__PURE__ */ new Date()) {
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
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
  const directoryPath = path5.dirname(filePath);
  const fileName = path5.basename(filePath);
  const temporaryPath = path5.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  await fs5.mkdir(directoryPath, { recursive: true });
  await fs5.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, "utf8");
  await fs5.rename(temporaryPath, filePath);
}
async function writeTextAtomic(filePath, text) {
  const directoryPath = path5.dirname(filePath);
  const fileName = path5.basename(filePath);
  const temporaryPath = path5.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  await fs5.mkdir(directoryPath, { recursive: true });
  await fs5.writeFile(temporaryPath, text, "utf8");
  await fs5.rename(temporaryPath, filePath);
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
  await fs5.mkdir(path5.dirname(filePath), { recursive: true });
  const serialized = `${values.map((value) => JSON.stringify(value)).join("\n")}
`;
  await fs5.appendFile(filePath, serialized, "utf8");
}
async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await fs5.readFile(filePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function pathExists(filePath) {
  try {
    await fs5.access(filePath);
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
    rawContent = await fs5.readFile(filePath, "utf8");
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
async function ensureChatStorage() {
  await ensureWorkspaceWorld();
  await fs5.mkdir(AGENT_WORLD_CHATS_ROOT, { recursive: true });
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
async function readCurrentChatId() {
  const current = await readJsonIfPresent(CURRENT_CHAT_PATH);
  return String(
    current && typeof current === "object" && "chatId" in current ? current.chatId ?? "" : ""
  ).trim();
}
async function writeCurrentChatId(chatId) {
  await writeJsonAtomic(CURRENT_CHAT_PATH, {
    chatId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
}
async function persistWorldChat(chat) {
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
async function loadWorldChatMetadata(chatId) {
  const metadataPath = buildWorldChatMetadataPath(chatId);
  let rawContent;
  try {
    rawContent = await fs5.readFile(metadataPath, "utf8");
  } catch {
    throw new Error(`Missing chat session file: ${buildWorldChatMessagesPath(chatId)}`);
  }
  try {
    return JSON.parse(rawContent);
  } catch {
    throw new Error(`Invalid chat session file: ${metadataPath}`);
  }
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
async function loadChatById(chatId) {
  await ensureChatStorage();
  return await loadWorldChatById(chatId);
}
async function listPersistedChats() {
  await ensureChatStorage();
  const currentChatId = await readCurrentChatId();
  const entries = await fs5.readdir(AGENT_WORLD_CHATS_ROOT, { withFileTypes: true });
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
async function setCurrentChat(chatId) {
  await ensureChatStorage();
  const chat = await loadChatById(chatId);
  await writeCurrentChatId(chat.id);
  return chat;
}
async function loadRequestedChat({ newChat }) {
  await ensureChatStorage();
  if (newChat) {
    return await createPersistedChat();
  }
  const chatId = await readCurrentChatId();
  if (!chatId) {
    return await createPersistedChat();
  }
  try {
    return await loadChatById(chatId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing chat session file: ")) {
      return await createPersistedChat();
    }
    throw error;
  }
}
async function persistCompletedChat({ chat, messages, setCurrent = true }) {
  await ensureChatStorage();
  const persistedChat = await persistWorldChat({
    id: chat.id,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages
  });
  if (setCurrent) {
    await writeCurrentChatId(chat.id);
  }
  return persistedChat;
}
async function clearPersistedChatEvents(chat) {
  await ensureChatStorage();
  await writeTextAtomic(buildWorldChatEventsPath(chat.id), "");
}
async function persistStreamTraceEvents({ chat, streamTraceEvents }) {
  if (!Array.isArray(streamTraceEvents) || streamTraceEvents.length === 0) {
    return null;
  }
  await ensureChatStorage();
  const eventsPath = buildWorldChatEventsPath(chat.id);
  await appendJsonl(eventsPath, streamTraceEvents.map((event) => ({
    kind: "stream_trace",
    chatId: chat.id,
    type: String(event.type ?? ""),
    text: String(event.text ?? ""),
    createdAt: normalizeTimestamp(event.createdAt, (/* @__PURE__ */ new Date()).toISOString()),
    ...typeof event.stopKind === "string" && event.stopKind.trim() ? { stopKind: event.stopKind } : {},
    ...typeof event.finishReason === "string" && event.finishReason.trim() ? { finishReason: event.finishReason } : {},
    ...event.usage && typeof event.usage === "object" ? { usage: event.usage } : {}
  })));
  return eventsPath;
}

// cli/src/human-input-ui.ts
var EXIT_HUMAN_INPUT_TOKEN = "0";
var HUMAN_INPUT_TOOL_NAMES = /* @__PURE__ */ new Set([
  "ask_user_input",
  "ask_human_input",
  "human_intervention_request",
  "ask_user_question"
]);
function isHumanInputToolName(toolName) {
  return HUMAN_INPUT_TOOL_NAMES.has(toolName);
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJsonRecord(value) {
  if (isRecord3(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord3(parsed) ? parsed : null;
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
  if (!isRecord3(value)) {
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
  if (!isRecord3(value)) {
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
  if (!isHumanInputToolName(toolName)) {
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
  const lines = [question.question, ""];
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
  const clearFrame = `\r\x1B[2K${" ".repeat(Math.max(...frames.map((frame) => frame.length)))}\r\x1B[2K`;
  let frameIndex = frames.length - 1;
  let interval = null;
  let pendingVisible = false;
  let wroteText = false;
  let cursorAtLineStart = true;
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
    start(options = {}) {
      if (!output.isTTY || interval || pendingVisible) {
        return;
      }
      if (options.separateFromText === true && wroteText && !cursorAtLineStart) {
        output.write("\n");
        cursorAtLineStart = true;
      }
      pendingVisible = true;
      frameIndex = frames.length - 1;
      output.write(frames[frameIndex] ?? "...");
      cursorAtLineStart = false;
      interval = setInterval(() => {
        frameIndex = (frameIndex + 1) % frames.length;
        writeFrame(frames[frameIndex] ?? "...");
      }, 250);
      interval.unref?.();
    },
    clear() {
      stop();
      if (pendingVisible) {
        output.write(clearFrame);
        pendingVisible = false;
        cursorAtLineStart = true;
      }
    },
    writeText(text) {
      this.clear();
      if (text) {
        wroteText = true;
        output.write(text);
        cursorAtLineStart = /(?:\r?\n|\r)$/u.test(text);
      }
    },
    noteExternalOutput(text) {
      wroteText = true;
      cursorAtLineStart = typeof text === "string" && text.length > 0 ? /(?:\r?\n|\r)$/u.test(text) : false;
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
function isRecord4(value) {
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
  if (isRecord4(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return isRecord4(parsed) ? parsed : null;
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
    if (isRecord4(value)) {
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
  const path7 = readFirstString(record, "path", "filePath");
  const type = readFirstString(record, "type", "kind");
  const preview = [
    path7 ? truncateOneLine(`path: ${path7}`, MAX_PREVIEW_LINE_WIDTH) : null,
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
  const matches = Array.isArray(data) ? data.filter(isRecord4) : [];
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
  const matches = Array.isArray(data) ? data.filter(isRecord4) : [];
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
  const entries = Array.isArray(data) ? data.filter(isRecord4) : [];
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
  const path7 = readFirstString(data, "path");
  const content = readFirstString(data, "content");
  const sizeSummary = contentEncoding === "base64" ? "base64" : content === null ? null : formatLineCount(countLines(content));
  const summary = sizeSummary ? `${contentType} \xB7 ${sizeSummary}` : contentType;
  return {
    name: "read_content",
    ok: true,
    durationMs,
    summary,
    preview: path7 ? [`path: ${truncateOneLine(path7, MAX_PREVIEW_LINE_WIDTH - 6)}`] : void 0,
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
  const data = isRecord4(record?.data) ? record.data : null;
  const path7 = readFirstString(data, "path") ?? readFirstString(record, "path");
  const summary = toolName === "delete_content" ? "deleted" : toolName === "create_content" || readFirstBoolean(data, "created") === true ? "created" : "updated";
  return {
    name: toolName,
    ok: true,
    durationMs,
    summary: path7 ? `${summary} \xB7 ${truncateOneLine(path7, MAX_PREVIEW_LINE_WIDTH)}` : summary,
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
function summarizeLoadSkillResult(result, forcedDurationMs) {
  if (typeof result !== "string") {
    return summarizeGenericToolResult(result, "load_skill", forcedDurationMs);
  }
  const errorMatch = result.match(/<error>\s*([\s\S]*?)\s*<\/error>/);
  const errorSummary = errorMatch ? truncateOneLine(errorMatch[1].replace(/\s+/g, " ").trim(), MAX_PREVIEW_LINE_WIDTH) : null;
  const lineCount = countLines(result);
  return {
    name: "load_skill",
    ok: errorSummary === null,
    durationMs: forcedDurationMs,
    summary: errorSummary ?? (lineCount > 1 ? formatLineCount(lineCount) : truncateOneLine(result, MAX_PREVIEW_LINE_WIDTH)),
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
  if (toolName === "shell_cmd" && isRecord4(args)) {
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
  if (isRecord4(args)) {
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
  if (toolName === "load_skill") {
    return summarizeLoadSkillResult(result, durationMs);
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
function formatTokenUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  const parts = [];
  if (typeof usage.inputTokens === "number" && Number.isFinite(usage.inputTokens)) {
    parts.push(`input=${usage.inputTokens}`);
  }
  if (typeof usage.outputTokens === "number" && Number.isFinite(usage.outputTokens)) {
    parts.push(`output=${usage.outputTokens}`);
  }
  if (typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)) {
    parts.push(`total=${usage.totalTokens}`);
  }
  return parts.length > 0 ? `tokens ${parts.join(" ")}` : null;
}
function formatModelResponseDiagnostic(response) {
  const parts = [];
  if (typeof response.stopKind === "string" && response.stopKind.trim()) {
    parts.push(`stopKind=${response.stopKind}`);
  }
  if (typeof response.providerStopReason === "string" && response.providerStopReason.trim()) {
    parts.push(`finish_reason=${response.providerStopReason}`);
  }
  const usage = formatTokenUsage(response.usage);
  if (usage) {
    parts.push(usage);
  }
  return parts.length > 0 ? `
  \u2713 model.response ${parts.join(" \xB7 ")}
` : "";
}

// cli/src/verbose-display.ts
var ANSI_GRAY = "\x1B[90m";
var ANSI_RESET = "\x1B[0m";
function writeTypeTransitionSeparator(output, previousType, nextType) {
  if (previousType && previousType !== nextType) {
    output.write("\n");
  }
}
function grayForTerminal(stderr, text) {
  return stderr.isTTY ? `${ANSI_GRAY}${text}${ANSI_RESET}` : text;
}
function stripLeadingLineBreaks(text) {
  return text.replace(/^\n+/, "");
}
function countLeadingLineBreaks(text) {
  return text.match(/^\n*/)?.[0].length ?? 0;
}
function countTrailingLineBreaks(text) {
  return text.match(/\n*$/)?.[0].length ?? 0;
}
function ensureLeadingLineBreaks(text, minimumCount) {
  return `${"\n".repeat(Math.max(0, minimumCount - countLeadingLineBreaks(text)))}${text}`;
}
function ensureTotalBoundaryLineBreaks(text, previousTrailingLineBreaks, minimumCount) {
  const leadingLineBreaks = countLeadingLineBreaks(text);
  const missingLineBreaks = Math.max(0, minimumCount - previousTrailingLineBreaks - leadingLineBreaks);
  return `${"\n".repeat(missingLineBreaks)}${text}`;
}
function isVerboseDiagnosticType(type) {
  return type === "warning" || type === "error" || type === "tool_call" || type === "tool_result" || type === "model_response";
}
function createVerboseDisplay({
  stdout,
  stderr,
  clearPending,
  enabled
}) {
  let lastVisibleOutputType = null;
  let lastVerboseDiagnosticTrailingLineBreaks = 0;
  let reasoningOpen = false;
  function beginReasoning(previousType) {
    if (reasoningOpen) {
      return;
    }
    clearPending?.();
    if (lastVisibleOutputType === "assistant_text") {
      stderr.write("\n\n");
    } else {
      writeTypeTransitionSeparator(stderr, previousType, "reasoning");
    }
    stderr.write(stderr.isTTY ? ANSI_GRAY : "");
    reasoningOpen = true;
    lastVisibleOutputType = "verbose_diagnostic";
    lastVerboseDiagnosticTrailingLineBreaks = 0;
  }
  function writeDiagnosticBlock(text, options = {}) {
    let separatedText = text;
    if (lastVisibleOutputType === "assistant_text") {
      separatedText = ensureLeadingLineBreaks(text, 2);
    } else if (options.separateFromVisibleOutput === true && lastVisibleOutputType !== null) {
      separatedText = ensureTotalBoundaryLineBreaks(text, lastVerboseDiagnosticTrailingLineBreaks, 2);
    }
    lastVerboseDiagnosticTrailingLineBreaks = countTrailingLineBreaks(separatedText);
    lastVisibleOutputType = "verbose_diagnostic";
    stderr.write(grayForTerminal(stderr, separatedText));
  }
  return {
    closeReasoning() {
      if (!reasoningOpen) {
        return false;
      }
      stderr.write(stderr.isTTY ? `${ANSI_RESET}

` : "\n\n");
      reasoningOpen = false;
      lastVisibleOutputType = "verbose_diagnostic";
      lastVerboseDiagnosticTrailingLineBreaks = 2;
      return true;
    },
    noteAssistantText(text) {
      if (text) {
        lastVisibleOutputType = "assistant_text";
      }
    },
    beforeAssistantText(currentDiagnosticType) {
      if (!enabled || lastVisibleOutputType !== "verbose_diagnostic" || !isVerboseDiagnosticType(currentDiagnosticType)) {
        return;
      }
      const missingLineBreaks = Math.max(0, 2 - lastVerboseDiagnosticTrailingLineBreaks);
      if (missingLineBreaks > 0) {
        stdout.write("\n".repeat(missingLineBreaks));
      }
      lastVerboseDiagnosticTrailingLineBreaks = 0;
    },
    writeReasoning(text, previousType) {
      beginReasoning(previousType);
      stderr.write(text);
    },
    writeDiagnostic(text, diagnosticType, options = {}) {
      const closedReasoning = this.closeReasoning();
      const outputText = closedReasoning ? stripLeadingLineBreaks(text) : text;
      writeDiagnosticBlock(outputText, {
        separateFromVisibleOutput: options.separateFromVisibleOutput === true || diagnosticType === "tool_call"
      });
    }
  };
}

// cli/src/turn-executor.ts
function shouldHoldPotentialHumanInputPrompt(text) {
  const normalized = text.replace(/\s+/g, " ").trimStart().toLowerCase();
  if (!normalized) {
    return false;
  }
  const promptPrefixes = [
    "please select",
    "select",
    "please choose",
    "choose",
    "reply with",
    "answer with"
  ];
  return promptPrefixes.some((prefix) => prefix.startsWith(normalized) || normalized.startsWith(prefix));
}
function normalizeStreamTraceUsage(value) {
  if (!value || typeof value !== "object") {
    return void 0;
  }
  const usage = value;
  const normalizedUsage = {};
  for (const key of ["inputTokens", "outputTokens", "totalTokens"]) {
    if (typeof usage[key] === "number" && Number.isFinite(usage[key])) {
      normalizedUsage[key] = usage[key];
    }
  }
  return Object.keys(normalizedUsage).length > 0 ? normalizedUsage : void 0;
}
function isToolContinuationModelResponse(response) {
  const stopKind = typeof response.stopKind === "string" ? response.stopKind.toLowerCase() : "";
  const finishReason = typeof response.providerStopReason === "string" ? response.providerStopReason.toLowerCase() : "";
  return stopKind.includes("tool") || finishReason.includes("tool");
}
function toolDisplayKey(toolEvent) {
  return typeof toolEvent.id === "string" && toolEvent.id.trim() ? toolEvent.id : `${String(toolEvent.name ?? "unknown_tool")}\0${String(toolEvent.arguments ?? "")}`;
}
async function resolveEffectiveAgentConfig(options = {}) {
  const persistedAgentConfig = loadPersistedRuntimeConfig();
  const baseAgentConfig = {
    ...persistedAgentConfig,
    ...options.optionAgentConfig ?? {}
  };
  return {
    ...baseAgentConfig,
    ...options.runtimeOverrides ?? {}
  };
}
function createTurnExecutor(options) {
  const builtInSystemPrompt = getBuiltInSystemPrompt();
  const stderr = options.io.stderr ?? process.stderr;
  return async function executeTurn({
    chat,
    message,
    approvalGate,
    abortSignal,
    onAssistantChunk,
    inputPrompt
  }) {
    const streamTraceEnabled = options.agentConfig.streamTrace === true;
    const streamTraceEvents = [];
    const pendingTextTraceEvents = [];
    const displayedVerboseToolCallIds = /* @__PURE__ */ new Set();
    let lastStreamType = null;
    let heldAssistantText = "";
    const pendingDisplay = createPendingDisplay(options.io.stdout);
    const verboseDisplay = createVerboseDisplay({
      stdout: options.io.stdout,
      stderr,
      clearPending: () => pendingDisplay.clear(),
      enabled: options.verbose
    });
    const pastMessages = Number(options.agentConfig.pastMessages);
    const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0 ? pastMessages : 0;
    function writeAssistantText(text) {
      pendingDisplay.writeText(text);
      verboseDisplay.noteAssistantText(text);
      void onAssistantChunk?.(text);
    }
    function flushHeldAssistantText() {
      if (!heldAssistantText) {
        return;
      }
      pendingDisplay.clear();
      verboseDisplay.beforeAssistantText(lastStreamType);
      writeAssistantText(heldAssistantText);
      heldAssistantText = "";
    }
    function annotatePendingTextTraceEvents(response) {
      if (pendingTextTraceEvents.length === 0) {
        return;
      }
      const stopKind = typeof response.stopKind === "string" && response.stopKind.trim() ? response.stopKind : void 0;
      const finishReason = typeof response.providerStopReason === "string" && response.providerStopReason.trim() ? response.providerStopReason : void 0;
      const usage = normalizeStreamTraceUsage(response.usage);
      for (const event of pendingTextTraceEvents) {
        if (stopKind) {
          event.stopKind = stopKind;
        }
        if (finishReason) {
          event.finishReason = finishReason;
        }
        if (usage) {
          event.usage = usage;
        }
      }
      pendingTextTraceEvents.length = 0;
    }
    function resumePendingAssistantText() {
      if (!options.streamOff) {
        pendingDisplay.start({ separateFromText: true });
      }
    }
    try {
      if (!options.streamOff) {
        pendingDisplay.start();
      }
      const turnResult = await runChatTurn({
        chat,
        userMessage: message,
        stream: !options.streamOff,
        approvalGate,
        abortSignal,
        onStreamChunk: options.streamOff ? void 0 : async (chunk) => {
          const reasoningText = [
            chunk.reasoningContent,
            chunk.reasoning,
            chunk.reasoningText,
            chunk.thinking
          ].find((value) => typeof value === "string" && value.length > 0);
          const streamErrors = [
            ...Array.isArray(chunk.errors) ? chunk.errors : [],
            ...chunk.error ? [chunk.error] : []
          ];
          for (const warning of chunk.warnings ?? []) {
            const warningText = String(
              warning && typeof warning === "object" && "message" in warning ? warning.message : JSON.stringify(warning ?? null)
            );
            if (options.verbose) {
              pendingDisplay.clear();
              const diagnostic = `warning: ${warningText}
`;
              verboseDisplay.writeDiagnostic(diagnostic, "warning");
            }
            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: "warning",
                text: warningText,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
            lastStreamType = "warning";
          }
          for (const streamError of streamErrors) {
            const errorText = String(
              streamError && typeof streamError === "object" && "message" in streamError ? streamError.message : JSON.stringify(streamError ?? null)
            );
            if (options.verbose) {
              pendingDisplay.clear();
              const diagnostic = `error: ${errorText}
`;
              verboseDisplay.writeDiagnostic(diagnostic, "error");
            }
            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: "error",
                text: errorText,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
            lastStreamType = "error";
          }
          if (reasoningText) {
            if (options.verbose) {
              verboseDisplay.writeReasoning(reasoningText, lastStreamType);
              lastStreamType = "reasoning";
            }
            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: "reasoning",
                text: reasoningText,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
            if (!options.verbose) {
              lastStreamType = "reasoning";
            }
          }
          if (chunk.content) {
            const closedReasoning = verboseDisplay.closeReasoning();
            if (!closedReasoning) {
              pendingDisplay.clear();
              verboseDisplay.beforeAssistantText(lastStreamType);
            }
            if (heldAssistantText || shouldHoldPotentialHumanInputPrompt(chunk.content)) {
              heldAssistantText += chunk.content;
            } else {
              writeAssistantText(chunk.content);
            }
            if (streamTraceEnabled) {
              const textTraceEvent = {
                type: "text",
                text: chunk.content,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              };
              streamTraceEvents.push(textTraceEvent);
              pendingTextTraceEvents.push(textTraceEvent);
            }
            lastStreamType = "text";
          }
        },
        onModelResponse: (response) => {
          if (streamTraceEnabled) {
            annotatePendingTextTraceEvents(response);
          }
          if (options.verbose) {
            pendingDisplay.clear();
            const diagnostic = formatModelResponseDiagnostic(response);
            if (diagnostic) {
              verboseDisplay.writeDiagnostic(diagnostic, "model_response");
              lastStreamType = "model_response";
            }
            if (isToolContinuationModelResponse(response)) {
              resumePendingAssistantText();
            }
          } else if (!options.streamOff && isToolContinuationModelResponse(response)) {
            resumePendingAssistantText();
          }
        },
        onToolCall: (toolCall) => {
          const humanInputRequest = parseHumanInputRequest(
            toolCall.name,
            toolCall.arguments,
            toolCall.id
          );
          const humanInputToolCall = isHumanInputToolName(toolCall.name);
          if (humanInputRequest) {
            heldAssistantText = "";
          } else {
            flushHeldAssistantText();
          }
          if (options.verbose || humanInputRequest) {
            pendingDisplay.clear();
          } else if (!options.streamOff) {
            resumePendingAssistantText();
          }
          if (options.verbose) {
            const displayKey = toolDisplayKey(toolCall);
            if (!displayedVerboseToolCallIds.has(displayKey)) {
              displayedVerboseToolCallIds.add(displayKey);
              const diagnostic = formatToolCallDiagnostic(toolCall);
              const displayDiagnostic = humanInputToolCall ? `${diagnostic}

` : diagnostic;
              verboseDisplay.writeDiagnostic(displayDiagnostic, "tool_call");
            }
          }
          if (streamTraceEnabled) {
            streamTraceEvents.push({
              type: "tool",
              text: toolCall.arguments ? `${toolCall.name} ${toolCall.arguments}` : toolCall.name,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
          lastStreamType = "tool_call";
        },
        onToolResult: (toolResult) => {
          if (options.verbose) {
            pendingDisplay.clear();
            const displayKey = toolDisplayKey(toolResult);
            if (!displayedVerboseToolCallIds.has(displayKey)) {
              displayedVerboseToolCallIds.add(displayKey);
              verboseDisplay.writeDiagnostic(formatToolCallDiagnostic(toolResult), "tool_call");
            }
            const diagnostic = formatToolResultDiagnostic(toolResult);
            verboseDisplay.writeDiagnostic(diagnostic, "tool_result");
            resumePendingAssistantText();
          } else if (!options.streamOff) {
            resumePendingAssistantText();
          }
          lastStreamType = "tool_result";
        },
        historyMessageLimit,
        handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
          const request = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
          if (!request) {
            return { handled: false };
          }
          heldAssistantText = "";
          pendingDisplay.clear();
          const humanInputOutput = options.verbose ? stderr : options.io.stdout;
          const result = await collectHumanInputAnswer(request, inputPrompt, humanInputOutput);
          pendingDisplay.noteExternalOutput();
          resumePendingAssistantText();
          return {
            handled: true,
            result
          };
        },
        builtInSystemPrompt,
        workspaceSystemPrompt: options.workspaceSystemPrompt ?? options.projectSystemPrompt,
        projectSystemPrompt: options.projectSystemPrompt,
        skillInventory: options.skillInventory,
        agentConfig: options.agentConfig
      });
      verboseDisplay.closeReasoning();
      flushHeldAssistantText();
      await persistCompletedChat({
        chat,
        messages: turnResult.messages
      });
      if (streamTraceEnabled) {
        await persistStreamTraceEvents({
          chat,
          streamTraceEvents
        });
      }
      chat.messages = turnResult.messages;
      if (options.streamOff) {
        pendingDisplay.clear();
        verboseDisplay.beforeAssistantText(lastStreamType);
        options.io.stdout.write(`${turnResult.assistantText}
`);
      } else if (pendingDisplay.hasWrittenText()) {
        pendingDisplay.clear();
        options.io.stdout.write("\n");
      } else {
        pendingDisplay.clear();
      }
      return turnResult;
    } catch (error) {
      verboseDisplay.closeReasoning();
      pendingDisplay.clear();
      if (streamTraceEnabled) {
        const errorText = error instanceof Error ? error.message : String(error);
        streamTraceEvents.push({
          type: "error",
          text: errorText,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        });
        await persistStreamTraceEvents({
          chat,
          streamTraceEvents
        });
      }
      throw error;
    }
  };
}

// cli/src/agent-cli.ts
var WORKSPACE_ENV_KEY = WORKSPACE_ROOT_ENV_KEY;
function readMessageContent(message) {
  if (!message || typeof message !== "object" || !("content" in message)) {
    return "";
  }
  const content = message.content;
  return typeof content === "string" ? content : "";
}
function findLastAssistantText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object" || message.role !== "assistant") {
      continue;
    }
    const content = readMessageContent(message);
    if (content.trim()) {
      return content;
    }
  }
  return "";
}
function asksForNumberedOptionReply(text) {
  const normalized = text.replace(/\s+/g, " ").toLowerCase();
  return [
    "please select",
    "select one",
    "choose one",
    "reply with the exact",
    "reply with exact",
    "exact pattern name",
    "select a number"
  ].some((phrase) => normalized.includes(phrase));
}
function extractNumberedOptionLabel(rawOptionText) {
  const optionText = rawOptionText.trim();
  const formattedLabel = optionText.match(/^(?:\*\*([^*]+)\*\*|`([^`]+)`)/);
  if (formattedLabel) {
    return String(formattedLabel[1] ?? formattedLabel[2] ?? "").trim();
  }
  const separatedLabel = optionText.match(/^(.+?)(?:\s+[\u2013\u2014-]\s+|\s*:\s+|\s+\(|$)/);
  return String(separatedLabel?.[1] ?? optionText).trim().replace(/^\*\*|\*\*$/g, "").replace(/^`|`$/g, "");
}
function extractNumberedOptionReply(text, selectedNumber) {
  if (!asksForNumberedOptionReply(text)) {
    return null;
  }
  const optionLinePattern = /^\s*(\d+)[.)]\s+(.+?)\s*$/gm;
  let match;
  while ((match = optionLinePattern.exec(text)) !== null) {
    const optionNumber = Number(match[1]);
    if (optionNumber !== selectedNumber) {
      continue;
    }
    const label = extractNumberedOptionLabel(match[2] ?? "");
    return label || null;
  }
  return null;
}
function normalizeNumberedOptionReply(chat, input) {
  const trimmedInput = input.trim();
  if (!/^[1-9]\d*$/.test(trimmedInput)) {
    return input;
  }
  const assistantText = findLastAssistantText(chat.messages ?? []);
  const selectedOption = extractNumberedOptionReply(assistantText, Number(trimmedInput));
  return selectedOption ?? input;
}
function usageText() {
  return [
    "Usage: agent-cli [--workspace <path>] [--new-chat] [--verbose] [--stream-off] [runtime options] <message>",
    "",
    "Runtime options override AGENT_CLI_PROVIDER and AGENT_CLI_MODEL from .env when provided:",
    "  --provider <name>                 --model <name>",
    "  --temperature <number>            --max-tokens <number>",
    "  --tool-permission <auto|ask|read> --reasoning-effort <level>",
    "  --past-messages <count>           --stream-trace <true|false>",
    "  --web-search <true|false|low|medium|high>",
    "  --workspace <path>",
    "",
    "Examples:",
    '  agent-cli --new-chat "Map my next financial move"',
    '  agent-cli "What should I do first?"',
    '  agent-cli --verbose "What should I do first?"',
    '  agent-cli --stream-off "What should I do first?"',
    '  agent-cli --workspace /path/to/workspace "Summarize this repo"',
    '  agent-cli --provider google --model gemini-2.5-pro "Summarize this repo"'
  ].join("\n");
}
function startupText(cwd = WORKSPACE_ROOT, runtimeSettings, scopedSkills, agentWorldSummary) {
  const lines = [
    `Agent CLI starting in ${cwd}`
  ];
  if (runtimeSettings) {
    lines.push(runtimeSelectionText(runtimeSettings));
  }
  if (scopedSkills) {
    const skillText = skillStartupText(scopedSkills);
    if (skillText) {
      lines.push(skillText);
    }
  }
  const worldText = agentWorldStartupText(agentWorldSummary ?? null);
  if (worldText) {
    lines.push(worldText);
  }
  return lines.join("\n");
}
function runtimeSelectionText(runtimeSettings) {
  return `Runtime: provider=${runtimeSettings.provider}, model=${runtimeSettings.model}`;
}
function formatSkillIds(skills) {
  return skills.map((skill) => skill.skillId).sort((left, right) => left.localeCompare(right)).join(", ");
}
function skillStartupText(scopedSkills) {
  const scopeLines = [
    scopedSkills.user.length > 0 ? `  user: ${formatSkillIds(scopedSkills.user)}` : "",
    scopedSkills.project.length > 0 ? `  project: ${formatSkillIds(scopedSkills.project)}` : ""
  ].filter(Boolean);
  if (scopeLines.length === 0) {
    return "";
  }
  return [
    "Skills available:",
    ...scopeLines
  ].join("\n");
}
function createDefaultInteractivePrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}
function isCliEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!argvPath) {
    return false;
  }
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return pathToFileURL(path6.resolve(argvPath)).href === moduleUrl;
  }
}
function parseArguments(argv) {
  let newChat = false;
  let streamOff = false;
  let help = false;
  let verbose = false;
  let workspaceRoot;
  let projectRoot;
  const messageParts = [];
  const runtimeOverrides = {};
  const normalizeFlagName = (rawValue) => rawValue.trim().toLowerCase();
  const readFlagValue = (values, index, inlineValue, flagName, options = {}) => {
    if (inlineValue !== void 0) {
      return {
        nextIndex: index,
        value: inlineValue
      };
    }
    const nextValue = values[index + 1];
    if (typeof nextValue === "string" && !nextValue.startsWith("--")) {
      return {
        nextIndex: index + 1,
        value: nextValue
      };
    }
    if (options.allowBareTrue) {
      return {
        nextIndex: index,
        value: true
      };
    }
    throw new Error(`Missing value for flag: --${flagName}`);
  };
  const readOptionalFlagValue = (values, index, inlineValue, explicitValues) => {
    if (inlineValue !== void 0) {
      return {
        nextIndex: index,
        value: inlineValue
      };
    }
    const nextValue = values[index + 1];
    const normalizedNextValue = typeof nextValue === "string" ? nextValue.trim().toLowerCase() : "";
    if (explicitValues.includes(normalizedNextValue)) {
      return {
        nextIndex: index + 1,
        value: nextValue
      };
    }
    return {
      nextIndex: index,
      value: true
    };
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      messageParts.push(...argv.slice(index + 1));
      break;
    }
    if (arg === "--new-chat") {
      newChat = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--verbose" || arg === "-v") {
      verbose = true;
      continue;
    }
    if (arg === "--stream-off") {
      streamOff = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const flagBody = arg.slice(2);
      const equalsIndex = flagBody.indexOf("=");
      const rawFlagName = equalsIndex >= 0 ? flagBody.slice(0, equalsIndex) : flagBody;
      const inlineValue = equalsIndex >= 0 ? flagBody.slice(equalsIndex + 1) : void 0;
      const flagName = normalizeFlagName(rawFlagName);
      if (flagName === "provider") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides.provider = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "workspace" || flagName === "project") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        workspaceRoot = String(result.value);
        if (flagName === "project") {
          projectRoot = String(result.value);
        }
        index = result.nextIndex;
        continue;
      }
      if (flagName === "model") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides.model = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "temperature") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides.temperature = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "max-tokens" || flagName === "max-output-tokens") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides["max-tokens"] = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "tool-permission" || flagName === "permission" || flagName === "permissions") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides["tool-permission"] = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "reasoning-effort" || flagName === "reasoning") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides["reasoning-effort"] = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "past-messages" || flagName === "history-messages") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        runtimeOverrides["past-messages"] = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "stream-trace") {
        const result = readOptionalFlagValue(argv, index, inlineValue, ["true", "false"]);
        runtimeOverrides["stream-trace"] = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "no-stream-trace") {
        runtimeOverrides["stream-trace"] = false;
        continue;
      }
      if (flagName === "web-search") {
        const result = readOptionalFlagValue(argv, index, inlineValue, ["true", "false", "low", "medium", "high"]);
        runtimeOverrides["web-search"] = result.value;
        index = result.nextIndex;
        continue;
      }
      if (flagName === "no-web-search") {
        runtimeOverrides["web-search"] = false;
        continue;
      }
      throw new Error(`Unknown flag: ${arg}`);
    }
    messageParts.push(arg);
  }
  return {
    help,
    newChat,
    ...workspaceRoot !== void 0 ? { workspaceRoot } : {},
    ...projectRoot !== void 0 ? { projectRoot } : {},
    runtimeOverrides: normalizeAgentConfig(runtimeOverrides),
    streamOff,
    verbose,
    message: messageParts.join(" ").trim()
  };
}
function formatChatListItem(chat) {
  const marker = chat.isCurrent ? "*" : " ";
  const timestamp = String(chat.updatedAt || chat.createdAt || "").trim();
  const messageCount = Number.isFinite(chat.messageCount) ? Number(chat.messageCount) : 0;
  return `${marker} ${chat.id} (${messageCount} messages)${timestamp ? ` updated ${timestamp}` : ""}`;
}
function isInteractiveExitError(error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  return code === "ERR_USE_AFTER_CLOSE" || code === "ABORT_ERR";
}
async function runInteractiveSession({
  prompt,
  executeTurn,
  initialChat,
  io
}) {
  const stderr = io.stderr ?? process.stderr;
  let chat = initialChat;
  io.stdout.write("Agent CLI interactive mode. Commands: /new, /clear, /chats, /use <chatId>, /exit\n\n");
  try {
    while (true) {
      let input = "";
      try {
        input = (await prompt.question("> ")).trim();
      } catch (error) {
        if (isInteractiveExitError(error)) {
          io.stdout.write("\n");
          break;
        }
        throw error;
      }
      if (!input) {
        continue;
      }
      if (input === "/exit" || input === "/quit") {
        break;
      }
      if (input === "/new") {
        chat = await createPersistedChat();
        io.stdout.write(`new chat ${chat.id}

`);
        continue;
      }
      if (input === "/clear") {
        chat = await persistCompletedChat({
          chat,
          messages: []
        });
        await clearPersistedChatEvents(chat);
        io.stdout.write("history cleared\n\n");
        continue;
      }
      if (input === "/chats") {
        const chats = await listPersistedChats();
        if (chats.length === 0) {
          io.stdout.write("no chats\n\n");
          continue;
        }
        io.stdout.write(`${chats.map(formatChatListItem).join("\n")}

`);
        continue;
      }
      if (input.startsWith("/use ")) {
        const chatId = input.slice("/use ".length).trim();
        try {
          chat = await setCurrentChat(chatId);
          io.stdout.write(`selected chat ${chat.id}

`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          stderr.write(`command failed: ${message}

`);
        }
        continue;
      }
      if (input.startsWith("/")) {
        stderr.write(`unknown command: ${input}

`);
        continue;
      }
      const normalizedInput = normalizeNumberedOptionReply(chat, input);
      try {
        await executeTurn({
          chat,
          message: normalizedInput,
          inputPrompt: prompt
        });
        io.stdout.write("\n");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stderr.write(`request failed: ${message}

`);
      }
    }
  } finally {
    prompt.close?.();
  }
  return null;
}
async function main(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }, options = {}) {
  const {
    help,
    newChat,
    workspaceRoot,
    projectRoot,
    runtimeOverrides,
    streamOff,
    verbose,
    message
  } = parseArguments(argv);
  prepareWorkspaceEnvironment(workspaceRoot ?? projectRoot);
  await ensureWorkspaceWorld();
  if (help) {
    io.stdout.write(`${usageText()}
`);
    return null;
  }
  const agentSetupPrompt = options.interactivePrompt;
  let agentSetupPromptPassedToInteractive = false;
  const agentConfig = await resolveEffectiveAgentConfig({
    optionAgentConfig: options.agentConfig,
    runtimeOverrides
  });
  const effectiveStreamOff = streamOff || agentConfig.stream === false;
  const [workspaceSystemPrompt, scopedSkillInventory, agentWorldSummary] = await Promise.all([
    loadWorkspaceSystemPrompt(),
    loadSkillInventoryByScope(),
    loadAgentWorldStartupSummary()
  ]);
  const chat = await loadRequestedChat({ newChat });
  const skillInventory = flattenSkillInventoryByPrecedence(scopedSkillInventory);
  if (options.startupDiagnostics) {
    (io.stderr ?? process.stderr).write(
      `${startupText(
        WORKSPACE_ROOT,
        resolveRuntimeSelection(process.env, agentConfig),
        scopedSkillInventory,
        agentWorldSummary
      )}
`
    );
  }
  const executeTurn = createTurnExecutor({
    io,
    verbose,
    streamOff: effectiveStreamOff,
    agentConfig,
    workspaceSystemPrompt,
    skillInventory
  });
  if (!message) {
    agentSetupPromptPassedToInteractive = Boolean(agentSetupPrompt);
    return await runInteractiveSession({
      prompt: agentSetupPrompt ?? createDefaultInteractivePrompt(),
      executeTurn,
      initialChat: chat,
      io
    });
  }
  const oneShotInputPrompt = options.interactivePrompt ?? agentSetupPrompt ?? (process.stdin.isTTY ? createDefaultInteractivePrompt() : void 0);
  const createdOneShotInputPrompt = !options.interactivePrompt && !agentSetupPrompt ? oneShotInputPrompt : void 0;
  try {
    return await executeTurn({
      chat,
      message: normalizeNumberedOptionReply(chat, message),
      inputPrompt: oneShotInputPrompt
    });
  } finally {
    createdOneShotInputPrompt?.close?.();
    if (!options.interactivePrompt && !agentSetupPromptPassedToInteractive) {
      agentSetupPrompt?.close?.();
    }
  }
}
async function runCli(argv = process.argv.slice(2), io = { stdout: process.stdout, stderr: process.stderr }) {
  try {
    const parsed = parseArguments(argv);
    prepareWorkspaceEnvironment(parsed.workspaceRoot ?? parsed.projectRoot);
    await ensureWorkspaceWorld();
    await main(argv, io, { startupDiagnostics: !parsed.help });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message.trim()}
`);
    process.exitCode = 1;
  }
}
if (isCliEntrypoint()) {
  await runCli();
}
export {
  WORKSPACE_ENV_KEY,
  isCliEntrypoint,
  main,
  normalizeNumberedOptionReply,
  parseArguments,
  runCli,
  runtimeSelectionText,
  skillStartupText,
  startupText,
  usageText
};
