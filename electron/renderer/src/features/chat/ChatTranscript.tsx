/**
 * Chat Transcript Feature
 *
 * Purpose:
 * - Render visible chat messages and edit actions.
 *
 * Recent changes:
 * - 2026-05-31: Added React transcript feature for Agent CLI messages.
 */
import type { AgentCliDesktopRuntimeMessage } from '../../types/desktop-api';
import { formatTime } from '../../utils/format';
import { isToolRelatedMessage, messageRoleLabel, resolveToolName, resolveToolStatus } from '../../utils/message-utils';

export interface ChatTranscriptProps {
  messages: AgentCliDesktopRuntimeMessage[];
  showToolMessages: boolean;
  onStartEdit: (index: number) => void;
}

export default function ChatTranscript({ messages, showToolMessages, onStartEdit }: ChatTranscriptProps) {
  const visibleMessages = messages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => showToolMessages || !isToolRelatedMessage(message));

  return (
    <div id="message-list" className="aw-message-list">
      {visibleMessages.length === 0 ? (
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
    </div>
  );
}