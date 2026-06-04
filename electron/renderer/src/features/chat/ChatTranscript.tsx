/**
 * Chat Transcript Feature
 *
 * Purpose:
 * - Render visible chat messages, edit actions, and current-turn runtime activity.
 *
 * Key features:
 * - Keeps persisted chat message rendering separate from renderer-only turn events.
 * - Shows reasoning/thinking, tool calls, tool results, warnings, errors, and model-response summaries.
 *
 * Recent changes:
 * - 2026-06-04: Updated hidden diagnostics empty state for Verbose mode.
 * - 2026-06-04: Added per-card collapse controls for tool-message transcript content.
 * - 2026-06-03: Reused deterministic runtime event helpers for labels, summaries, and filtering.
 * - 2026-06-03: Added Electron runtime activity cards for CLI-like reasoning and tool display.
 * - 2026-05-31: Added React transcript feature for Agent CLI messages.
 */
import { useState } from 'react';
import type { AgentCliDesktopRuntimeMessage, AgentCliDesktopTurnEvent } from '../../types/desktop-api';
import { formatTime } from '../../utils/format';
import { isToolRelatedMessage, messageRoleLabel, resolveToolStatus, resolveToolTitle } from '../../utils/message-utils';
import type { ToolCallMetadata } from '../../utils/message-utils';
import {
  isTurnEventVisible,
  summarizeModelResponse,
  summarizeToolCall,
  summarizeToolResult,
  toolCallTitleFromRecord,
  toolResultTitleFromRecord,
} from './transcript-events';

export interface ChatTranscriptProps {
  messages: AgentCliDesktopRuntimeMessage[];
  turnEvents: AgentCliDesktopTurnEvent[];
  showToolMessages: boolean;
  onStartEdit: (index: number) => void;
}

type ToolCardStatus = 'completed' | 'error' | 'reasoning' | 'requested' | 'runtime';

interface ToolCardProps {
  body: string;
  className?: string;
  collapsed?: boolean;
  collapsible?: boolean;
  onToggle?: () => void;
  status: ToolCardStatus;
  title: string;
}

function ToolCard({ body, className = '', collapsed = false, collapsible = false, onToggle, status, title }: ToolCardProps) {
  const collapseLabel = collapsed ? 'Expand tool message content' : 'Collapse tool message content';
  const collapsedClassName = collapsed ? 'aw-tool-card-collapsed' : '';

  return (
    <article className={`aw-message aw-tool-card aw-tool-card-${status} ${collapsedClassName} ${className}`.trim()}>
      <div className="aw-tool-dot" />
      <div className="aw-tool-body">
        <div className="aw-tool-heading">
          <span className="aw-tool-title">{title}</span>
          <span className="aw-tool-heading-actions">
            <span className="aw-tool-status">{status}</span>
            {collapsible ? (
              <button
                type="button"
                className="aw-tool-collapse-button"
                aria-label={collapseLabel}
                aria-expanded={!collapsed}
                onClick={onToggle}
              >
                <span aria-hidden="true">{collapsed ? '▼' : '▲'}</span>
              </button>
            ) : null}
          </span>
        </div>
        {collapsed ? null : <p>{body}</p>}
      </div>
    </article>
  );
}

function toggleCollapsedCards(cards: Record<string, boolean>, key: string): Record<string, boolean> {
  return { ...cards, [key]: !(cards[key] ?? true) };
}

function collectToolCallsById(messages: AgentCliDesktopRuntimeMessage[]): Map<string, ToolCallMetadata> {
  const toolCallsById = new Map<string, ToolCallMetadata>();

  for (const message of messages) {
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    for (const toolCall of toolCalls) {
      if (!toolCall || typeof toolCall !== 'object') {
        continue;
      }

      const record = toolCall as Record<string, any>;
      const id = typeof record.id === 'string' ? record.id : '';
      const name = record.function?.name || record.name || record.toolName;
      if (id && typeof name === 'string' && name.trim()) {
        toolCallsById.set(id, {
          name,
          ...(typeof record.function?.arguments === 'string' ? { arguments: record.function.arguments } : {}),
        });
      }
    }
  }

  return toolCallsById;
}

function renderTurnEvent(
  event: AgentCliDesktopTurnEvent,
  index: number,
  collapsedCards: Record<string, boolean>,
  onToggleCard: (key: string) => void,
) {
  const cardKey = `event:${event.createdAt}:${index}:${event.type}`;

  if (event.type === 'reasoning') {
    return (
      <ToolCard
        body={String(event.text || '').trim()}
        className="aw-reasoning-card"
        key={cardKey}
        status="reasoning"
        title="thinking"
      />
    );
  }

  if (event.type === 'tool_call') {
    return (
      <ToolCard
        body={summarizeToolCall(event.toolCall)}
        collapsed={collapsedCards[cardKey] ?? true}
        collapsible
        key={cardKey}
        onToggle={() => onToggleCard(cardKey)}
        status="requested"
        title={toolCallTitleFromRecord(event.toolCall)}
      />
    );
  }

  if (event.type === 'tool_result') {
    return (
      <ToolCard
        body={summarizeToolResult(event.toolResult)}
        collapsed={collapsedCards[cardKey] ?? true}
        collapsible
        key={cardKey}
        onToggle={() => onToggleCard(cardKey)}
        status="completed"
        title={toolResultTitleFromRecord(event.toolResult)}
      />
    );
  }

  if (event.type === 'model_response') {
    return (
      <ToolCard
        body={summarizeModelResponse(event.modelResponse)}
        className="aw-model-card"
        key={cardKey}
        status="runtime"
        title="model response"
      />
    );
  }

  return (
    <ToolCard
      body={String(event.text || '').trim()}
      key={cardKey}
      status={event.type === 'error' ? 'error' : 'completed'}
      title={event.type}
    />
  );
}

export default function ChatTranscript({ messages, turnEvents, showToolMessages, onStartEdit }: ChatTranscriptProps) {
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const handleToggleCard = (key: string) => {
    setCollapsedCards((cards) => toggleCollapsedCards(cards, key));
  };
  const visibleMessages = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => showToolMessages || !isToolRelatedMessage(message));
  const toolCallsById = collectToolCallsById(messages);
  const visibleTurnEvents = turnEvents.filter((event) => isTurnEventVisible(event, showToolMessages));
  const empty = visibleMessages.length === 0 && visibleTurnEvents.length === 0;

  return (
    <div id="message-list" className="aw-message-list">
      {empty ? (
        <div className="aw-empty-state">{messages.length === 0 ? 'Select a chat or send a message to begin.' : 'Verbose mode disabled.'}</div>
      ) : null}
      {visibleMessages.map(({ message, index }) => {
        if (isToolRelatedMessage(message)) {
          const status = resolveToolStatus(message);
          const cardKey = `message:${index}:${message.id || message.tool_call_id || message.toolCallId || message.role || 'tool'}`;
          return (
            <ToolCard
              body={String(message.content || '').trim() || (status === 'requested' ? 'Waiting for tool result.' : 'No tool output.')}
              collapsed={collapsedCards[cardKey] ?? true}
              collapsible
              key={cardKey}
              onToggle={() => handleToggleCard(cardKey)}
              status={status}
              title={resolveToolTitle(message, toolCallsById)}
            />
          );
        }

        const isUser = message.role === 'user';
        return (
          <article className={`aw-message ${isUser ? 'aw-message-user' : 'aw-message-agent'}`} key={`${index}-${message.role || 'assistant'}`}>
            <div className="aw-message-avatar">{isUser ? 'Y' : 'AI'}</div>
            <div className="aw-message-card">
              <div className="aw-message-meta">
                <span>{messageRoleLabel(message)}</span>
                <time>{formatTime(message.createdAt)}</time>
              </div>
              <p>{String(message.content || '')}</p>
              {isUser ? (
                <div className="aw-message-actions">
                  <button type="button" onClick={() => onStartEdit(index)}>Edit and resend</button>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
      {visibleTurnEvents.map((event, index) => renderTurnEvent(event, index, collapsedCards, handleToggleCard))}
    </div>
  );
}
