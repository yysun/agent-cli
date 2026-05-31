/**
 * Workspace Sidebar Feature
 *
 * Purpose:
 * - Render workspace status and persisted chat navigation.
 *
 * Recent changes:
 * - 2026-05-31: Added runtime provider and model to the workspace summary card.
 * - 2026-05-31: Replaced the Skills/UI summary stat with the `world.json` workflow type.
 * - 2026-05-31: Showed the workspace folder name as the summary card title.
 * - 2026-05-31: Hid the ready status chip unless workspace `world.json` exists.
 * - 2026-05-31: Showed world workflow type and agent count explicitly in the sidebar summary.
 * - 2026-05-31: Displayed optional `.agent-world/world.json` summary metadata in the workspace card.
 * - 2026-05-31: Removed added visible sidebar content so the React renderer matches the original static shell.
 * - 2026-05-31: Added React sidebar feature around the existing chat IPC model.
 */
import { useMemo, useState } from 'react';
import { Icon, IconButton, Input } from '../../design-system';
import type {
  AgentCliDesktopChatSummary,
  AgentCliDesktopRuntimeSummary,
  AgentCliDesktopWorldSummary,
} from '../../types/desktop-api';
import { formatTime, shortId, workspaceFolderName } from '../../utils/format';

export interface WorkspaceSidebarProps {
  chats: AgentCliDesktopChatSummary[];
  currentChatId: string;
  messageCount: number;
  runtimeSummary: AgentCliDesktopRuntimeSummary;
  status: string;
  worldSummary: AgentCliDesktopWorldSummary | null;
  worldSummaryWarning: string;
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
  runtimeSummary,
  status,
  worldSummary,
  worldSummaryWarning,
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
  const hasWorldConfig = Boolean(worldSummary || worldSummaryWarning);
  const workspaceTitle = workspaceFolderName(workspaceRoot);
  const workflowType = worldSummary?.workflow || 'Not set';
  const workflowStat = worldSummaryWarning ? 'Check JSON' : hasWorldConfig ? workflowType : 'No world';
  const worldAgentCount = worldSummary?.agents.length ?? 0;
  const runtimeProvider = runtimeSummary.provider || 'Not set';
  const runtimeModel = runtimeSummary.model || 'Not set';

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
              <h2>{workspaceTitle}</h2>
              <p id="workspace-path">{workspaceRoot || 'No workspace loaded'}</p>
            </div>
            {hasWorldConfig ? <span id="runtime-status" className="aw-state-pill aw-state-running">{status}</span> : null}
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
              <dt>Workflow</dt>
              <dd id="workflow-type">{workflowStat}</dd>
            </div>
          </dl>
          <div className="aw-runtime-summary aw-world-summary-facts" aria-label="Runtime provider and model">
            <div>
              <span>Provider</span>
              <strong>{runtimeProvider}</strong>
            </div>
            <div>
              <span>Model</span>
              <strong>{runtimeModel}</strong>
            </div>
          </div>
          {hasWorldConfig ? (
            <div id="world-summary" className={`aw-world-summary${worldSummaryWarning ? ' is-warning' : ''}`}>
              <div className="aw-world-summary-header">
                <span>World</span>
                <span>{worldSummaryWarning ? 'Check JSON' : 'Detected'}</span>
              </div>
              {worldSummaryWarning ? (
                <p>{worldSummaryWarning}</p>
              ) : (
                <>
                  <div className="aw-world-summary-facts">
                    <div>
                      <span>Workflow</span>
                      <strong>{workflowType}</strong>
                    </div>
                    <div>
                      <span>Agents</span>
                      <strong>{worldAgentCount}</strong>
                    </div>
                  </div>
                  {worldSummary?.agents.length ? (
                    <div className="aw-world-agent-list" aria-label="World agents">
                      {worldSummary.agents.slice(0, 4).map((agent) => (
                        <span key={agent}>{agent}</span>
                      ))}
                      {worldSummary.agents.length > 4 ? <span>+{worldSummary.agents.length - 4}</span> : null}
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
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