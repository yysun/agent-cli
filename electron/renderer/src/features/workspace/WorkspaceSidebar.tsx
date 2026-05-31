/**
 * Workspace Sidebar Feature
 *
 * Purpose:
 * - Render workspace status and persisted chat navigation.
 *
 * Recent changes:
 * - 2026-05-31: Removed added visible sidebar content so the React renderer matches the original static shell.
 * - 2026-05-31: Added React sidebar feature around the existing chat IPC model.
 */
import { useMemo, useState } from 'react';
import { Icon, IconButton, Input } from '../../design-system';
import type { AgentCliDesktopChatSummary } from '../../types/desktop-api';
import { formatTime, shortId } from '../../utils/format';

export interface WorkspaceSidebarProps {
  chats: AgentCliDesktopChatSummary[];
  currentChatId: string;
  messageCount: number;
  status: string;
  workspaceRoot: string;
  onCreateChat: () => void;
  onSelectChat: (chatId: string) => void;
  onSelectWorkspace: () => void;
  onCollapseSidebar: () => void;
}

export default function WorkspaceSidebar({
  chats,
  currentChatId,
  messageCount,
  status,
  workspaceRoot,
  onCreateChat,
  onSelectChat,
  onSelectWorkspace,
  onCollapseSidebar,
}: WorkspaceSidebarProps) {
  const [filterText, setFilterText] = useState('');
  const filteredChats = useMemo(() => {
    const normalizedFilter = filterText.trim().toLowerCase();
    if (!normalizedFilter) {
      return chats;
    }
    return chats.filter((chat) => chat.id.toLowerCase().includes(normalizedFilter));
  }, [chats, filterText]);

  return (
    <aside className="aw-sidebar" aria-label="Workspace and chat navigation">
      <div className="aw-window-strip">
        <IconButton id="sidebar-collapse-button" className="aw-icon-button aw-sidebar-toggle" label="Collapse sidebar" onClick={onCollapseSidebar}>
          <Icon name="sidebar-left" />
        </IconButton>
      </div>

      <section className="aw-sidebar-section" aria-labelledby="workspace-title">
        <div className="aw-section-header">
          <h1 id="workspace-title">Workspace</h1>
          <div className="aw-section-actions" aria-label="Workspace actions">
            <IconButton id="open-workspace-button" className="aw-icon-button" label="Open workspace folder" onClick={onSelectWorkspace}>
              <Icon name="folder" />
            </IconButton>
          </div>
        </div>

        <article className="aw-world-card">
          <div className="aw-world-card-header">
            <div>
              <h2>Agent CLI</h2>
              <p id="workspace-path">{workspaceRoot || 'No workspace loaded'}</p>
            </div>
            <span id="runtime-status" className="aw-state-pill aw-state-running">{status}</span>
          </div>
          <dl className="aw-world-stats">
            <div>
              <dt>Messages</dt>
              <dd id="message-count">{messageCount}</dd>
            </div>
            <div>
              <dt>Chats</dt>
              <dd id="chat-count">{chats.length}</dd>
            </div>
            <div>
              <dt>Skills</dt>
              <dd id="skills-count">UI</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="aw-sidebar-section aw-sessions-section" aria-labelledby="chats-title">
        <div className="aw-section-header">
          <h2 id="chats-title">Chats</h2>
          <IconButton id="new-chat-button" className="aw-icon-button" label="New chat" onClick={onCreateChat}>+</IconButton>
        </div>

        <label className="aw-search">
          <span className="aw-sr-only">Search chats</span>
          <span aria-hidden="true">⌕</span>
          <Input id="chat-filter" value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="filter chats" aria-label="Search chats" />
        </label>

        <div id="chat-list" className="aw-session-list" role="list">
          {filteredChats.length === 0 ? <div className="aw-empty-state">No chats yet</div> : null}
          {filteredChats.map((chat) => (
            <button
              className={`aw-session-item${chat.id === currentChatId ? ' is-active' : ''}`}
              type="button"
              role="listitem"
              key={chat.id}
              onClick={() => onSelectChat(chat.id)}
            >
              <span className="aw-session-title">{shortId(chat.id)}</span>
              <span className="aw-session-meta">{chat.messageCount ?? 0} messages{chat.updatedAt ? ` - ${formatTime(chat.updatedAt)}` : ''}</span>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}