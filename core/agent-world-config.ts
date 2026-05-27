// @ts-check
/**
 * Agent World Config
 *
 * Purpose:
 * - Read optional workspace-local `.agent-world/world.json` metadata for startup output.
 *
 * Key features:
 * - Treats a missing file as no config.
 * - Validates the parsed JSON against `world.schema.json` before using it.
 * - Extracts a compact workflow label and ordered agent labels without reviving persisted agent state.
 *
 * Recent changes:
 * - 2026-05-27: Validated `world.json` with `world.schema.json`.
 */
import { promises as fs } from 'node:fs';

import { AGENT_WORLD_CONFIG_PATH } from './paths.js';
import worldSchema from './world.schema.json' with { type: 'json' };

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

function readSchemaType(schema: Record<string, unknown>): string {
  return normalizeScalarText(schema.type);
}

function describeSchemaType(schema: Record<string, unknown>): string {
  const type = readSchemaType(schema);
  return type || 'valid value';
}

function getJsonType(value: unknown): string {
  if (Array.isArray(value)) {
    return 'array';
  }

  if (value === null) {
    return 'null';
  }

  if (Number.isInteger(value)) {
    return 'integer';
  }

  return typeof value;
}

function formatJsonPath(pathParts: string[]): string {
  return pathParts.length === 0 ? '$' : `$${pathParts.join('')}`;
}

function appendPathKey(pathParts: string[], key: string): string[] {
  return [...pathParts, /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`];
}

function appendPathIndex(pathParts: string[], index: number): string[] {
  return [...pathParts, `[${index}]`];
}

function resolveSchemaReference(reference: string, rootSchema: Record<string, unknown>): Record<string, unknown> | null {
  if (!reference.startsWith('#/')) {
    return null;
  }

  let current: unknown = rootSchema;
  for (const rawPart of reference.slice(2).split('/')) {
    const part = rawPart.replace(/~1/gu, '/').replace(/~0/gu, '~');

    if (!isRecord(current)) {
      return null;
    }

    current = current[part];
  }

  return isRecord(current) ? current : null;
}

function valuesAreUnique(values: unknown[]): boolean {
  const seen = new Set<string>();

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
  pathParts,
}: {
  value: unknown;
  schema: Record<string, unknown>;
  rootSchema: Record<string, unknown>;
  pathParts: string[];
}): string[] {
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
      pathParts,
    });
  }

  const anyOf = Array.isArray(schema.anyOf) ? schema.anyOf : [];
  if (anyOf.length > 0) {
    const matched = anyOf.some((candidate) => isRecord(candidate) && validateJsonSchemaValue({
      value,
      schema: candidate,
      rootSchema,
      pathParts,
    }).length === 0);

    return matched ? [] : [`${formatJsonPath(pathParts)} does not match any allowed schema`];
  }

  if ('const' in schema && value !== schema.const) {
    return [`${formatJsonPath(pathParts)} must be ${JSON.stringify(schema.const)}`];
  }

  const errors: string[] = [];
  const type = readSchemaType(schema);

  if (type) {
    const actualType = getJsonType(value);
    const validType = type === 'integer'
      ? Number.isInteger(value)
      : actualType === type;

    if (!validType) {
      return [`${formatJsonPath(pathParts)} must be ${describeSchemaType(schema)}, got ${actualType}`];
    }
  }

  if (type === 'string' && typeof value === 'string') {
    const minLength = Number(schema.minLength);
    if (Number.isFinite(minLength) && value.length < minLength) {
      errors.push(`${formatJsonPath(pathParts)} must be at least ${minLength} characters`);
    }

    const pattern = normalizeScalarText(schema.pattern);
    if (pattern && !new RegExp(pattern, 'u').test(value)) {
      errors.push(`${formatJsonPath(pathParts)} must match /${pattern}/`);
    }

    const enumValues = Array.isArray(schema.enum) ? schema.enum : [];
    if (enumValues.length > 0 && !enumValues.includes(value)) {
      errors.push(`${formatJsonPath(pathParts)} must be one of ${enumValues.map((item) => JSON.stringify(item)).join(', ')}`);
    }
  }

  if ((type === 'integer' || type === 'number') && typeof value === 'number') {
    const minimum = Number(schema.minimum);
    if (Number.isFinite(minimum) && value < minimum) {
      errors.push(`${formatJsonPath(pathParts)} must be >= ${minimum}`);
    }
  }

  if (type === 'array' && Array.isArray(value)) {
    const itemsSchema = isRecord(schema.items) ? schema.items : null;
    if (itemsSchema) {
      value.forEach((item, index) => {
        errors.push(...validateJsonSchemaValue({
          value: item,
          schema: itemsSchema,
          rootSchema,
          pathParts: appendPathIndex(pathParts, index),
        }));
      });
    }

    if (schema.uniqueItems === true && !valuesAreUnique(value)) {
      errors.push(`${formatJsonPath(pathParts)} must contain unique items`);
    }
  }

  if (type === 'object' && isRecord(value)) {
    const properties = isRecord(schema.properties) ? schema.properties : {};
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

    if (isRecord(schema.propertyNames)) {
      for (const key of Object.keys(value)) {
        errors.push(...validateJsonSchemaValue({
          value: key,
          schema: schema.propertyNames,
          rootSchema,
          pathParts: appendPathKey(pathParts, key),
        }).map((error) => `${error} as a property name`));
      }
    }

    const additionalProperties = schema.additionalProperties;
    for (const [key, propertyValue] of Object.entries(value)) {
      const propertySchema = properties[key];

      if (isRecord(propertySchema)) {
        errors.push(...validateJsonSchemaValue({
          value: propertyValue,
          schema: propertySchema,
          rootSchema,
          pathParts: appendPathKey(pathParts, key),
        }));
        continue;
      }

      if (additionalProperties === false) {
        errors.push(`${formatJsonPath(appendPathKey(pathParts, key))} is not allowed`);
        continue;
      }

      if (isRecord(additionalProperties)) {
        errors.push(...validateJsonSchemaValue({
          value: propertyValue,
          schema: additionalProperties,
          rootSchema,
          pathParts: appendPathKey(pathParts, key),
        }));
      }
    }
  }

  return errors;
}

function validateWorldConfig(config: unknown): asserts config is Record<string, unknown> {
  if (!isRecord(worldSchema)) {
    throw new Error('Invalid bundled Agent World schema: expected a JSON object');
  }

  const errors = validateJsonSchemaValue({
    value: config,
    schema: worldSchema,
    rootSchema: worldSchema,
    pathParts: [],
  });

  if (errors.length > 0) {
    throw new Error(`Invalid Agent World config: ${AGENT_WORLD_CONFIG_PATH}: ${errors.slice(0, 8).join('; ')}`);
  }
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

  validateWorldConfig(parsed);

  return {
    filePath: AGENT_WORLD_CONFIG_PATH,
    workflow: extractWorkflowLabel(parsed),
    agents: extractAgentLabels(parsed),
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
