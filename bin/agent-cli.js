#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// cli/src/cli-shell.ts
import { realpathSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import path4 from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config as loadDotEnvConfig } from "dotenv";

// core/agent-config.js
import { promises as fs } from "node:fs";

// core/paths.js
import path from "node:path";
function resolveProjectRoot(projectRoot) {
  const configuredRoot = String(projectRoot ?? process.env.AGENT_CLI_ROOT ?? "").trim();
  return configuredRoot ? path.resolve(configuredRoot) : process.cwd();
}
var REPO_ROOT = "";
var SYSTEM_PROMPT_PATH = "";
var ROOT_RUNTIME_CONFIG_PATH = "";
var SKILLS_ROOT = "";
var AGENT_WORLD_ROOT = "";
var WORLD_STATE_PATH = "";
var AGENT_WORLD_CHATS_ROOT = "";
var AGENT_WORLD_AGENTS_ROOT = "";
var REMOTE_HOST_LOCK_PATH = "";
function configureProjectRoot(projectRoot) {
  REPO_ROOT = resolveProjectRoot(projectRoot);
  SYSTEM_PROMPT_PATH = path.join(REPO_ROOT, "AGENTS.md");
  ROOT_RUNTIME_CONFIG_PATH = path.join(REPO_ROOT, "runtime.json");
  AGENT_WORLD_ROOT = path.join(REPO_ROOT, ".agent-world");
  SKILLS_ROOT = path.join(AGENT_WORLD_ROOT, "skills");
  WORLD_STATE_PATH = path.join(AGENT_WORLD_ROOT, "world.json");
  AGENT_WORLD_CHATS_ROOT = path.join(AGENT_WORLD_ROOT, "chats");
  AGENT_WORLD_AGENTS_ROOT = path.join(AGENT_WORLD_ROOT, "agents");
  REMOTE_HOST_LOCK_PATH = path.join(AGENT_WORLD_ROOT, "remote-host.lock.json");
  return REPO_ROOT;
}
configureProjectRoot();
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
function buildAgentRuntimeConfigPath(agentId) {
  return path.join(buildAgentDirectoryPath(agentId), "runtime.json");
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
async function loadProjectSystemPrompt() {
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

// core/session-store.js
import { randomUUID } from "node:crypto";
import { promises as fs3 } from "node:fs";
import path3 from "node:path";
var DEFAULT_AGENT_ID = "default";
function defaultWorldName() {
  return path3.basename(REPO_ROOT) || "agent-world";
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
  const temporaryPath = path3.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.tmp`);
  await fs3.mkdir(directoryPath, { recursive: true });
  await fs3.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}
`, "utf8");
  await fs3.rename(temporaryPath, filePath);
}
async function writeTextAtomic(filePath, text) {
  const directoryPath = path3.dirname(filePath);
  const fileName = path3.basename(filePath);
  const temporaryPath = path3.join(directoryPath, `.${fileName}.${process.pid}.${Date.now()}.tmp`);
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
async function ensureRemoteHostLockDirectory() {
  await fs3.mkdir(path3.dirname(REMOTE_HOST_LOCK_PATH), { recursive: true });
}
async function ensureAgentWorldDirectories() {
  await Promise.all([
    fs3.mkdir(AGENT_WORLD_ROOT, { recursive: true }),
    fs3.mkdir(AGENT_WORLD_CHATS_ROOT, { recursive: true }),
    fs3.mkdir(AGENT_WORLD_AGENTS_ROOT, { recursive: true })
  ]);
}
function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EPERM");
  }
}
function isActiveRemoteHostLock(remoteLock) {
  if (!remoteLock || typeof remoteLock !== "object") {
    return false;
  }
  return isProcessRunning(Number(remoteLock.pid));
}
function buildRemoteHostConflictError(remoteLock) {
  const chatId = String(remoteLock && typeof remoteLock === "object" && "chatId" in remoteLock ? remoteLock.chatId ?? "" : "").trim();
  const pid = Number(remoteLock && typeof remoteLock === "object" && "pid" in remoteLock ? remoteLock.pid : NaN);
  const details = [
    chatId ? `chat ${chatId}` : null,
    Number.isInteger(pid) && pid > 0 ? `pid ${pid}` : null
  ].filter(Boolean).join(", ");
  return new Error(details ? `Remote mode already active for this project root (${details}).` : "Remote mode already active for this project root.");
}
async function readRemoteHostLock() {
  try {
    return JSON.parse(await fs3.readFile(REMOTE_HOST_LOCK_PATH, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }
    return null;
  }
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
async function assertNoActiveRemoteHost() {
  const remoteLock = await readRemoteHostLock();
  if (!remoteLock) {
    return null;
  }
  if (isActiveRemoteHostLock(remoteLock)) {
    throw buildRemoteHostConflictError(remoteLock);
  }
  await fs3.rm(REMOTE_HOST_LOCK_PATH, { force: true });
  return null;
}
async function acquireRemoteHostLock({ chat }) {
  await ensureRemoteHostLockDirectory();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const remoteLock = {
    chatId: chat.id,
    pid: process.pid,
    startedAt: now,
    updatedAt: now
  };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs3.writeFile(REMOTE_HOST_LOCK_PATH, `${JSON.stringify(remoteLock, null, 2)}
`, { encoding: "utf8", flag: "wx" });
      return remoteLock;
    } catch (error) {
      if (!error || typeof error !== "object" || !("code" in error) || error.code !== "EEXIST") {
        throw error;
      }
      const existingRemoteLock = await readRemoteHostLock();
      if (isActiveRemoteHostLock(existingRemoteLock)) {
        throw buildRemoteHostConflictError(existingRemoteLock);
      }
      await fs3.rm(REMOTE_HOST_LOCK_PATH, { force: true });
    }
  }
  throw new Error("Failed to acquire the remote host lock for this project root.");
}
async function releaseRemoteHostLock() {
  const remoteLock = await readRemoteHostLock();
  if (!remoteLock || Number(remoteLock.pid) !== process.pid) {
    return false;
  }
  await fs3.rm(REMOTE_HOST_LOCK_PATH, { force: true });
  return true;
}
async function updateRemoteHostLock({ chatId }) {
  const remoteLock = await readRemoteHostLock();
  if (!remoteLock || Number(remoteLock.pid) !== process.pid) {
    return false;
  }
  await writeJsonAtomic(REMOTE_HOST_LOCK_PATH, {
    ...remoteLock,
    chatId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  });
  return true;
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
async function loadRequestedChat({ newChat, agentId }) {
  if (newChat) {
    return createEmptyChat();
  }
  const world = await ensureWorldBootstrap();
  const selectedAgentId = normalizeAgentId2(agentId ?? world.defaultAgentId);
  const chatId = String(world.currentChatId ?? "").trim();
  if (!chatId) {
    return createEmptyChat();
  }
  try {
    const metadata = await loadWorldChatMetadata(chatId);
    const chatAgentId = String(metadata.agentId ?? "").trim();
    if (chatAgentId && chatAgentId !== selectedAgentId) {
      return createEmptyChat();
    }
    return await loadChatById(chatId);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Missing chat session file: ")) {
      return createEmptyChat();
    }
    throw error;
  }
}
async function persistCompletedChat({ chat, messages, setCurrent = true }) {
  const world = await ensureWorldBootstrap();
  const persistedChat = await persistWorldChat({
    id: chat.id,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messages
  }, String(world.defaultAgentId));
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
async function persistStreamTraceEvents({ chat, streamTraceEvents }) {
  if (!Array.isArray(streamTraceEvents) || streamTraceEvents.length === 0) {
    return null;
  }
  const world = await ensureWorldBootstrap();
  const eventsPath = buildAgentEventsPath(String(world.defaultAgentId));
  await appendJsonl(eventsPath, streamTraceEvents.map((event) => ({
    kind: "stream_trace",
    chatId: chat.id,
    type: String(event.type ?? ""),
    text: String(event.text ?? ""),
    createdAt: normalizeTimestamp(event.createdAt, (/* @__PURE__ */ new Date()).toISOString())
  })));
  return eventsPath;
}
async function persistRemoteSessionState({ chatId, remoteSession }) {
  const world = await ensureWorldBootstrap();
  const statePath = buildAgentStatePath(String(world.defaultAgentId));
  const existingState = await readJsonIfPresent(statePath);
  const currentChatId = String(chatId ?? world.currentChatId ?? "").trim();
  await writeJsonAtomic(statePath, {
    ...existingState && typeof existingState === "object" ? existingState : {},
    id: String(world.defaultAgentId),
    currentChatId,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    remoteSession
  });
  return statePath;
}

// core/relay-client.js
var relay_client_exports = {};
__export(relay_client_exports, {
  RelayClientError: () => RelayClientError,
  createRelayIdempotencyKey: () => createRelayIdempotencyKey,
  createRelayPairingInvite: () => createRelayPairingInvite,
  createRelaySession: () => createRelaySession,
  normalizeRelayServerUrl: () => normalizeRelayServerUrl,
  pairRelaySession: () => pairRelaySession,
  pollRelayCommands: () => pollRelayCommands,
  postRelayEvent: () => postRelayEvent,
  readRelayEvents: () => readRelayEvents,
  readRelayNotifications: () => readRelayNotifications,
  revokeRelaySession: () => revokeRelaySession,
  sendRelayCommand: () => sendRelayCommand
});
import { randomUUID as randomUUID2 } from "node:crypto";
function normalizeRelayServerUrl(rawUrl) {
  const normalized = String(rawUrl ?? "").trim();
  if (!normalized) {
    throw new Error("Missing relay server URL.");
  }
  const url = new URL(normalized);
  if (!/^https?:$/.test(url.protocol)) {
    throw new Error(`Unsupported relay server protocol: ${url.protocol}`);
  }
  return url.toString().replace(/\/$/, "");
}
var RelayClientError = class extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message
   */
  constructor(statusCode, message) {
    super(message);
    this.name = "RelayClientError";
    this.statusCode = statusCode;
  }
};
function createRelayIdempotencyKey(prefix) {
  return `${prefix}-${randomUUID2()}`;
}
function buildUrl(relayServer, pathname, query = {}) {
  const url = new URL(pathname, `${normalizeRelayServerUrl(relayServer)}/`);
  for (const [key, value] of Object.entries(query)) {
    if (value === void 0 || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}
async function readJsonResponse(response) {
  const rawText = await response.text();
  const trimmedText = rawText.trim();
  const parsed = trimmedText ? JSON.parse(trimmedText) : {};
  if (!response.ok) {
    throw new RelayClientError(response.status, String(parsed.error ?? response.statusText));
  }
  return parsed;
}
async function postJson(relayServer, pathname, body) {
  const response = await fetch(buildUrl(relayServer, pathname), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  return await readJsonResponse(response);
}
async function getJson(relayServer, pathname, query) {
  const response = await fetch(buildUrl(relayServer, pathname, query));
  return await readJsonResponse(response);
}
async function createRelaySession(input) {
  return await postJson(input.relayServer, "/v1/sessions", {
    localSessionId: input.localSessionId,
    chatId: input.chatId,
    ttlMs: input.ttlMs,
    pairingTtlMs: input.pairingTtlMs,
    metadata: input.metadata ?? {}
  });
}
async function pairRelaySession(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/pair`, {
    pairingToken: input.pairingToken,
    idempotencyKey: input.idempotencyKey,
    mobileName: input.mobileName
  });
}
async function createRelayPairingInvite(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/pairing-invites`, {
    token: input.token,
    idempotencyKey: input.idempotencyKey
  });
}
async function postRelayEvent(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/events`, {
    desktopToken: input.desktopToken,
    type: input.type,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey,
    targetClientId: input.targetClientId
  });
}
async function pollRelayCommands(input) {
  return await getJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/commands/poll`, {
    desktopToken: input.desktopToken,
    after: input.after,
    timeoutMs: input.timeoutMs
  });
}
async function readRelayEvents(input) {
  return await getJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/events`, {
    mobileToken: input.mobileToken,
    after: input.after
  });
}
async function sendRelayCommand(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/commands`, {
    mobileToken: input.mobileToken,
    type: input.type,
    payload: input.payload ?? {},
    idempotencyKey: input.idempotencyKey
  });
}
async function revokeRelaySession(input) {
  return await postJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/revoke`, {
    token: input.token,
    reason: input.reason
  });
}
async function readRelayNotifications(input) {
  return await getJson(input.relayServer, `/v1/sessions/${encodeURIComponent(input.sessionId)}/notifications`, {
    mobileToken: input.mobileToken,
    after: input.after
  });
}

// core/remote-control.js
import QRCode from "qrcode";
var SENSITIVE_KEY_PATTERN = /(path|file|content|token|secret|key|env|authorization|password|prompt|workspace|memory)/i;
function isInteractiveTerminal(stdout) {
  return Boolean(stdout && stdout.isTTY);
}
async function renderConnectionQrCode(connectionUrl) {
  return await QRCode.toString(connectionUrl, {
    type: "terminal",
    small: true,
    margin: 1,
    errorCorrectionLevel: "M"
  });
}
async function buildRemoteSessionReadyText(relaySession, stdout, stderr) {
  const clientConnectionUrl = String(relaySession.clientConnectionUrl ?? "");
  const expiresAt = typeof relaySession.expiresAt === "string" && relaySession.expiresAt.trim() ? relaySession.expiresAt : "No timeout";
  const lines = [
    "Remote relay session ready.",
    `Session ID: ${String(relaySession.sessionId ?? "")}`,
    `Client connection URL: ${clientConnectionUrl}`,
    `Pairing token: ${String(relaySession.pairingToken ?? "")}`,
    `Expires at: ${expiresAt}`
  ];
  if (clientConnectionUrl && isInteractiveTerminal(stdout)) {
    try {
      lines.push("Scan this QR code from the client to connect:");
      lines.push((await renderConnectionQrCode(clientConnectionUrl)).trimEnd());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      stderr?.write(`Warning: failed to render remote connection QR code: ${message}
`);
    }
  }
  lines.push("Remote host is running and will keep responding until the client disconnects or you press Ctrl+C.");
  lines.push("");
  return lines.join("\n");
}
function isPlainObject2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function summarizeArgumentEntry(key, value) {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return {
      key,
      type: Array.isArray(value) ? "array" : typeof value,
      summary: "[redacted]"
    };
  }
  if (typeof value === "string") {
    return {
      key,
      type: "string",
      summary: value.length > 80 ? `${value.slice(0, 77)}...` : value
    };
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return {
      key,
      type: value === null ? "null" : typeof value,
      summary: value
    };
  }
  if (Array.isArray(value)) {
    return {
      key,
      type: "array",
      summary: `[array:${value.length}]`
    };
  }
  if (isPlainObject2(value)) {
    return {
      key,
      type: "object",
      summary: `[object:${Object.keys(value).length}]`
    };
  }
  return {
    key,
    type: typeof value,
    summary: `[${typeof value}]`
  };
}
function buildRemoteArgumentSummary(rawArguments) {
  const argumentEntries = Object.entries(isPlainObject2(rawArguments) ? rawArguments : {});
  return {
    argumentCount: argumentEntries.length,
    entries: argumentEntries.map(([key, value]) => summarizeArgumentEntry(key, value))
  };
}
function buildRemoteFailureSummary(error) {
  const message = error instanceof Error ? error.message : String(error);
  const loweredMessage = message.toLowerCase();
  if (loweredMessage.includes("cancel")) {
    return {
      category: "cancelled",
      message: "Run cancelled on the local host."
    };
  }
  if (loweredMessage.includes("reject")) {
    return {
      category: "rejected",
      message: "A local action was rejected."
    };
  }
  return {
    category: "failed",
    message: "Run failed on the local host."
  };
}
function buildRemoteChatSummary(chat) {
  return {
    id: String(chat.id ?? ""),
    createdAt: String(chat.createdAt ?? ""),
    updatedAt: String(chat.updatedAt ?? ""),
    messageCount: Array.isArray(chat.messages) ? chat.messages.length : 0
  };
}
function buildRemoteChatMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    role: String(message?.role ?? ""),
    content: String(message?.content ?? ""),
    createdAt: typeof message?.createdAt === "string" ? message.createdAt : void 0,
    ...typeof message?.tool_call_id === "string" ? { toolCallId: message.tool_call_id } : {}
  }));
}
function buildRemoteSlashHelpText() {
  return [
    "Available remote slash commands:",
    "/help - show this help",
    "/chats - list persisted chats",
    "/messages <chatId> - load persisted messages for a chat",
    "/new - create and select a new chat",
    "/use <chatId> - switch the active chat"
  ].join("\n");
}
function parseRemoteSlashCommand(text) {
  const normalizedText = String(text ?? "").trim();
  if (!normalizedText.startsWith("/")) {
    return null;
  }
  const [rawName = "", ...rawArguments] = normalizedText.slice(1).trim().split(/\s+/u);
  return {
    commandName: rawName.toLowerCase(),
    argumentText: rawArguments.join(" ").trim(),
    rawText: normalizedText
  };
}
function createRemoteApprovalGate({ postEvent, signal }) {
  const pendingApprovals = /* @__PURE__ */ new Map();
  signal.addEventListener("abort", () => {
    for (const pending of pendingApprovals.values()) {
      pending.reject(new Error("Approval wait cancelled."));
    }
    pendingApprovals.clear();
  }, { once: true });
  return {
    async requestApproval(request) {
      if (signal.aborted) {
        throw new Error("Approval wait cancelled.");
      }
      const approvalId = String(request.toolCallId ?? createRelayIdempotencyKey("approval"));
      await postEvent("tool_approval_request", {
        approvalId,
        toolCallId: request.toolCallId,
        toolName: request.toolName,
        argumentSummary: buildRemoteArgumentSummary(isPlainObject2(request.arguments) ? request.arguments : {})
      });
      return await new Promise((resolve, reject) => {
        pendingApprovals.set(approvalId, { resolve, reject });
      });
    },
    resolveDecision(approvalId, decision) {
      const pending = pendingApprovals.get(approvalId);
      if (!pending) {
        return false;
      }
      pendingApprovals.delete(approvalId);
      pending.resolve(decision);
      return true;
    }
  };
}
async function runRemoteControlSession(params) {
  let activeChat = params.chat;
  const relaySession = await params.relayClient.createRelaySession({
    relayServer: params.relayServer,
    localSessionId: activeChat.id,
    chatId: activeChat.id,
    ttlMs: params.ttlMs ?? 0,
    pairingTtlMs: params.pairingTtlMs ?? 0,
    metadata: {
      mode: "remote-control"
    }
  });
  await params.onSessionReady?.(relaySession);
  params.io.stdout.write(await buildRemoteSessionReadyText(relaySession, params.io.stdout, params.io.stderr));
  let active = true;
  let waitingForInput = false;
  let commandCursor = 0;
  let relaySessionClosed = false;
  let finalRevokeReason = "session_closed";
  const queuedMessages = [];
  let nextMessageResolver = null;
  let activeRunController = null;
  const remoteControlAbort = new AbortController();
  const approvalGate = createRemoteApprovalGate({
    postEvent: async (type, payload = {}) => {
      await params.relayClient.postRelayEvent({
        relayServer: params.relayServer,
        sessionId: relaySession.sessionId,
        desktopToken: relaySession.desktopToken,
        type,
        payload,
        idempotencyKey: createRelayIdempotencyKey(`event-${type}`)
      });
    },
    signal: remoteControlAbort.signal
  });
  const postEvent = async (type, payload = {}, options = {}) => {
    await params.relayClient.postRelayEvent({
      relayServer: params.relayServer,
      sessionId: relaySession.sessionId,
      desktopToken: relaySession.desktopToken,
      type,
      payload,
      idempotencyKey: createRelayIdempotencyKey(`event-${type}`),
      targetClientId: options.targetClientId
    });
  };
  const publishSessionSnapshot = async () => {
    await postEvent("session_snapshot", {
      activeChatId: activeChat.id,
      chat: buildRemoteChatSummary(activeChat),
      waitingForInput
    });
  };
  const syncActiveChatState = async () => {
    await params.chatStore?.updateRemoteHostLock?.({ chatId: activeChat.id });
    await params.chatStore?.persistRemoteSessionState?.({ remoteSession: relaySession });
  };
  const postCommandError = async (clientId, requestId, code, message) => {
    await postEvent("command_error", {
      requestId,
      code,
      message,
      activeChatId: activeChat.id
    }, {
      targetClientId: clientId
    });
  };
  const postCommandResult = async (clientId, payload) => {
    await postEvent("command_result", {
      activeChatId: activeChat.id,
      ...payload
    }, {
      targetClientId: clientId
    });
  };
  const executeSlashCommand = async ({ clientId, requestId, text }) => {
    const parsedCommand = parseRemoteSlashCommand(text);
    if (!parsedCommand || !parsedCommand.commandName) {
      throw new Error("Missing slash command. Try /help.");
    }
    if (parsedCommand.commandName === "help") {
      await postCommandResult(clientId, {
        requestId,
        kind: "text",
        commandText: parsedCommand.rawText,
        title: "Remote commands",
        text: buildRemoteSlashHelpText()
      });
      return;
    }
    if (parsedCommand.commandName === "chats") {
      if (!params.chatStore?.listChats) {
        throw new Error("Remote chat listing is unavailable.");
      }
      const chats = await params.chatStore.listChats();
      await postCommandResult(clientId, {
        requestId,
        kind: "chat_list",
        commandText: parsedCommand.rawText,
        text: `Loaded ${chats.length} chats.`,
        chats
      });
      return;
    }
    if (parsedCommand.commandName === "messages") {
      if (!params.chatStore?.loadChatById) {
        throw new Error("Remote chat history is unavailable.");
      }
      const chatId = parsedCommand.argumentText || activeChat.id;
      const chat = await params.chatStore.loadChatById(chatId);
      await postCommandResult(clientId, {
        requestId,
        kind: "chat_messages",
        commandText: parsedCommand.rawText,
        text: `Loaded ${Array.isArray(chat.messages) ? chat.messages.length : 0} messages from ${chat.id}.`,
        chatId: chat.id,
        chat: buildRemoteChatSummary(chat),
        messages: buildRemoteChatMessages(chat.messages)
      });
      return;
    }
    if (parsedCommand.commandName === "new") {
      if (!params.chatStore?.createChat) {
        throw new Error("Remote chat creation is unavailable.");
      }
      if (activeRunController) {
        throw new Error("Cannot switch chats while a run is still active.");
      }
      activeChat = await params.chatStore.createChat({ setCurrent: true });
      await syncActiveChatState();
      await postCommandResult(clientId, {
        requestId,
        kind: "chat_selected",
        commandText: parsedCommand.rawText,
        text: `Created and selected ${activeChat.id}.`,
        chatId: activeChat.id,
        chat: buildRemoteChatSummary(activeChat)
      });
      await publishSessionSnapshot();
      return;
    }
    if (parsedCommand.commandName === "use" || parsedCommand.commandName === "select") {
      if (!params.chatStore?.setCurrentChat) {
        throw new Error("Remote chat selection is unavailable.");
      }
      if (activeRunController) {
        throw new Error("Cannot switch chats while a run is still active.");
      }
      const chatId = parsedCommand.argumentText;
      if (!chatId) {
        throw new Error("Usage: /use <chatId>");
      }
      activeChat = await params.chatStore.setCurrentChat(chatId);
      await syncActiveChatState();
      await postCommandResult(clientId, {
        requestId,
        kind: "chat_selected",
        commandText: parsedCommand.rawText,
        text: `Selected ${activeChat.id}.`,
        chatId: activeChat.id,
        chat: buildRemoteChatSummary(activeChat)
      });
      await publishSessionSnapshot();
      return;
    }
    throw new Error(`Unknown slash command: /${parsedCommand.commandName}. Try /help.`);
  };
  const enqueueMessage = (entry) => {
    queuedMessages.push(entry);
    if (nextMessageResolver) {
      const resolve = nextMessageResolver;
      nextMessageResolver = null;
      resolve(queuedMessages.shift() ?? null);
    }
  };
  const commandPump = (async () => {
    while (active) {
      const commandResponse = await params.relayClient.pollRelayCommands({
        relayServer: params.relayServer,
        sessionId: relaySession.sessionId,
        desktopToken: relaySession.desktopToken,
        after: commandCursor,
        timeoutMs: 25e3
      });
      if (commandResponse.revoked) {
        active = false;
        relaySessionClosed = true;
        remoteControlAbort.abort();
        if (nextMessageResolver) {
          const resolve = nextMessageResolver;
          nextMessageResolver = null;
          resolve(null);
        }
        break;
      }
      for (const command of commandResponse.commands ?? []) {
        commandCursor = Math.max(commandCursor, Number(command.sequence) || commandCursor);
        const clientId = typeof command.clientId === "string" ? command.clientId : "";
        const requestId = String(command.payload?.requestId ?? "");
        if (command.type === "input") {
          const text = String(command.payload?.text ?? "").trim();
          if (!text) {
            await postCommandError(clientId, requestId, "invalid_input", "Remote input text is required.");
            continue;
          }
          if (text.startsWith("/")) {
            try {
              await executeSlashCommand({ clientId, requestId, text });
            } catch (error) {
              await postCommandError(clientId, requestId, "command_failed", error instanceof Error ? error.message : String(error));
            }
            continue;
          }
          enqueueMessage({
            kind: "message",
            text,
            source: "remote",
            commandId: String(command.sequence)
          });
          continue;
        }
        if (command.type === "approval_decision") {
          approvalGate.resolveDecision(String(command.payload?.approvalId ?? ""), {
            approved: Boolean(command.payload?.approved),
            reason: String(command.payload?.reason ?? ""),
            source: "remote",
            decidedAt: command.createdAt
          });
          continue;
        }
        if (command.type === "cancel") {
          activeRunController?.abort();
          await postEvent("run_status", {
            status: "cancel_requested",
            source: "remote"
          });
          continue;
        }
        if (command.type === "resume") {
          if (waitingForInput) {
            waitingForInput = false;
            enqueueMessage({ kind: "resume" });
          }
          continue;
        }
        if (command.type === "disconnect") {
          active = false;
          finalRevokeReason = "remote_disconnect";
          activeRunController?.abort();
          remoteControlAbort.abort();
          if (nextMessageResolver) {
            const resolve = nextMessageResolver;
            nextMessageResolver = null;
            resolve(null);
          }
          break;
        }
        if (clientId) {
          await postCommandError(clientId, requestId, "unsupported_command", `Unsupported remote command type: ${command.type}`);
        }
      }
    }
  })();
  await postEvent("run_status", {
    status: "remote_session_started",
    sessionId: relaySession.sessionId,
    activeChatId: activeChat.id
  });
  await publishSessionSnapshot();
  if (params.initialMessage) {
    enqueueMessage({
      kind: "message",
      text: params.initialMessage,
      source: "local"
    });
  }
  while (active) {
    if (queuedMessages.length === 0) {
      waitingForInput = true;
      await postEvent("run_status", {
        status: "waiting_for_input"
      });
    }
    const nextMessage = queuedMessages.length > 0 ? queuedMessages.shift() ?? null : await new Promise((resolve) => {
      nextMessageResolver = resolve;
    });
    waitingForInput = false;
    if (!nextMessage || !active) {
      break;
    }
    if (nextMessage.kind === "resume") {
      continue;
    }
    activeRunController = new AbortController();
    try {
      await postEvent("run_status", {
        status: "started",
        source: nextMessage.source,
        commandId: nextMessage.commandId
      });
      const result = await params.executeTurn({
        chat: activeChat,
        message: nextMessage.text,
        approvalGate,
        abortSignal: activeRunController.signal,
        commandSource: nextMessage.source,
        onAssistantChunk: async (chunkText) => {
          await postEvent("assistant_output", {
            text: chunkText,
            source: nextMessage.source
          });
        }
      });
      activeChat.messages = result.messages;
      await postEvent("completion", {
        text: result.assistantText,
        source: nextMessage.source
      });
      await postEvent("run_status", {
        status: "completed",
        source: nextMessage.source
      });
    } catch (error) {
      const wasCancelled = activeRunController.signal.aborted;
      if (!wasCancelled) {
        await postEvent("failure", {
          ...buildRemoteFailureSummary(error),
          source: nextMessage.source
        });
      }
      await postEvent("run_status", {
        status: wasCancelled ? "cancelled" : "failed",
        source: nextMessage.source
      });
      if (wasCancelled) {
        continue;
      }
    } finally {
      activeRunController = null;
    }
  }
  active = false;
  remoteControlAbort.abort();
  await commandPump;
  if (!relaySessionClosed) {
    try {
      await params.relayClient.revokeRelaySession({
        relayServer: params.relayServer,
        sessionId: relaySession.sessionId,
        token: relaySession.desktopToken,
        reason: finalRevokeReason
      });
    } catch (error) {
      const statusCode = Number(error && typeof error === "object" && "statusCode" in error ? error.statusCode : 0);
      if (statusCode !== 404 && statusCode !== 410) {
        throw error;
      }
    }
  }
  return relaySession;
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
    workingDirectory: REPO_ROOT
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
function buildBaseSystemMessages(builtInSystemPrompt, projectSystemPrompt, skillInventory) {
  const layers = [builtInSystemPrompt.trim()];
  if (String(projectSystemPrompt ?? "").trim()) {
    layers.push(String(projectSystemPrompt).trim());
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
async function runChatTurn({ chat, userMessage, stream = true, onStreamChunk, onToolCall, onToolResult, handleToolCall, historyMessageLimit, builtInSystemPrompt, projectSystemPrompt, skillInventory, approvalGate, agentConfig = {}, abortSignal }) {
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
          ...buildBaseSystemMessages(builtInSystemPrompt, projectSystemPrompt, skillInventory),
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

// cli/src/human-input-ui.ts
var EXIT_HUMAN_INPUT_TOKEN = "0";
var HUMAN_INPUT_TOOL_NAMES = /* @__PURE__ */ new Set([
  "ask_user_input",
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
  const path5 = readFirstString(record, "path", "filePath");
  const type = readFirstString(record, "type", "kind");
  const preview = [
    path5 ? truncateOneLine(`path: ${path5}`, MAX_PREVIEW_LINE_WIDTH) : null,
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
  const path5 = readFirstString(data, "path");
  const content = readFirstString(data, "content");
  const sizeSummary = contentEncoding === "base64" ? "base64" : content === null ? null : formatLineCount(countLines(content));
  const summary = sizeSummary ? `${contentType} \xB7 ${sizeSummary}` : contentType;
  return {
    name: "read_content",
    ok: true,
    durationMs,
    summary,
    preview: path5 ? [`path: ${truncateOneLine(path5, MAX_PREVIEW_LINE_WIDTH - 6)}`] : void 0,
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
  const path5 = readFirstString(data, "path") ?? readFirstString(record, "path");
  const summary = toolName === "delete_content" ? "deleted" : toolName === "create_content" || readFirstBoolean(data, "created") === true ? "created" : "updated";
  return {
    name: toolName,
    ok: true,
    durationMs,
    summary: path5 ? `${summary} \xB7 ${truncateOneLine(path5, MAX_PREVIEW_LINE_WIDTH)}` : summary,
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

// cli/src/agent-runtime.ts
function writeTypeTransitionSeparator(stdout, previousType, nextType) {
  if (previousType && previousType !== nextType) {
    stdout.write("\n");
  }
}
function writeDiagnostic(stderr, kind, text) {
  stderr.write(`${kind}: ${text}
`);
}
async function resolveEffectiveAgentConfig(options = {}) {
  const persistedAgentConfig = await loadPersistedRuntimeConfig({
    agentId: options.agentId
  });
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
    let lastStreamType = null;
    const pendingDisplay = createPendingDisplay(options.io.stdout);
    const pastMessages = Number(options.agentConfig.pastMessages);
    const historyMessageLimit = Number.isInteger(pastMessages) && pastMessages >= 0 ? pastMessages : 0;
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
              writeTypeTransitionSeparator(stderr, lastStreamType, "warning");
              writeDiagnostic(stderr, "warning", warningText);
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
              writeTypeTransitionSeparator(stderr, lastStreamType, "error");
              writeDiagnostic(stderr, "error", errorText);
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
              pendingDisplay.clear();
              writeTypeTransitionSeparator(stderr, lastStreamType, "reasoning");
              writeDiagnostic(stderr, "reasoning", JSON.stringify(reasoningText));
            }
            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: "reasoning",
                text: reasoningText,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
            lastStreamType = "reasoning";
          }
          if (chunk.content) {
            pendingDisplay.writeText(chunk.content);
            await onAssistantChunk?.(chunk.content);
            if (streamTraceEnabled) {
              streamTraceEvents.push({
                type: "text",
                text: chunk.content,
                createdAt: (/* @__PURE__ */ new Date()).toISOString()
              });
            }
            lastStreamType = "text";
          }
        },
        onToolCall: options.streamOff ? void 0 : (toolCall) => {
          if (options.verbose) {
            pendingDisplay.clear();
            stderr.write(formatToolCallDiagnostic(toolCall));
          }
          if (streamTraceEnabled) {
            streamTraceEvents.push({
              type: "tool",
              text: toolCall.arguments ? `${toolCall.name} ${toolCall.arguments}` : toolCall.name,
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
          lastStreamType = "tool";
        },
        onToolResult: options.streamOff ? void 0 : (toolResult) => {
          if (options.verbose) {
            pendingDisplay.clear();
            stderr.write(formatToolResultDiagnostic(toolResult));
          }
          lastStreamType = "tool";
        },
        historyMessageLimit,
        handleToolCall: async ({ toolCall, toolName, arguments: toolArguments }) => {
          const request = parseHumanInputRequest(toolName, toolArguments, toolCall.id);
          if (!request) {
            return { handled: false };
          }
          pendingDisplay.clear();
          const result = await collectHumanInputAnswer(request, inputPrompt, options.io.stdout);
          if (!options.streamOff) {
            pendingDisplay.start();
          }
          return {
            handled: true,
            result
          };
        },
        builtInSystemPrompt,
        projectSystemPrompt: options.projectSystemPrompt,
        skillInventory: options.skillInventory,
        agentConfig: options.agentConfig
      });
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
        options.io.stdout.write(`${turnResult.assistantText}
`);
      } else if (pendingDisplay.hasWrittenText()) {
        options.io.stdout.write("\n");
      } else {
        pendingDisplay.clear();
      }
      return turnResult;
    } catch (error) {
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

// cli/src/cli-shell.ts
var REMOTE_RELAY_SERVER_ENV_KEY = "AGENT_CLI_RELAY_SERVER_URL";
var PROJECT_ROOT_ENV_KEY = "AGENT_CLI_ROOT";
var DEFAULT_AGENT_ID2 = "default";
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
  "AZURE_OPENAI_API_VERSION"
]);
var loadedDotEnvRoots = /* @__PURE__ */ new Set();
function loadAllowedDotEnvEnvironment() {
  if (loadedDotEnvRoots.has(REPO_ROOT)) {
    return;
  }
  loadedDotEnvRoots.add(REPO_ROOT);
  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: path4.join(REPO_ROOT, ".env"),
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
function readProjectRootDotEnvFallback() {
  if (String(process.env[PROJECT_ROOT_ENV_KEY] ?? "").trim()) {
    return void 0;
  }
  const parsed = loadDotEnvConfig({
    processEnv: {},
    path: path4.join(process.cwd(), ".env"),
    quiet: true
  }).parsed ?? {};
  const projectRoot = String(parsed[PROJECT_ROOT_ENV_KEY] ?? "").trim();
  return projectRoot || void 0;
}
function prepareProjectEnvironment(projectRoot) {
  configureProjectRoot(projectRoot ?? readProjectRootDotEnvFallback());
  loadAllowedDotEnvEnvironment();
}
function usageText() {
  return [
    "Usage: agent-cli [--project <path>] [--new-chat] [--verbose] [--stream-off] [runtime options] <message>",
    "       agent-cli [--project <path>] --remote [--new-chat] [initial message]",
    "",
    "Runtime options override runtime.json defaults when provided:",
    "  --provider <name>                 --model <name>",
    "  --temperature <number>            --max-tokens <number>",
    "  --tool-permission <auto|ask|read> --reasoning-effort <level>",
    "  --past-messages <count>           --stream-trace <true|false>",
    "  --web-search <true|false|low|medium|high>",
    "  --agent-id <id>                  --new-agent <id>",
    "  --project <path>",
    "  --remote",
    "",
    `Remote mode requires ${REMOTE_RELAY_SERVER_ENV_KEY} in the environment.`,
    "",
    "Examples:",
    '  agent-cli --new-chat "Map my next financial move"',
    '  agent-cli "What should I do first?"',
    '  agent-cli --verbose "What should I do first?"',
    '  agent-cli --stream-off "What should I do first?"',
    '  agent-cli --project /path/to/project "Summarize this repo"',
    "  agent-cli --new-agent research --provider ollama --model gemma4:e4b",
    '  agent-cli --provider google --model gemini-2.5-pro "Summarize this repo"',
    "  AGENT_CLI_RELAY_SERVER_URL=http://127.0.0.1:8787 agent-cli --remote"
  ].join("\n");
}
function startupText(cwd = REPO_ROOT, agentId = DEFAULT_AGENT_ID2, runtimeSettings) {
  const lines = [
    `Agent CLI starting in ${cwd}`,
    `Agent CLI agent id: ${agentId}`
  ];
  if (runtimeSettings) {
    lines.push(runtimeSelectionText(runtimeSettings));
  }
  return lines.join("\n");
}
function runtimeSelectionText(runtimeSettings) {
  return `provider=${runtimeSettings.provider} model=${runtimeSettings.model}`;
}
function createDefaultInteractivePrompt() {
  return createInterface({
    input: process.stdin,
    output: process.stdout
  });
}
function readRemoteRelayServerUrl(environment = process.env) {
  const relayServer = String(environment[REMOTE_RELAY_SERVER_ENV_KEY] ?? "").trim();
  if (!relayServer) {
    throw new Error(`Missing environment variable: ${REMOTE_RELAY_SERVER_ENV_KEY}`);
  }
  return normalizeRelayServerUrl(relayServer);
}
function isCliEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!argvPath) {
    return false;
  }
  try {
    return realpathSync(argvPath) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return pathToFileURL(path4.resolve(argvPath)).href === moduleUrl;
  }
}
function parseArguments(argv) {
  let newChat = false;
  let streamOff = false;
  let help = false;
  let remoteControl = false;
  let verbose = false;
  let agentId;
  let newAgentId;
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
    if (arg === "--remote") {
      remoteControl = true;
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
      if (flagName === "agent-id") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        agentId = String(result.value);
        index = result.nextIndex;
        continue;
      }
      if (flagName === "new-agent") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        newAgentId = String(result.value);
        index = result.nextIndex;
        continue;
      }
      if (flagName === "project") {
        const result = readFlagValue(argv, index, inlineValue, flagName);
        projectRoot = String(result.value);
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
    ...agentId !== void 0 ? { agentId } : {},
    newChat,
    ...newAgentId !== void 0 ? { newAgentId } : {},
    ...projectRoot !== void 0 ? { projectRoot } : {},
    remoteControl,
    runtimeOverrides: normalizeAgentConfig(runtimeOverrides),
    streamOff,
    verbose,
    message: messageParts.join(" ").trim()
  };
}
function normalizeOptionalText(value) {
  return String(value ?? "").trim();
}
function defaultModelForProvider(provider) {
  return provider.trim().toLowerCase() === "openai" ? "gpt-5" : "";
}
function runtimeSettingsForStartup(agentConfig) {
  const provider = (normalizeOptionalText(agentConfig.provider) || "openai").toLowerCase();
  const model = normalizeOptionalText(agentConfig.model) || defaultModelForProvider(provider);
  return { provider, model };
}
async function askAgentField({
  prompt,
  label,
  fallback
}) {
  if (!prompt) {
    return fallback;
  }
  const suffix = fallback ? ` (${fallback})` : "";
  const answer = (await prompt.question(`${label}${suffix}: `)).trim();
  return answer || fallback;
}
async function prepareSelectedAgent({
  parsed,
  prompt
}) {
  const selectedAgentId = normalizeOptionalText(parsed.newAgentId ?? parsed.agentId) || DEFAULT_AGENT_ID2;
  const explicitAgentSelection = Boolean(parsed.newAgentId || parsed.agentId);
  if (!explicitAgentSelection) {
    return selectedAgentId;
  }
  const existingMetadata = await loadAgentMetadata(selectedAgentId);
  const creatingAgent = Boolean(parsed.newAgentId) || !existingMetadata;
  const overrideProvider = normalizeOptionalText(parsed.runtimeOverrides.provider);
  const overrideModel = normalizeOptionalText(parsed.runtimeOverrides.model);
  let name = normalizeOptionalText(existingMetadata?.name);
  let provider = normalizeOptionalText(existingMetadata?.provider);
  let model = normalizeOptionalText(existingMetadata?.model);
  if (creatingAgent || !name) {
    name = prompt ? await askAgentField({
      prompt,
      label: "Agent name",
      fallback: name || `${selectedAgentId} agent`
    }) : name || `${selectedAgentId} agent`;
  }
  if (creatingAgent || !provider) {
    provider = prompt ? await askAgentField({
      prompt,
      label: "Provider",
      fallback: provider || overrideProvider || "openai"
    }) : provider || overrideProvider;
  }
  if (creatingAgent || !model) {
    model = prompt ? await askAgentField({
      prompt,
      label: "Model",
      fallback: model || overrideModel || defaultModelForProvider(provider)
    }) : model || overrideModel;
  }
  await ensureAgentSelection({
    agentId: selectedAgentId,
    name,
    provider,
    model
  });
  return selectedAgentId;
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
      if (input === "/new" || input === "/clear") {
        chat = await createPersistedChat();
        io.stdout.write(input === "/clear" ? "history cleared\n\n" : `new chat ${chat.id}

`);
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
      try {
        await executeTurn({
          chat,
          message: input,
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
    agentId,
    newChat,
    newAgentId,
    projectRoot,
    remoteControl,
    runtimeOverrides,
    streamOff,
    verbose,
    message
  } = parseArguments(argv);
  prepareProjectEnvironment(projectRoot);
  const parsedArguments = {
    help,
    ...agentId !== void 0 ? { agentId } : {},
    newChat,
    ...newAgentId !== void 0 ? { newAgentId } : {},
    ...projectRoot !== void 0 ? { projectRoot } : {},
    remoteControl,
    runtimeOverrides,
    streamOff,
    verbose,
    message
  };
  if (help && !newAgentId && !agentId) {
    io.stdout.write(`${usageText()}
`);
    return null;
  }
  const shouldCreateAgentPrompt = Boolean((newAgentId || agentId) && process.stdin.isTTY);
  const agentSetupPrompt = options.interactivePrompt ?? (shouldCreateAgentPrompt ? createDefaultInteractivePrompt() : void 0);
  let agentSetupPromptPassedToInteractive = false;
  const selectedAgentId = await prepareSelectedAgent({
    parsed: parsedArguments,
    prompt: agentSetupPrompt
  });
  if (help) {
    if (!options.interactivePrompt) {
      agentSetupPrompt?.close?.();
    }
    io.stdout.write(`${usageText()}
`);
    return null;
  }
  const agentConfig = await resolveEffectiveAgentConfig({
    optionAgentConfig: options.agentConfig,
    runtimeOverrides,
    agentId: options.agentId ?? selectedAgentId
  });
  const effectiveStreamOff = streamOff || agentConfig.stream === false;
  if (options.startupDiagnostics) {
    (io.stderr ?? process.stderr).write(
      `${startupText(REPO_ROOT, selectedAgentId, runtimeSettingsForStartup(agentConfig))}
`
    );
  }
  if (!newAgentId && !agentId) {
    await ensureAgentSelection({
      agentId: selectedAgentId,
      provider: normalizeOptionalText(agentConfig.provider),
      model: normalizeOptionalText(agentConfig.model)
    });
  }
  if (!remoteControl) {
    await assertNoActiveRemoteHost();
  }
  const [projectSystemPrompt, skillInventory, chat] = await Promise.all([
    loadProjectSystemPrompt(),
    loadSkillInventory(),
    loadRequestedChat({ newChat, agentId: selectedAgentId })
  ]);
  const executeTurn = createTurnExecutor({
    io,
    verbose,
    streamOff: effectiveStreamOff,
    agentConfig,
    projectSystemPrompt,
    skillInventory
  });
  if (remoteControl) {
    if (!options.interactivePrompt) {
      agentSetupPrompt?.close?.();
    }
    await acquireRemoteHostLock({ chat });
    const relayServer = readRemoteRelayServerUrl(process.env);
    try {
      await persistCompletedChat({
        chat,
        messages: chat.messages
      });
      const relaySession = await runRemoteControlSession({
        relayServer,
        chat,
        chatStore: {
          listChats: listPersistedChats,
          loadChatById,
          createChat: createPersistedChat,
          setCurrentChat,
          persistRemoteSessionState,
          updateRemoteHostLock
        },
        io,
        initialMessage: message || void 0,
        onSessionReady: async (startedRelaySession) => {
          await persistRemoteSessionState({
            remoteSession: startedRelaySession
          });
        },
        executeTurn,
        relayClient: relay_client_exports
      });
      await persistRemoteSessionState({
        remoteSession: relaySession
      });
      return relaySession;
    } finally {
      await releaseRemoteHostLock();
    }
  }
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
      message,
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
    prepareProjectEnvironment(parsed.projectRoot);
    await main(argv, io, { startupDiagnostics: !parsed.help });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`${message.trim()}
`);
    process.exitCode = 1;
  }
}

// cli/src/index.ts
if (isCliEntrypoint()) {
  await runCli();
}
export {
  REMOTE_RELAY_SERVER_ENV_KEY,
  isCliEntrypoint,
  main,
  parseArguments,
  readRemoteRelayServerUrl,
  runCli,
  runtimeSelectionText,
  startupText,
  usageText
};
