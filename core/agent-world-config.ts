// @ts-check
/**
 * Agent World Config
 *
 * Purpose:
 * - Read optional workspace-local `.agent-world/world.json` metadata for startup output.
 *
 * Key features:
 * - Treats a missing file as no config.
 * - Parses `world.json` as best-effort startup metadata.
 * - Extracts a compact workflow label and ordered agent labels without reviving persisted agent state.
 *
 * Recent changes:
 * - 2026-05-30: Removed `world.json` schema validation.
 */
import { promises as fs } from 'node:fs';

import { AGENT_WORLD_CONFIG_PATH } from './paths.js';

export type AgentWorldStartupSummary = {
  filePath: string;
  workflow: string;
  agents: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeScalarText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function formatStructuredValue(value: unknown): string {
  const scalarText = normalizeScalarText(value);
  if (scalarText) {
    return scalarText;
  }

  if (Array.isArray(value)) {
    return value
      .map(formatStructuredValue)
      .filter(Boolean)
      .join(', ');
  }

  if (!isRecord(value)) {
    return '';
  }

  for (const key of ['pattern', 'type', 'entry', 'entryAgent', 'name', 'id', 'mode']) {
    const text = normalizeScalarText(value[key]);
    if (text) {
      return text;
    }
  }

  return Object.keys(value).sort((left, right) => left.localeCompare(right)).join(', ');
}

function extractWorkflowLabel(config: Record<string, unknown>): string {
  return formatStructuredValue(config.workflow ?? config.workflowPattern ?? config.pattern);
}

function extractAgentLabel(value: unknown, fallbackLabel = ''): string {
  const scalarText = normalizeScalarText(value);
  if (scalarText) {
    return scalarText;
  }

  if (!isRecord(value)) {
    return fallbackLabel;
  }

  for (const key of ['id', 'name', 'agent', 'role']) {
    const text = normalizeScalarText(value[key]);
    if (text) {
      return text;
    }
  }

  return fallbackLabel;
}

function extractAgentLabels(config: Record<string, unknown>): string[] {
  const agents = config.agents;

  if (Array.isArray(agents)) {
    return agents
      .map((agent) => extractAgentLabel(agent))
      .filter(Boolean);
  }

  if (isRecord(agents)) {
    return Object.keys(agents).filter(Boolean);
  }

  return [];
}

export async function loadAgentWorldStartupSummary(): Promise<AgentWorldStartupSummary | null> {
  let content = '';

  try {
    content = await fs.readFile(AGENT_WORLD_CONFIG_PATH, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid Agent World config: ${AGENT_WORLD_CONFIG_PATH}: ${message}`);
  }

  const config = isRecord(parsed) ? parsed : {};

  return {
    filePath: AGENT_WORLD_CONFIG_PATH,
    workflow: extractWorkflowLabel(config),
    agents: extractAgentLabels(config),
  };
}

export function agentWorldStartupText(summary: AgentWorldStartupSummary | null): string {
  if (!summary) {
    return '';
  }

  return [
    'Agent world:',
    `  workflow: ${summary.workflow || '(not set)'}`,
    `  agents: ${summary.agents.length > 0 ? summary.agents.join(', ') : '(none)'}`,
  ].join('\n');
}
