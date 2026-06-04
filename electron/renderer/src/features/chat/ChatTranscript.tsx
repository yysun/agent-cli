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
 * - 2026-06-03: Reused deterministic runtime event helpers for labels, summaries, and filtering.
 * - 2026-06-03: Added Electron runtime activity cards for CLI-like reasoning and tool display.
 * - 2026-05-31: Added React transcript feature for Agent CLI messages.
 */
import type { AgentCliDesktopRuntimeMessage, AgentCliDesktopTurnEvent } from '../../types/desktop-api';
import { formatTime } from '../../utils/format';
import { isToolRelatedMessage, messageRoleLabel, resolveToolName, resolveToolStatus } from '../../utils/message-utils';
import {
  isTurnEventVisible,
  summarizeModelResponse,
  summarizeToolCall,
  summarizeToolResult,
  toolNameFromRecord,
} from './transcript-events';

export interface ChatTranscriptProps {
  messages: AgentCliDesktopRuntimeMessage[];
  turnEvents: AgentCliDesktopTurnEvent[];
  showToolMessages: boolean;
  onStartEdit: (index: number) => void;
}

function renderTurnEvent(event: AgentCliDesktopTurnEvent, index: number) {
  if (event.type === 'reasoning') {
    return (
      <article className="aw-message aw-reasoning-card" key={`${event.createdAt}-${index}`}>
        <div className="aw-tool-dot" />
        <div className="aw-tool-body">
          <div className="aw-tool-heading">
            <span className="aw-tool-title">thinking</span>
            <span className="aw-tool-status">reasoning</span>
          </div>
          <p>{String(event.text || '').trim()}</p>
        </div>
      </article>
    );
  }

  if (event.type === 'tool_call') {
    return (
      <article className="aw-message aw-tool-card aw-tool-card-requested" key={`${event.createdAt}-${index}`}>
        <div className="aw-tool-dot" />
        <div className="aw-tool-body">
          <div className="aw-tool-heading">
            <span className="aw-tool-title">{toolNameFromRecord(event.toolCall, 'tool')}</span>
            <span className="aw-tool-status">requested</span>
          </div>
          <p>{summarizeToolCall(event.toolCall)}</p>
        </div>
      </article>
    );
  }

  if (event.type === 'tool_result') {
    return (
      <article className="aw-message aw-tool-card aw-tool-card-completed" key={`${event.createdAt}-${index}`}>
        <div className="aw-tool-dot" />
        <div className="aw-tool-body">
          <div className="aw-tool-heading">
            <span className="aw-tool-title">{toolNameFromRecord(event.toolResult, 'tool result')}</span>
            <span className="aw-tool-status">completed</span>
          </div>
          <p>{summarizeToolResult(event.toolResult)}</p>
        </div>
      </article>
    );
  }

  if (event.type === 'model_response') {
    return (
      <article className="aw-message aw-tool-card aw-model-card" key={`${event.createdAt}-${index}`}>
        <div className="aw-tool-dot" />
        <div className="aw-tool-body">
          <div className="aw-tool-heading">
            <span className="aw-tool-title">model response</span>
            <span className="aw-tool-status">runtime</span>
          </div>
          <p>{summarizeModelResponse(event.modelResponse)}</p>
        </div>
      </article>
    );
  }

  return (
    <article className={`aw-message aw-tool-card aw-tool-card-${event.type === 'error' ? 'error' : 'completed'}`} key={`${event.createdAt}-${index}`}>
      <div className="aw-tool-dot" />
      <div className="aw-tool-body">
        <div className="aw-tool-heading">
          <span className="aw-tool-title">{event.type}</span>
          <span className="aw-tool-status">runtime</span>
        </div>
        <p>{String(event.text || '').trim()}</p>
      </div>
    </article>
  );
}

export default function ChatTranscript({ messages, turnEvents, showToolMessages, onStartEdit }: ChatTranscriptProps) {
  const visibleMessages = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => showToolMessages || !isToolRelatedMessage(message));
  const visibleTurnEvents = turnEvents.filter((event) => isTurnEventVisible(event, showToolMessages));
  const empty = visibleMessages.length === 0 && visibleTurnEvents.length === 0;

  return (
    <div id="message-list" className="aw-message-list">
      {empty ? (
        <div className="aw-empty-state">{messages.length === 0 ? 'Select a chat or send a message to begin.' : 'Tool messages hidden.'}</div>
      ) : null}
      {visibleMessages.map(({ message, index }) => {
        if (isToolRelatedMessage(message)) {
          const status = resolveToolStatus(message);
          return (
            <article className={`aw-message aw-tool-card aw-tool-card-${status}`} key={`${index}-${message.role || 'tool'}`}>
              <div className="aw-tool-dot" />
              <div className="aw-tool-body">
                <div className="aw-tool-heading">
                  <span className="aw-tool-title">{resolveToolName(message)}</span>
                  <span className="aw-tool-status">{status}</span>
                </div>
                <p>{String(message.content || '').trim() || (status === 'requested' ? 'Waiting for tool result.' : 'No tool output.')}</p>
              </div>
            </article>
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
      {visibleTurnEvents.map(renderTurnEvent)}
    </div>
  );
}
