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
 * - 2026-06-10: Consolidated tool request/result diagnostics into compact collapsed trace sections.
 * - 2026-06-04: Auto-scrolled the transcript to the end as messages and runtime events stream in.
 * - 2026-06-04: Updated hidden diagnostics empty state for Verbose mode.
 * - 2026-06-04: Added per-card collapse controls for tool-message transcript content.
 * - 2026-06-03: Reused deterministic runtime event helpers for labels, summaries, and filtering.
 * - 2026-06-03: Added Electron runtime activity cards for CLI-like reasoning and tool display.
 * - 2026-05-31: Added React transcript feature for Agent CLI messages.
 */
import { useEffect, useRef, useState } from 'react';
import type { AgentCliDesktopRuntimeMessage, AgentCliDesktopTurnEvent } from '../../types/desktop-api';
import { formatTime } from '../../utils/format';
import { groupMessagesForTranscript, messageRoleLabel } from '../../utils/message-utils';
import {
  groupTurnEventsForTranscript,
  isTurnEventVisible,
  summarizeModelResponse,
} from './transcript-events';
import type { ToolTraceSection as ToolTraceSectionData } from './transcript-events';

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

interface ToolTraceSectionProps {
  collapsed?: boolean;
  onToggle?: () => void;
  trace: ToolTraceSectionData;
}

function ToolTraceSection({ collapsed = true, onToggle, trace }: ToolTraceSectionProps) {
  const collapseLabel = collapsed ? 'Expand tool trace details' : 'Collapse tool trace details';
  const statusClassName = `aw-tool-trace aw-tool-trace-${trace.status} ${collapsed ? 'aw-tool-trace-collapsed' : ''}`.trim();
  const details = [trace.request, trace.response].filter((detail): detail is NonNullable<typeof detail> => Boolean(detail));

  return (
    <section className={`aw-message ${statusClassName}`}>
      <button
        type="button"
        className="aw-tool-trace-toggle"
        aria-label={collapseLabel}
        aria-expanded={!collapsed}
        onClick={onToggle}
      >
        <span className="aw-tool-dot" aria-hidden="true" />
        <span className="aw-tool-trace-title">{trace.title}</span>
        <span className="aw-tool-trace-status">{trace.status}</span>
        <span className="aw-tool-trace-chevron" aria-hidden="true">{collapsed ? '▼' : '▲'}</span>
      </button>
      {collapsed ? null : (
        <div className="aw-tool-trace-details">
          {details.map((detail) => (
            <div className="aw-tool-trace-detail" key={detail.label}>
              <div className="aw-tool-trace-detail-label">{detail.label}</div>
              <p>{detail.body}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function toggleCollapsedCards(cards: Record<string, boolean>, key: string): Record<string, boolean> {
  return { ...cards, [key]: !(cards[key] ?? true) };
}

function renderTurnEvent(
  event: AgentCliDesktopTurnEvent,
  cardKey: string,
) {
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
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const handleToggleCard = (key: string) => {
    setCollapsedCards((cards) => toggleCollapsedCards(cards, key));
  };
  const visibleMessageItems = groupMessagesForTranscript(messages, showToolMessages);
  const visibleTurnEvents = turnEvents.filter((event) => isTurnEventVisible(event, showToolMessages));
  const visibleTurnEventItems = groupTurnEventsForTranscript(visibleTurnEvents);
  const empty = visibleMessageItems.length === 0 && visibleTurnEventItems.length === 0;

  useEffect(() => {
    const messageList = messageListRef.current;
    if (!messageList) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      messageList.scrollTop = messageList.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [messages, showToolMessages, turnEvents]);

  return (
    <div id="message-list" className="aw-message-list" ref={messageListRef}>
      {empty ? (
        <div className="aw-empty-state">{messages.length === 0 ? 'Select a chat or send a message to begin.' : 'Verbose mode disabled.'}</div>
      ) : null}
      {visibleMessageItems.map((item) => {
        if (item.kind === 'tool_trace') {
          const collapsed = collapsedCards[item.key] ?? true;
          return (
            <ToolTraceSection
              collapsed={collapsed}
              key={item.key}
              onToggle={() => handleToggleCard(item.key)}
              trace={item.trace}
            />
          );
        }

        const { message, index } = item;
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
      {visibleTurnEventItems.map((item) => {
        if (item.kind === 'tool_trace') {
          const collapsed = collapsedCards[item.key] ?? true;
          return (
            <ToolTraceSection
              collapsed={collapsed}
              key={item.key}
              onToggle={() => handleToggleCard(item.key)}
              trace={item.trace}
            />
          );
        }

        return renderTurnEvent(item.event, item.key);
      })}
    </div>
  );
}
